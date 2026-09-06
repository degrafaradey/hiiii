"""Все настройки в одном месте. Значения берутся из .env (см. .env.example)."""

import os

from dotenv import load_dotenv

load_dotenv()

# --- то, что было в bot.py: оставлено полностью как есть ---
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_ID = int(os.getenv("ADMIN_ID", "0") or 0)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

# Картинка финального приза. Имя файла регистрозависимо на Railway (Linux)!
PRIZE_IMAGE_PATH = os.getenv("PRIZE_IMAGE_PATH", "prize.jpg")

# --- новое: веб-приложение и вебхук ---

# Публичный HTTPS-адрес сервиса, например https://my-quiz.up.railway.app
# Telegram открывает Mini App только по HTTPS.
WEBAPP_URL = os.getenv("WEBAPP_URL", "").rstrip("/")

# Секрет, которым Telegram подписывает вебхук-запросы (заголовок
# X-Telegram-Bot-Api-Secret-Token). Придумай любую строку.
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "change-me-please")
WEBHOOK_PATH = "/webhook"

# webhook — боевой режим. polling — для локальной отладки без домена.
MODE = os.getenv("MODE", "webhook").lower()

PORT = int(os.getenv("PORT", "8080"))

# Открыть веб-приложение в обычном браузере без подписи Telegram (только
# для отладки!). Нужен ещё DEV_USER_ID — от чьего имени будет проходиться квиз.
ALLOW_INSECURE_DEV = os.getenv("ALLOW_INSECURE_DEV", "0") == "1"
DEV_USER_ID = int(os.getenv("DEV_USER_ID", "0") or 0)
