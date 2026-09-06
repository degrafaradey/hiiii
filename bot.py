import asyncio
import difflib
import logging
import os
import re
from dataclasses import dataclass, field

import aiohttp
from dotenv import load_dotenv
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import (
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

# ============================================================
#  НАСТРОЙКИ
# ============================================================

load_dotenv()  # подтягивает переменные из файла .env (если он есть рядом с bot.py)

BOT_TOKEN = os.getenv("BOT_TOKEN", "ВСТАВЬ_СЮДА_ТОКЕН_ОТ_BOTFATHER")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))  # твой числовой Telegram ID

# Ключ DeepSeek. Если не задан — работает только локальная проверка + ручной зачёт.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

# Картинка финального приза. ВАЖНО: имя файла регистрозависимо на Railway (Linux)!
# Если файл называется "Prize.JPG" или лежит не рядом с bot.py — он не найдётся.
PRIZE_IMAGE_PATH = "prize.jpg"

FINAL_CAPTION_EN = (
    "Expect new surprises and surprises for your efforts, "
    "this is just the beginning, sweetie😉"
)

FINAL_TEXT = (
    "УРАААА, СОЛНЫШКООО!! ТЫ СПРАВИЛАСЬ АБСОЛЮТНО СО ВСЕМИ ВОПРОСАМИ. "
    "Я горжусь тобой, и я горжусь тем что ты позанималась целые три часаааа "
    "экономикой ета блин так-то очень круто!! Ты возвращаешься в темп, и "
    "чтобы подогревать твой интерес к экономике - нужно от неё получать "
    "положительные бонусы ихмхихих. За твой труд, часы занятий ею, и эти "
    "вопросы я скину тебе <b>1111</b> руплей. Дальше больше, это не "
    "последний сюрприз за твои занятие, тебя за твои старания в будущем "
    "будет ждать еще кое-что, <b>еще раз знай что я очень горжусь, и что я "
    "безумно люблю тебя, солнышко.</b> ихмхмхихих"
    "💗💖💗💕💗💖💗💕💗💖💗💕💗💖💗 ;З"
)

WELCOME_TEXT = (
    "Вауу, привееет! 👀 За твои целых три часа экономики тебя кое-что ждёт... "
    "Но чтобы доказать, что ты и правда умница-топчик, нужно ответить на "
    "несколько вопросов. Погнали? Пиши что угодно, чтобы начать 👇"
)

logging.basicConfig(level=logging.INFO)

if not BOT_TOKEN or BOT_TOKEN == "ВСТАВЬ_СЮДА_ТОКЕН_ОТ_BOTFATHER":
    raise RuntimeError(
        "BOT_TOKEN не задан. Создай файл .env рядом с bot.py и пропиши там "
        "BOT_TOKEN=твой_токен (см. .env.example)."
    )
if not ADMIN_ID:
    logging.warning(
        "ADMIN_ID не задан — пересылка сообщений и уведомления админу работать не будут."
    )
if not DEEPSEEK_API_KEY:
    logging.info(
        "DEEPSEEK_API_KEY не задан — проверка ответов через DeepSeek отключена "
        "(останется только локальная проверка + твоя кнопка ручного зачёта)."
    )
if not os.path.exists(PRIZE_IMAGE_PATH):
    logging.warning(
        f"Файл {PRIZE_IMAGE_PATH!r} не найден рядом с bot.py — финальное "
        "сообщение уйдёт БЕЗ картинки. Проверь, что файл реально загружен "
        "в репозиторий и имя совпадает по регистру (Linux их различает!)."
    )

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


# ============================================================
#  ЛОКАЛЬНЫЕ ПРОВЕРЯЛЬЩИКИ ОТВЕТОВ
#  (принимают огромное количество вариаций написания)
# ============================================================

def fuzzy_contains(text: str, variants: list[str], threshold: float = 0.8) -> bool:
    """True, если текст содержит один из вариантов (точно или близко по написанию)."""
    t = text.lower()
    for v in variants:
        if v in t:
            return True
        if difflib.SequenceMatcher(None, t, v).ratio() >= threshold:
            return True
    return False


