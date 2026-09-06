import asyncio
import difflib
import logging
import os
import re
from dataclasses import dataclass, field

import aiohttp
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

BOT_TOKEN = os.getenv("BOT_TOKEN", "ВСТАВЬ_СЮДА_ТОКЕН_ОТ_BOTFATHER")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0"))  # твой числовой Telegram ID

# Ключ DeepSeek (необязательно). Если не задан — бот проверяет ответы
# только локальными правилами + твоей ручной кнопкой зачёта.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

# Картинка, которая отправится вместе с финальным поздравлением
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


NEGATIVE_SELF_TALK = [
    "жирная", "жирный", "толстая", "толстый", "страшная", "страшный",
    "некрасив", "уродл", "глупая", "глупый", "тупая", "тупой", "дура",
    "дурочка", "плохая", "плохой", "ужасн", "никчемн", "бездар",
    "неудачница", "неудачник", "дающая",
]


def is_self_deprecating(text: str) -> bool:
    t = text.lower()
    return any(word in t for word in NEGATIVE_SELF_TALK)


def check_q6_i_am(text: str) -> bool:
    t = text.lower().strip().strip('"').strip("“”")
    return "to this episode" in t


# ============================================================
#  ВОПРОСЫ
#  checker=None для "свободных" вопросов со спец-логикой (Q5)
# ============================================================

QUESTIONS = [
    {
        "text": "Если цена выросла на 10%, а объём спроса упал на 15%, чему равен "
                "коэффициент эластичности спроса по цене?",
        "checker": check_q1_elasticity,
        "criteria_for_ai": "Правильный ответ — коэффициент эластичности по модулю равен 1.5 "
                            "(допустимы любые форматы записи числа 1.5 или 1,5, знак минус можно "
                            "игнорировать, так как речь о модуле).",
    },
    {
        "text": "Кто из команды Хауса дольше всех проработал у него без увольнений, "
                "и в какой серии он впервые появился?",
        "checker": check_q2_house,
        "criteria_for_ai": "Правильный ответ — Эрик Форман (Eric Foreman). Приемлемы опечатки "
                            "и разные варианты написания имени/фамилии.",
    },
    {
        "text": "В какой песне впервые звучит мотив (лейтмотив) Пенелопы, и в какой "
                "песне этот же мотив используется как намёк на то, что Одиссей "
                "наконец узнаёт её?",
        "checker": check_q3_odyssey_songs,
        "criteria_for_ai": 'Правильный ответ должен упоминать ОБЕ песни: "Full Speed Ahead" '
                            'и "Would You Fall in Love with Me Again". Порядок не важен, '
                            "опечатки допустимы.",
    },
    {
        "text": "Любимое аниме Артёма, супергерой Ани, и исполнитель Саши "
                "(порядок не важен):",
        "checker": check_q4_trio,
        "criteria_for_ai": "Правильный ответ должен содержать все три пункта: "
                            "аниме — Евангелион (Evangelion), супергерой — Человек-паук "
                            "(Spider-Man), исполнитель — KSB music (Ксб мьюзик). "
                            "Порядок не важен.",
    },
    {
        "text": "Что Артёму больше всего нравится в тебе?",
        "checker": None,  # спец-логика ниже (self-deprecation check)
        "criteria_for_ai": None,
    },
    {
        "text": "I am?...",
        "checker": check_q6_i_am,
        "criteria_for_ai": 'Правильный ответ — "I am to this episode" или просто '
                            '"to this episode" в любом написании/регистре.',
    },
]

Q5_INDEX = 4  # индекс вопроса "что нравится в тебе"


# ============================================================
#  СОСТОЯНИЕ ПОЛЬЗОВАТЕЛЕЙ (в памяти)
# ============================================================

@dataclass
class UserProgress:
    active: bool = True
    step: int = 0
    answers: list = field(default_factory=list)


user_progress: dict[int, UserProgress] = {}
# callback_data "accept:<user_id>" -> обрабатывается через сам callback_data, доп. структуры не нужны


# ============================================================
#  DEEPSEEK — «вторая пара глаз» для проверки ответа
# ============================================================

