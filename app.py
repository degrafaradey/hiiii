"""Квиз как Telegram Mini App.

Один процесс делает две вещи:
  1) принимает апдейты Telegram по вебхуку (/webhook);
  2) отдаёт веб-приложение (папка static) и его API (/api/*).

Вся логика проверки ответов — в quiz.py, настройки — в config.py.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import urllib.parse
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    Update,
    WebAppInfo,
)
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import quiz
from config import (
    ADMIN_ID,
    ALLOW_INSECURE_DEV,
    BOT_TOKEN,
    DEEPSEEK_API_KEY,
    DEV_USER_ID,
    MODE,
    PRIZE_IMAGE_PATH,
    WEBAPP_URL,
    WEBHOOK_PATH,
    WEBHOOK_SECRET,
)

logging.basicConfig(level=logging.INFO)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_DIR = os.path.join(BASE_DIR, "media")

if not BOT_TOKEN:
    raise RuntimeError(
        "BOT_TOKEN не задан. Создай файл .env рядом с app.py и пропиши там "
        "BOT_TOKEN=твой_токен (см. .env.example)."
    )
if not ADMIN_ID:
    logging.warning(
        "ADMIN_ID не задан — пересылка сообщений и уведомления админу работать не будут."
    )
if not DEEPSEEK_API_KEY:
    logging.info(
        "DEEPSEEK_API_KEY не задан — проверка ответов через DeepSeek отключена "
        "(останется только локальная проверка + кнопка ручного зачёта)."
    )
if not os.path.exists(PRIZE_IMAGE_PATH):
    logging.warning(
        f"Файл {PRIZE_IMAGE_PATH!r} не найден рядом с app.py — финальный экран "
        "покажется БЕЗ картинки. Проверь, что файл реально загружен и имя "
        "совпадает по регистру (Linux их различает!)."
    )
if MODE == "webhook" and not WEBAPP_URL.startswith("https://"):
    logging.warning(
        "WEBAPP_URL не задан или не https — Telegram не сможет открыть Mini App "
        "и поставить вебхук. Для локальной отладки поставь MODE=polling."
    )

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# ============================================================
#  СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЕЙ (в памяти)
# ============================================================

@dataclass
class UserProgress:
    active: bool = True
    step: int = 0
    answers: list = field(default_factory=list)
    # asking — ждём ответ; verdict — показываем «верно» и кнопку «дальше»;
    # pending — ответ ушёл админу на проверку; finished — квиз пройден.
    status: str = "asking"
    message: str = ""          # текст экрана вердикта
    pending_answer: str = ""   # что именно проверяет админ


user_progress: dict[int, UserProgress] = {}

# Связь: id сообщения у админа -> id пользователя, которому нужно ответить
# (используется для функции «ответить через Reply»)
forward_map: dict[int, int] = {}


# ============================================================
#  ПРОВЕРКА ПОДПИСИ TELEGRAM WEB APP
# ============================================================

def parse_init_data(init_data: str) -> dict | None:
    """Проверяет подпись initData и возвращает данные пользователя."""
    try:
        pairs = urllib.parse.parse_qsl(init_data, strict_parsing=True)
    except ValueError:
        return None

    data = dict(pairs)
    received_hash = data.pop("hash", None)
    if not received_hash:
        return None

    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calculated = hmac.new(
        secret_key, check_string.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated, received_hash):
        return None

    try:
        return json.loads(data.get("user", "{}"))
    except json.JSONDecodeError:
        return None


def resolve_user(init_data: str | None) -> dict:
    """Достаёт пользователя из заголовка X-Init-Data (или dev-режим)."""
    if init_data:
        user = parse_init_data(init_data)
        if user and user.get("id"):
            return user

    if ALLOW_INSECURE_DEV and DEV_USER_ID:
        return {"id": DEV_USER_ID, "first_name": "dev"}

    raise HTTPException(status_code=401, detail="Открывай квиз через Telegram 🙂")


# ============================================================
#  СБОРКА СОСТОЯНИЯ ДЛЯ ФРОНТА
# ============================================================

def media_url(name: str | None) -> str | None:
    if not name:
        return None
    return f"/media/{name}"


def question_payload(index: int) -> dict:
    q = quiz.QUESTIONS[index]
    return {
        "index": index,
        "number": index + 1,
        "text": q["text"],
        "photo": media_url(q.get("photo")),
        "video": media_url(q.get("video")),
    }


def state_payload(user_id: int) -> dict:
    progress = user_progress.get(user_id)
    total = len(quiz.QUESTIONS)

    if progress is None:
        return {
            "status": "intro",
            "step": 0,
            "total": total,
            "welcome": quiz.WELCOME_TEXT_WEB,
        }

    payload = {
        "status": progress.status,
        "step": progress.step,
        "total": total,
        "welcome": quiz.WELCOME_TEXT_WEB,
        "message": progress.message,
    }

    if progress.status in ("asking", "pending"):
        payload["question"] = question_payload(progress.step)
    if progress.status == "verdict":
        payload["question"] = question_payload(progress.step)
        payload["last"] = progress.step + 1 >= total
    if progress.status == "finished":
        payload["final"] = {
            "text": quiz.FINAL_TEXT,
            "caption": quiz.FINAL_CAPTION_EN,
            "image": "/media/prize" if os.path.exists(PRIZE_IMAGE_PATH) else None,
        }

    return payload


# ============================================================
#  ЗАЧЁТ ОТВЕТА
# ============================================================

def accept_answer(user_id: int) -> None:
    """Помечает текущий вопрос пройденным и показывает персональный текст."""
    progress = user_progress[user_id]
    progress.status = "verdict"
    progress.message = quiz.QUESTIONS[progress.step]["correct_message"]
    progress.pending_answer = ""


async def notify_admin(user_id: int, username: str | None, text: str):
    """Уведомление админу о неоднозначном ответе. Reply на это сообщение
    уходит человеку напрямую, кнопка — засчитывает ответ."""
    if not ADMIN_ID:
        return
    index = user_progress[user_id].step
    question = quiz.QUESTIONS[index]
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Засчитать ответ", callback_data=f"accept:{user_id}")]
        ]
    )
    sent = await bot.send_message(
        ADMIN_ID,
        f"❓ Пользователь @{username or user_id} ответил на вопрос {index + 1}:\n\n"
        f"«{question['text']}»\n\n"
        f"Ответ: {text}\n\n"
        f"Если это на самом деле правильно — нажми кнопку ниже, или сделай "
        f"Reply на это сообщение, чтобы просто написать человеку напрямую.",
        reply_markup=keyboard,
    )
    forward_map[sent.message_id] = user_id


async def send_final_to_chat(user_id: int):
    """Дублируем финал в чат — чтобы приз остался в переписке навсегда."""
    try:
        await bot.send_message(user_id, quiz.FINAL_TEXT, parse_mode="HTML")
        if os.path.exists(PRIZE_IMAGE_PATH):
            await bot.send_photo(
                user_id, FSInputFile(PRIZE_IMAGE_PATH), caption=quiz.FINAL_CAPTION_EN
            )
        else:
            await bot.send_message(user_id, quiz.FINAL_CAPTION_EN)
    except Exception as e:
        logging.warning(f"Не удалось отправить финал в чат: {e}")


# ============================================================
#  API ВЕБ-ПРИЛОЖЕНИЯ
# ============================================================

class AnswerIn(BaseModel):
    answer: str = ""


@asynccontextmanager
async def lifespan(_: FastAPI):
    if MODE == "polling":
        await bot.delete_webhook(drop_pending_updates=True)
        task = asyncio.create_task(dp.start_polling(bot))
        logging.info("Бот запущен в режиме polling (отладка).")
    else:
        task = None
        if WEBAPP_URL.startswith("https://"):
            await bot.set_webhook(
                f"{WEBAPP_URL}{WEBHOOK_PATH}",
                secret_token=WEBHOOK_SECRET,
                drop_pending_updates=True,
                allowed_updates=dp.resolve_used_update_types(),
            )
            logging.info(f"Вебхук установлен: {WEBAPP_URL}{WEBHOOK_PATH}")

    if WEBAPP_URL.startswith("https://"):
        try:
            await bot.set_chat_menu_button(
                menu_button=MenuButtonWebApp(
                    text="Открыть квиз", web_app=WebAppInfo(url=WEBAPP_URL)
                )
            )
        except Exception as e:
            logging.warning(f"Не удалось поставить кнопку меню: {e}")

    yield

    if task:
        task.cancel()
    await bot.session.close()


app = FastAPI(lifespan=lifespan)


@app.post(WEBHOOK_PATH)
async def telegram_webhook(request: Request):
    if request.headers.get("X-Telegram-Bot-Api-Secret-Token") != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="bad secret")
    update = Update.model_validate(await request.json(), context={"bot": bot})
    await dp.feed_update(bot, update)
    return {"ok": True}


@app.get("/api/state")
async def api_state(x_init_data: str | None = Header(default=None)):
    user = resolve_user(x_init_data)
    return state_payload(user["id"])


@app.post("/api/start")
async def api_start(x_init_data: str | None = Header(default=None)):
    user = resolve_user(x_init_data)
    user_progress[user["id"]] = UserProgress(active=True, step=0, status="asking")
    return state_payload(user["id"])


@app.post("/api/next")
async def api_next(x_init_data: str | None = Header(default=None)):
    user = resolve_user(x_init_data)
    user_id = user["id"]
    progress = user_progress.get(user_id)
    if progress is None or progress.status != "verdict":
        return state_payload(user_id)

    progress.step += 1
    progress.message = ""
    if progress.step >= len(quiz.QUESTIONS):
        progress.active = False
        progress.status = "finished"
        asyncio.create_task(send_final_to_chat(user_id))
    else:
        progress.status = "asking"
    return state_payload(user_id)


@app.post("/api/answer")
async def api_answer(payload: AnswerIn, x_init_data: str | None = Header(default=None)):
    user = resolve_user(x_init_data)
    user_id = user["id"]
    text = (payload.answer or "").strip()

    progress = user_progress.get(user_id)
    if progress is None or progress.status != "asking":
        return {"result": "state", "notice": None, "state": state_payload(user_id)}

    if not text:
        return {
            "result": "empty",
            "notice": "Напиши ответ — даже неуверенный вариант подойдёт.",
            "state": state_payload(user_id),
        }

    index = progress.step
    question = quiz.QUESTIONS[index]

    # --- Спец-логика для вопроса «что нравится в тебе» ---
    if index == quiz.Q5_INDEX:
        negative = quiz.is_self_deprecating_local(text)
        if not negative and DEEPSEEK_API_KEY:
            negative = await quiz.ask_deepseek_self_deprecating(text)

        if negative:
            return {
                "result": "retry",
                "notice": quiz.NEGATIVE_RESPONSE_TEXT,
                "state": state_payload(user_id),
            }

        progress.answers.append(text)
        accept_answer(user_id)
        return {"result": "correct", "notice": None, "state": state_payload(user_id)}

    # --- Обычные вопросы: сначала локальная проверка ---
    checker = question["checker"]
    if checker and checker(text):
        progress.answers.append(text)
        accept_answer(user_id)
        return {"result": "correct", "notice": None, "state": state_payload(user_id)}

    # --- Локальная проверка не прошла -> пробуем DeepSeek ---
    if DEEPSEEK_API_KEY and question["criteria_for_ai"]:
        if await quiz.ask_deepseek_correct(question["criteria_for_ai"], text):
            progress.answers.append(text)
            accept_answer(user_id)
            return {"result": "correct", "notice": None, "state": state_payload(user_id)}

    # --- Ни локальная проверка, ни ИИ не подтвердили -> зовём админа ---
    progress.status = "pending"
    progress.pending_answer = text
    progress.message = quiz.PENDING_TEXT
    await notify_admin(user_id, user.get("username"), text)
    return {"result": "pending", "notice": None, "state": state_payload(user_id)}


@app.post("/api/cancel")
async def api_cancel(x_init_data: str | None = Header(default=None)):
    """Забрать ответ с проверки и попробовать снова."""
    user = resolve_user(x_init_data)
    progress = user_progress.get(user["id"])
    if progress and progress.status == "pending":
        progress.status = "asking"
        progress.message = ""
        progress.pending_answer = ""
    return state_payload(user["id"])


@app.get("/media/prize")
async def media_prize():
    if not os.path.exists(PRIZE_IMAGE_PATH):
        raise HTTPException(status_code=404, detail="нет картинки")
    return FileResponse(PRIZE_IMAGE_PATH)


@app.get("/media/{name}")
async def media_file(name: str):
    path = os.path.join(MEDIA_DIR, os.path.basename(name))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="нет файла")
    return FileResponse(path)


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# ============================================================
#  ХЕНДЛЕРЫ БОТА
# ============================================================

@dp.message(CommandStart())
async def start_quiz(message: Message):
    logging.info(f"/start от user_id={message.from_user.id}")
    keyboard = None
    if WEBAPP_URL.startswith("https://"):
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(
                    text="Открыть квиз 💗", web_app=WebAppInfo(url=WEBAPP_URL)
                )]
            ]
        )
    await message.answer(quiz.WELCOME_TEXT, reply_markup=keyboard)


@dp.callback_query(F.data.startswith("accept:"))
async def admin_accept(callback: CallbackQuery):
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("Эта кнопка только для админа.", show_alert=True)
        return

    target_user_id = int(callback.data.split(":")[1])
    progress = user_progress.get(target_user_id)
    if progress is None or not progress.active or progress.status != "pending":
        await callback.answer("Этот ответ уже не ждёт проверки.", show_alert=True)
        return

    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Зачтено ✅")

    progress.answers.append(progress.pending_answer)
    accept_answer(target_user_id)

    try:
        await bot.send_message(
            target_user_id, "✅ Ответ засчитан! Возвращайся в квиз 💗"
        )
    except Exception as e:
        logging.warning(f"Не смог уведомить пользователя: {e}")


# --- Живой чат: админ отвечает пользователю через Reply на любое ---
# --- сообщение бота, которое связано с этим пользователем ---
@dp.message(F.chat.id == ADMIN_ID, F.reply_to_message)
async def admin_reply(message: Message):
    replied_id = message.reply_to_message.message_id
    target_user_id = forward_map.get(replied_id)

    if target_user_id is None:
        await message.answer(
            "⚠️ Не нашёл, кому переслать этот ответ (сообщение слишком старое "
            "или это был не пересланный вопрос/уведомление)."
        )
        return

    try:
        if message.photo:
            await bot.send_photo(
                target_user_id, message.photo[-1].file_id, caption=message.caption or ""
            )
        elif message.video:
            await bot.send_video(
                target_user_id, message.video.file_id, caption=message.caption or ""
            )
        else:
            await bot.send_message(target_user_id, message.text or "")
        await message.answer("✅ Отправлено пользователю")
    except Exception as e:
        await message.answer(f"❌ Не удалось отправить: {e}")


@dp.message()
async def handle_message(message: Message):
    """Ответы теперь принимает веб-приложение, поэтому обычные сообщения —
    это живой чат: пересылаем их админу."""
    user_id = message.from_user.id
    if user_id == ADMIN_ID or not ADMIN_ID:
        return
    forwarded = await bot.forward_message(ADMIN_ID, message.chat.id, message.message_id)
    forward_map[forwarded.message_id] = user_id


# Статика монтируется последней, чтобы не перехватывать /api и /webhook.
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "static"), html=True))