def check_q1_elasticity(text: str) -> bool:
    """Принимает 1.5 / 1,5 / |1,5| / 1,5 по модулю / (1.5) и т.д."""
    t = text.lower()
    t = t.replace("по модулю", "").replace("модуль", "").replace("abs", "")
    t = t.replace("|", "").replace("(", "").replace(")", "")
    t = t.replace(",", ".")
    t = re.sub(r"[^0-9.\-]", "", t)
    if not t:
        return False
    try:
        value = float(t)
    except ValueError:
        return False
    return abs(abs(value) - 1.5) < 0.05


def check_q2_house(text: str) -> bool:
    variants = ["эрик форман", "erik forman", "eric foreman", "форман", "foreman"]
    t = text.lower().replace("ё", "е")
    return fuzzy_contains(t, variants, threshold=0.75)


def check_q3_odyssey_songs(text: str) -> bool:
    song1 = ["full speed ahead", "full spead ahead", "фулл спид эхэд"]
    song2 = [
        "would you fall in love with me again",
        "would you fall in love with me",
        "фол ин лав виз ми эгейн",
    ]
    t = text.lower()
    has1 = fuzzy_contains(t, song1, threshold=0.7)
    has2 = fuzzy_contains(t, song2, threshold=0.7)
    return has1 and has2


def check_q4_trio(text: str) -> bool:
    t = text.lower()
    has_anime = "евангелион" in t or "evangelion" in t
    has_hero = "человек-паук" in t or "человек паук" in t or "spider" in t
    has_singer = "ksb" in t or "ксб" in t
    return has_anime and has_hero and has_singer


# Корни слов вместо целых слов — так ловятся любые формы и опечатки:
# "жирная", "жирный", "жирни", "жирнааа" и т.д. — всё содержит корень "жирн".
NEGATIVE_ROOTS = [
    "жирн", "толст", "страшн", "уродл", "глуп", "туп", "дур",
    "плох", "ужасн", "никчемн", "бездар", "неудачни", "дающ",
    "мерзк", "отвратительн", "некрасив",
]


def is_self_deprecating_local(text: str) -> bool:
    t = text.lower()
    return any(root in t for root in NEGATIVE_ROOTS)


def check_q6_i_am(text: str) -> bool:
    t = text.lower().strip().strip('"').strip("“”")
    return "to this episode" in t


# ============================================================
#  ВОПРОСЫ
#  correct_message — твой персональный текст при верном ответе
#  photo_path / video_path — необязательное медиа к вопросу
# ============================================================

Q5_TEXT = (
    "Чтобы ты ни ответила на этот вопрос (помимо плохих слов, блин, нафиг "
    "блин) — оно будет правдой!! Я <b><u>люблю тебя</u></b> и за твою "
    "невероятную красоту, и за то что ты у меня невероятно умна, за то что "
    "ты очень элегантна и женственна, милая и очень добрая. Я "
    "<b><u>люблю тебя</u></b> и за твои невероятно красивые глазки, и за "
    "твои шутки, юмор вцелом, подъебы, я <b><u>люблю тебя</u></b> за тысячу "
    "вещей, и при этом <b><u>люблю тебя</u></b> просто потому что ты есть, "
    "спасибо тебе за то что ты появилась в моей жизни🤭💗"
)