async def ask_deepseek(criteria: str, user_answer: str) -> bool:
    if not DEEPSEEK_API_KEY:
        return False

    system_prompt = (
        "Ты — строгий проверяющий тестовых ответов. Тебе дают критерий "
        "правильного ответа и ответ пользователя. Ответь ТОЛЬКО одним "
        "словом: YES, если ответ пользователя по сути соответствует "
        "критерию (даже если есть опечатки, другой порядок слов, "
        "неполное совпадение формулировок) — или NO, если не соответствует."
    )
    user_prompt = f"Критерий правильного ответа: {criteria}\nОтвет пользователя: {user_answer}"

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
                content = data["choices"][0]["message"]["content"].strip().upper()
                return content.startswith("YES")
    except Exception as e:
        logging.warning(f"DeepSeek check failed: {e}")
        return False


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
    await bot.send_message(user_id, QUESTIONS[index]["text"])


async def finish_quiz(user_id: int):
    await bot.send_message(user_id, FINAL_TEXT, parse_mode="HTML")
    if os.path.exists(PRIZE_IMAGE_PATH):
        await bot.send_photo(
            user_id, FSInputFile(PRIZE_IMAGE_PATH), caption=FINAL_CAPTION_EN
        )
    else:
        await bot.send_message(user_id, FINAL_CAPTION_EN)


async def advance_user(user_id: int):
    """Засчитать текущий вопрос верным и перейти дальше (или завершить квиз)."""
    progress = user_progress[user_id]
    progress.step += 1
    if progress.step >= len(QUESTIONS):
        progress.active = False
        await finish_quiz(user_id)
    else:
        await bot.send_message(user_id, "✅ Верно! Следующий вопрос:")
        await send_question(user_id, progress.step)


# ============================================================
#  ХЕНДЛЕРЫ
# ============================================================

@dp.message(CommandStart())
async def start_quiz(message: Message):
    user_progress[message.from_user.id] = UserProgress(active=True, step=0)
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
    await advance_user(target_user_id)


@dp.message()
async def handle_message(message: Message):
    user_id = message.from_user.id
    text = message.text or ""

    # --- Сообщения от самого админа, если это не ответ на квиз ---
    if user_id == ADMIN_ID:
        return  # обработку "живого ответа" админа см. ниже отдельным хендлером при желании

    progress = user_progress.get(user_id)

    # --- Пользователь не в квизе -> это "живой чат", пересылаем админу ---
    if progress is None or not progress.active:
        if ADMIN_ID:
            await bot.forward_message(ADMIN_ID, message.chat.id, message.message_id)
        return

    index = progress.step
    question = QUESTIONS[index]

    # --- Спец-логика для вопроса "что нравится в тебе" ---
    if index == Q5_INDEX:
        if is_self_deprecating(text):
            await message.answer(
                "НЕТ. Чтобы ты ни написала — это неправда, ведь Артёму нравится "
                "в тебе всё: и красота, и ум, и ещё очень много причин, ты сама "
                "прекрасно знаешь 💗 Попробуй ответить ещё раз:"
            )
            return
        else:
            progress.answers.append(text)
            await advance_user(user_id)
            return

    # --- Обычные вопросы с локальной проверкой ---
    checker = question["checker"]
    local_ok = checker(text) if checker else False

    if local_ok:
        progress.answers.append(text)
        await advance_user(user_id)
        return

    # --- Локальная проверка не прошла -> пробуем DeepSeek ---
    ai_ok = False
    if DEEPSEEK_API_KEY and question["criteria_for_ai"]:
        ai_ok = await ask_deepseek(question["criteria_for_ai"], text)

    if ai_ok:
        progress.answers.append(text)
        await advance_user(user_id)
        return

    # --- Ни локальная проверка, ни ИИ не подтвердили -> зовём админа ---
    await message.answer(
        "Хм, вроде не совсем то 🤔 Могу передать твой ответ на проверку — "
        "подожди немного!"
    )
    if ADMIN_ID:
        await bot.send_message(
            ADMIN_ID,
            f"❓ Пользователь @{message.from_user.username or user_id} "
            f"ответил на вопрос {index + 1}:\n\n"
            f"«{question['text']}»\n\n"
            f"Ответ: {text}\n\n"
            f"Если это на самом деле правильно — нажми кнопку ниже.",
            reply_markup=admin_override_keyboard(user_id),
        )


# ============================================================
#  ЗАПУСК
# ============================================================

async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
