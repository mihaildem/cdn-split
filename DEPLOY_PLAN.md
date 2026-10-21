# План развёртывания cdn/split

Цель: запустить сервис (FastAPI + статический PWA) в Docker на домашнем сервере/VPS за HTTPS, с бэкапами и CI.

## 0. Предпосылки
- Образ: `Dockerfile` (python:3.12-slim, порт 8080, `DATA_DIR=/data`, `/health`).
- Запуск: `compose.yaml` (порт хоста `CDN_SPLIT_PORT`, по умолчанию 8095; том `./data:/data`).
- Секреты: `APP_SECRET_KEY` (шифрование токенов), `APP_ACCESS_PIN` (вход), `TELEGRAM_PROXY` (опц.).

## 1. Подготовка репозитория (код)
1. `Dockerfile`: добавить `COPY manifest.webmanifest favicon.ico ./` (сейчас в образ не попадают), добавить непривилегированного пользователя (`USER app`, `chown /data`).
2. `app/crypto.py` / `app/main.py`: при старте в режиме production (`APP_ENV=production`) отказываться запускаться, если `APP_SECRET_KEY` равен дефолту `default-homelab-secret-change-me` или короче 24 символов.
3. `.dockerignore`: `.git`, `tests`, `__pycache__`, `.pytest_cache`, `data`, `.env`.
4. `.gitignore`: убедиться, что `data/` и `.env` игнорируются.
5. `compose.yaml`: `APP_ENV=production`, `read_only: true` + `tmpfs: /tmp`, убрать дефолт секрета (`${APP_SECRET_KEY:?set APP_SECRET_KEY}`).
6. Убедиться, что `/health` не требует PIN.

## 2. CI/CD (GitHub Actions)
1. `.github/workflows/ci.yml`: на push/PR — `pip install -r requirements.txt pytest`, `pytest -q` (27 тестов должны проходить), `docker build`.
2. `.github/workflows/release.yml`: на тег `v*` — сборка и публикация образа в `ghcr.io/mihaildem/cdn-split` (tags: `latest`, версия).
3. GitHub Pages остаётся как статическая демо-версия UI (без бэкенда); в README пометить как «demo».

## 3. Сервер
1. Требования: Docker + Compose v2, домен (A-запись), открыты 80/443.
2. Клонировать репозиторий в `/opt/cdn-split`, `cp .env.example .env`.
3. Сгенерировать секреты: `openssl rand -hex 32` → `APP_SECRET_KEY`; задать `APP_ACCESS_PIN` (4–8 цифр).
4. Привязать порт к локальному интерфейсу: `CDN_SPLIT_BIND_IP=127.0.0.1`.
5. `docker compose up -d --build`; проверить `curl -f http://127.0.0.1:8095/health`.

## 4. HTTPS и доступ
- Reverse proxy (Caddy — предпочтительно): `cdn.example.com { reverse_proxy 127.0.0.1:8095 }` — Let's Encrypt автоматически.
- Альтернатива для домашней сети: Tailscale/WireGuard без публичного порта.
- Для PWA и manifest HTTPS обязателен.

## 5. Telegram
1. Создать бота в @BotFather (текст — `brand-assets/telegram-botfather.txt`), загрузить аватар и description-картинку из `brand-assets/`.
2. Добавить токен бота и chat id в UI (Настройки → Telegram), нажать «Проверить».
3. При недоступности api.telegram.org — задать `TELEGRAM_PROXY`.

## 6. Данные и бэкапы
- Данные: `./data` (SQLite + зашифрованные токены). Бэкап — cron раз в сутки: `tar czf backup-$(date +%F).tgz data`, хранить 14 дней, копия вне сервера.
- `APP_SECRET_KEY` хранить отдельно: без него бэкап токенов не расшифровать.
- Скрипт `scripts/backup.sh` + описание восстановления в README.

## 7. Обновление и откат
- Обновление: `git pull && docker compose up -d --build` (или `docker compose pull` при образе из GHCR).
- Откат: `git checkout <tag> && docker compose up -d --build`; данные в томе сохраняются.

## 8. Приёмка (чек-лист)
- [ ] `/health` отвечает 200 по HTTPS
- [ ] Ввод PIN работает, без PIN API закрыт
- [ ] Подключён 1 реальный аккаунт провайдера, баланс подтянулся
- [ ] Тестовое сообщение дошло в Telegram
- [ ] PWA ставится на экран «Домой», иконка Мята
- [ ] Переключатель оформления и темы в шапке работает (Pixel/Air/Orbit)
- [ ] Бэкап создан и восстановлен на тестовой копии
- [ ] `pytest` зелёный в CI