QUESTIONS = [
    {
        "text": "Если цена выросла на 10%, а объём спроса упал на 15%, чему равен "
                "коэффициент эластичности спроса по цене?",
        "checker": check_q1_elasticity,
        "criteria_for_ai": "Правильный ответ — коэффициент эластичности по модулю равен 1.5 "
                            "(допустимы любые форматы записи числа 1.5 или 1,5, знак минус можно "
                            "игнорировать, так как речь о модуле).",
        "correct_message": "ЮХУХУЗУХУХ ЛЮБИМИИ ЕТА ВЕРНАА!! никогда не сомневался в тебе, "
                            "двигаем дальше :3",
        "photo_path": None,
        "video_path": None,
    },
    {
        "text": "Кто из команды Хауса дольше всех проработал у него без увольнений, "
                "и в какой серии он впервые появился?",
        "checker": check_q2_house,
        "criteria_for_ai": "Правильный ответ — Эрик Форман (Eric Foreman). Приемлемы опечатки "
                            "и разные варианты написания имени/фамилии.",
        "correct_message": "я люблю формана, он чорни, прям как я!! вообщем ты снова права "
                            "ихихихмхмх мая умничкааа",
        "photo_path": None,
        "video_path": None,
    },
    {
        "text": "В какой песне впервые звучит мотив (лейтмотив) Пенелопы, и в какой "
                "песне этот же мотив используется как намёк на то, что Одиссей "
                "наконец узнаёт её?",
        "checker": check_q3_odyssey_songs,
        "criteria_for_ai": 'Правильный ответ должен упоминать ОБЕ песни: "Full Speed Ahead" '
                            'и "Would You Fall in Love with Me Again". Порядок не важен, '
                            "опечатки допустимы.",
        "correct_message": "ПЕНЕЛАПИИИИИ, ты метишь прямо в точку любимиии!!✅✅",
        "photo_path": None,
        "video_path": None,
    },
    {
        "text": "Любимое аниме Артёма, супергерой Ани, и исполнитель Саши "
                "(порядок не важен):",
        "checker": check_q4_trio,
        "criteria_for_ai": "Правильный ответ должен содержать все три пункта: "
                            "аниме — Евангелион (Evangelion), супергерой — Человек-паук "
                            "(Spider-Man), исполнитель — KSB music (Ксб мьюзик). "
                            "Порядок не важен.",
        "correct_message": "ОГО ТЫ ВАЩЕ КРУТАЯ ШТОЛЕ, ТЫ БЛИН РЯЛ ОЧЕНЬ ХОРОШО ЗНАЕШЬ НАС!!",
        "photo_path": None,
        "video_path": None,
    },
    {
        "text": "Что Артёму больше всего нравится в тебе?",
        "checker": None,  # спец-логика ниже (self-deprecation check + DeepSeek)
        "criteria_for_ai": None,
        "correct_message": Q5_TEXT,
        "photo_path": None,
        "video_path": None,
    },
    {
        "text": "I am?...",
        "checker": check_q6_i_am,
        "criteria_for_ai": 'Правильный ответ — "I am to this episode" или просто '
                            '"to this episode" в любом написании/регистре.',
        "correct_message": "ОГО, УИЛСОН ЧТО-ЛИ ТОЖЕ ЗДЕСЬ????",
        "photo_path": None,
        "video_path": None,
    },
]

Q5_INDEX = 4  # индекс вопроса "что нравится в тебе"

NEGATIVE_RESPONSE_TEXT = (
    "НЕТ. Чтобы ты ни написала — это неправда, ведь Артёму нравится в тебе "
    "всё: и красота, и ум, и ещё очень много причин, ты сама прекрасно "
    "знаешь 💗 Попробуй ответить ещё раз:"
)


# ============================================================
#  СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЕЙ (в памяти)
# ============================================================

@dataclass
class UserProgress:
    active: bool = True
    step: int = 0
    answers: list = field(default_factory=list)


user_progress: dict[int, UserProgress] = {}

# Связь: id сообщения у админа -> id пользователя, которому нужно ответить
# (используется для функции "ответить через Reply")
forward_map: dict[int, int] = {}


# ============================================================
#  DEEPSEEK
# ============================================================

async def _call_deepseek(system_prompt: str, user_prompt: str) -> str | None:
    if not DEEPSEEK_API_KEY:
        return None

    payload = {
        "model": "deepseek-chat",
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                DEEPSEEK_URL, json=payload, headers=headers, timeout=15
            ) as resp:
                data = await resp.json()
                return data["choices"][0]["message"]["content"].strip().upper()
    except Exception as e:
        logging.warning(f"DeepSeek call failed: {e}")
        return None


