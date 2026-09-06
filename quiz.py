"""Содержимое квиза: тексты, локальные проверяльщики ответов и DeepSeek.

Всё перенесено из старого bot.py без изменений по смыслу — поменялась
только «обёртка» (раньше чат, теперь веб-приложение).
"""

import difflib
import logging
import re

import aiohttp

from config import DEEPSEEK_API_KEY, DEEPSEEK_URL

# ============================================================
#  ТЕКСТЫ
# ============================================================

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

# Текст в чате: кнопка открывает Mini App.
WELCOME_TEXT = (
    "Вауу, привееет! 👀 За твои целых три часа экономики тебя кое-что ждёт... "
    "Но чтобы доказать, что ты и правда умница-топчик, нужно ответить на "
    "несколько вопросов. Погнали? Жми кнопку ниже 👇"
)

# Тот же текст, но на первом экране веб-приложения (там вместо «пиши что
# угодно» — кнопка).
WELCOME_TEXT_WEB = (
    "Вауу, привееет! 👀 За твои целых три часа экономики тебя кое-что ждёт... "
    "Но чтобы доказать, что ты и правда умница-топчик, нужно ответить на "
    "несколько вопросов. Погнали?"
)

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

NEGATIVE_RESPONSE_TEXT = (
    "НЕТ. Чтобы ты ни написала — это неправда, ведь Артёму нравится в тебе "
    "всё: и красота, и ум, и ещё очень много причин, ты сама прекрасно "
    "знаешь 💗 Попробуй ответить ещё раз:"
)

PENDING_TEXT = (
    "Хм, вроде не совсем то 🤔 Могу передать твой ответ на проверку — "
    "подожди немного!"
)


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
#  correct_message — персональный текст при верном ответе
#  photo / video — необязательное медиа к вопросу: положи файл в папку
#  media/ рядом с app.py и напиши сюда имя файла, например "house.jpg"
# ============================================================

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
        "photo": None,
        "video": None,
    },
    {
        "text": "Кто из команды Хауса дольше всех проработал у него без увольнений, "
                "и в какой серии он впервые появился?",
        "checker": check_q2_house,
        "criteria_for_ai": "Правильный ответ — Эрик Форман (Eric Foreman). Приемлемы опечатки "
                           "и разные варианты написания имени/фамилии.",
        "correct_message": "я люблю формана, он чорни, прям как я!! вообщем ты снова права "
                           "ихихихмхмх мая умничкааа",
        "photo": None,
        "video": None,
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
        "photo": None,
        "video": None,
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
        "photo": None,
        "video": None,
    },
    {
        "text": "Что Артёму больше всего нравится в тебе?",
        "checker": None,  # спец-логика: проверка на самоуничижение + DeepSeek
        "criteria_for_ai": None,
        "correct_message": Q5_TEXT,
        "photo": None,
        "video": None,
    },
    {
        "text": "I am?...",
        "checker": check_q6_i_am,
        "criteria_for_ai": 'Правильный ответ — "I am to this episode" или просто '
                           '"to this episode" в любом написании/регистре.',
        "correct_message": "ОГО, УИЛСОН ЧТО-ЛИ ТОЖЕ ЗДЕСЬ????",
        "photo": None,
        "video": None,
    },
]

Q5_INDEX = 4  # индекс вопроса «что нравится в тебе»


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
    Для вопроса «что Артёму нравится в тебе»: проверяет, является ли ответ
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