async def ask_deepseek_correct(criteria: str, user_answer: str) -> bool:
    """Для обычных вопросов: проверяет, соответствует ли ответ критерию."""
    system_prompt = (
        "Ты — строгий проверяющий тестовых ответов. Тебе дают критерий "
        "правильного ответа и ответ пользователя. Ответь ТОЛЬКО одним "
        "словом: YES, если ответ пользователя по сути соответствует "
        "критерию (даже если есть опечатки, другой порядок слов, "
        "неполное совпадение формулировок) — или NO, если не соответствует."
    )
    user_prompt = f"Критерий правильного ответа: {criteria}\nОтвет пользователя: {user_answer}"
    result = await _call_deepseek(system_prompt, user_prompt)
    return bool(result) and result.startswith("YES")


async def ask_deepseek_self_deprecating(user_answer: str) -> bool:
    """
    Для вопроса 'что Артёму нравится в тебе': проверяет, является ли ответ
    самоуничижительным/негативным о себе (а не просто нейтральным/позитивным).
    """
    system_prompt = (
        "Ты помогаешь модерировать ответы в романтическом квизе. Пользователь "
        "отвечает на вопрос 'Что твоему парню больше всего нравится в тебе?'. "
        "Определи, является ли ответ САМОУНИЧИЖИТЕЛЬНЫМ или НЕГАТИВНЫМ по "
        "отношению к самой себе (например: называет себя толстой, некрасивой, "
        "плохой, глупой, никчёмной и т.п. — в любой форме, включая сленг, "
        "мат, сокращения и опечатки). Ответь ТОЛЬКО одним словом: "
        "NEGATIVE, если ответ негативный/самоуничижительный, "
        "или POSITIVE, если ответ нейтральный, позитивный или комплиментарный "
        "по отношению к себе."
    )
    result = await _call_deepseek(system_prompt, f"Ответ пользователя: {user_answer}")
    return result == "NEGATIVE"


# ============================================================
#  ВСПОМОГАТЕЛЬНОЕ
# ============================================================

def admin_override_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Засчитать ответ", callback_data=f"accept:{user_id}")]
        ]
    )


async def send_question(user_id: int, index: int):
    q = QUESTIONS[index]
    if q.get("photo_path") and os.path.exists(q["photo_path"]):
        await bot.send_photo(user_id, FSInputFile(q["photo_path"]), caption=q["text"])
    elif q.get("video_path") and os.path.exists(q["video_path"]):
        await bot.send_video(user_id, FSInputFile(q["video_path"]), caption=q["text"])
    else:
        await bot.send_message(user_id, q["text"])


async def finish_quiz(user_id: int):
    await bot.send_message(user_id, FINAL_TEXT, parse_mode="HTML")
    if os.path.exists(PRIZE_IMAGE_PATH):
        await bot.send_photo(
            user_id, FSInputFile(PRIZE_IMAGE_PATH), caption=FINAL_CAPTION_EN
        )
    else:
        logging.warning(f"{PRIZE_IMAGE_PATH!r} не найден при отправке финала — шлю без фото.")
        await bot.send_message(user_id, FINAL_CAPTION_EN)


async def advance_user(user_id: int, just_answered_index: int):
    """Засчитать вопрос just_answered_index верным, показать кастомное 'Верно!' и перейти дальше."""
    progress = user_progress[user_id]
    correct_message = QUESTIONS[just_answered_index]["correct_message"]
    await bot.send_message(user_id, correct_message, parse_mode="HTML")

    progress.step += 1
    if progress.step >= len(QUESTIONS):
        progress.active = False
        await finish_quiz(user_id)
    else:
        await send_question(user_id, progress.step)


async def notify_admin(user_id: int, username: str | None, text: str):
    """Отправляет админу уведомление о неоднозначном ответе и запоминает,
    кому отвечать, если админ сделает Reply на это сообщение."""
    if not ADMIN_ID:
        return
    index = user_progress[user_id].step
    question = QUESTIONS[index]
    sent = await bot.send_message(
        ADMIN_ID,
        f"❓ Пользователь @{username or user_id} ответил на вопрос {index + 1}:\n\n"
        f"«{question['text']}»\n\n"
        f"Ответ: {text}\n\n"
        f"Если это на самом деле правильно — нажми кнопку ниже, или сделай "
        f"Reply на это сообщение, чтобы просто написать человеку напрямую.",
        reply_markup=admin_override_keyboard(user_id),
    )
    forward_map[sent.message_id] = user_id


# ============================================================
#  ХЕНДЛЕРЫ
# ============================================================

@dp.message(CommandStart())
async def start_quiz(message: Message):
    user_progress[message.from_user.id] = UserProgress(active=True, step=0)
    logging.info(f"DEBUG /start from user_id={message.from_user.id}, progress created")
    await message.answer(WELCOME_TEXT)
    await send_question(message.from_user.id, 0)


@dp.callback_query(F.data.startswith("accept:"))
async def admin_accept(callback: CallbackQuery):
    if callback.from_user.id != ADMIN_ID:
        await callback.answer("Эта кнопка только для админа.", show_alert=True)
        return

    target_user_id = int(callback.data.split(":")[1])
    if target_user_id not in user_progress or not user_progress[target_user_id].active:
        await callback.answer("Квиз этого пользователя уже неактивен.", show_alert=True)
        return

    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Зачтено ✅")
    just_answered = user_progress[target_user_id].step
    await advance_user(target_user_id, just_answered)


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
            await bot.send_photo(target_user_id, message.photo[-1].file_id, caption=message.caption or "")
        elif message.video:
            await bot.send_video(target_user_id, message.video.file_id, caption=message.caption or "")
        else:
            await bot.send_message(target_user_id, message.text or "")
        await message.answer("✅ Отправлено пользователю")
    except Exception as e:
        await message.answer(f"❌ Не удалось отправить: {e}")


@dp.message()
async def handle_message(message: Message):
    user_id = message.from_user.id
    text = message.text or ""

    progress = user_progress.get(user_id)

    logging.info(
        f"DEBUG incoming message from user_id={user_id} (ADMIN_ID={ADMIN_ID}) "
        f"text={text!r} progress={progress}"
    )

    # --- Пользователь не в квизе -> это "живой чат", пересылаем админу ---
    if progress is None or not progress.active:
        if user_id == ADMIN_ID:
            return  # админ вне квиза -> нечего пересылать самому себе
        if ADMIN_ID:
            forwarded = await bot.forward_message(ADMIN_ID, message.chat.id, message.message_id)
            forward_map[forwarded.message_id] = user_id
        return

    index = progress.step
    question = QUESTIONS[index]

    # --- Спец-логика для вопроса "что нравится в тебе" ---
    if index == Q5_INDEX:
        negative = is_self_deprecating_local(text)

        # Если локально не нашли явного негатива — подключаем DeepSeek
        # для более умной проверки (сленг, мат, опечатки, скрытый негатив).
        if not negative and DEEPSEEK_API_KEY:
            negative = await ask_deepseek_self_deprecating(text)

        if negative:
            await message.answer(NEGATIVE_RESPONSE_TEXT)
            return
        else:
            progress.answers.append(text)
            await advance_user(user_id, index)
            return

    # --- Обычные вопросы с локальной проверкой ---
    checker = question["checker"]
    local_ok = checker(text) if checker else False

    if local_ok:
        progress.answers.append(text)
        await advance_user(user_id, index)
        return

    # --- Локальная проверка не прошла -> пробуем DeepSeek ---
    ai_ok = False
    if DEEPSEEK_API_KEY and question["criteria_for_ai"]:
        ai_ok = await ask_deepseek_correct(question["criteria_for_ai"], text)

    if ai_ok:
        progress.answers.append(text)
        await advance_user(user_id, index)
        return

    # --- Ни локальная проверка, ни ИИ не подтвердили -> зовём админа ---
    await message.answer(
        "Хм, вроде не совсем то 🤔 Могу передать твой ответ на проверку — "
        "подожди немного!"
    )
    await notify_admin(user_id, message.from_user.username, text)


# ============================================================
#  ЗАПУСК
# ============================================================

async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
