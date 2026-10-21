# CDN Splitwise & Resource Dashboard

Минималистичный дашборд для совместного учета облачных CDN-аккаунтов, контроля балансов, мониторинга доступности ресурсов и взаиморасчетов между участниками (**Миша ⇄ Макс**).

🌐 **Live Demo (GitHub Pages, demo-only, без бэкенда):** [https://mihaildem.github.io/cdn-split/](https://mihaildem.github.io/cdn-split/)  
*(Демо-версия UI: работает прямо в браузере на телефоне и десктопе, сохраняет состояние в `localStorage`, поддерживает экспорт/импорт конфигурации в JSON. Это только статическая витрина — полноценный бэкенд с SQLite и автосинхронизацией запускается через Docker, см. ниже.)*

---

## Возможности

- **6 облачных провайдеров:** Yandex Cloud, Selectel, VK Cloud, MTS Cloud (MWS), Timeweb Cloud, Beget.
- **Умный расчет Free Tier и подписок:**
  - Автоматический вычет бесплатных ГБ (`free_tier_gb`) на уровне аккаунта с пропорциональным распределением платного трафика и абонентской платы между ресурсами.
  - Опция игнорирования бонусного/грантового баланса во взаимозачете.
- **Система Splitwise (Взаимовычет):**
  - Назначение плательщика на каждый аккаунт (`Миша` или `Макс`).
  - Назначение потребителя на каждый CDN-ресурс в 1 клик (`Миша`, `50/50`, `Макс`).
  - Расчет чистого итога с учетом взаимных трат и фиксация оплаты по кнопке **«✓ Оплатил»** (с сохранением истории и возможностью отката).
- **Встроенный справочник `[?]` по API:** пошаговые инструкции с прямыми ссылками, где выпустить токен или сервисного пользователя у каждого провайдера.
- **Статус CDN и мульти-бот в Telegram:**
  - Легкий встроенный HTTP-пингер доменов CDN (`🟢 28ms` / `🔴 ERR`) + статус из облака (`Active` / `Suspended`).
  - Поддержка нескольких Telegram-ботов с фильтрацией по владельцу и гибкими триггерами (низкий баланс, отвал API, падение CDN, фиксация оплаты).
- **Два режима работы:**
  - **Standalone / GitHub Pages (Serverless):** 100% клиентский режим в браузере через `localStorage` с экспортом/импортом конфигурации и прямыми уведомлениями в Telegram.
  - **Docker / FastAPI:** полноценный бэкенд с автоматической периодической синхронизацией по расписанию и SQLite базой данных.

---

## Быстрый старт (Docker)

```bash
cp .env.example .env
# Сгенерируйте секрет (минимум 24 символа) и задайте PIN:
#   APP_SECRET_KEY:  openssl rand -hex 32
#   APP_ACCESS_PIN:  4–8 цифр
# За локальной разработкой: APP_ENV=development
nano .env
docker compose up -d --build
```

Дашборд будет доступен по адресу: `http://localhost:8095`

`compose.yaml` запускает контейнер в production-режиме (`APP_ENV=production`):
без корректного `APP_SECRET_KEY` (не дефолт, ≥24 символов) и `APP_ACCESS_PIN`
сервис не стартует. `/health` всегда открыт без PIN. Данные хранятся в `./data`.

## Развёртывание на сервере

1. Требования: Docker + Compose v2, домен с A-записью, открыты 80/443 (для HTTPS).
2. Клонируйте репозиторий и настройте окружение:

   ```bash
   sudo git clone https://github.com/mihaildem/cdn-split.git /opt/cdn-split
   cd /opt/cdn-split
   cp .env.example .env
   openssl rand -hex 32          # результат → APP_SECRET_KEY в .env
   nano .env                     # APP_SECRET_KEY, APP_ACCESS_PIN, CDN_SPLIT_BIND_IP
   mkdir -p data && sudo chown 1000:1000 data   # владелец под непривилегированного пользователя контейнера
   docker compose up -d --build
   curl -f http://127.0.0.1:8095/health   # {"status":"ok",...}
   ```

   За reverse-прокси (Caddy/Nginx) или Tailscale/Homelab держите
   `CDN_SPLIT_BIND_IP=127.0.0.1`, чтобы порт не был доступен извне напрямую:

   ```caddyfile
   # Caddyfile — Let's Encrypt автоматически
   cdn.example.com {
       reverse_proxy 127.0.0.1:8095
   }
   ```

3. Обновление и откат вручную: `git pull && docker compose up -d --build`.
   Данные в `./data` при пересборке сохраняются.

## Образы из GHCR

На теги `v*` GitHub Actions собирает и публикует образ
`ghcr.io/mihaildem/cdn-split` (теги `latest` и версия). Чтобы использовать
готовый образ вместо локальной сборки, замените в `compose.yaml` секцию `build`
на `image: ghcr.io/mihaildem/cdn-split:latest` и выполните
`docker compose pull && docker compose up -d`.

## Данные, бэкап и восстановление

- Данные лежат в `./data` (SQLite база + зашифрованные токены).
- Разовый бэкап: `./scripts/backup.sh` — складывает `backup-YYYY-MM-DD.tgz`
  в `./backups`, хранит 14 дней (`KEEP_DAYS`), на время копирования
  останавливает стек и поднимает его обратно.
- Вне-серверная копия: `REMOTE_TARGET=user@nas:/volume1/backups/cdn-split ./scripts/backup.sh` (rsync).
- Ежедневный cron (в 04:15):

  ```cron
  15 4 * * * /opt/cdn-split/scripts/backup.sh >> /var/log/cdn-split-backup.log 2>&1
  ```

- **Храните `APP_SECRET_KEY` отдельно** (менеджер паролей): без него
  зашифрованные токены из бэкапа расшифровать нельзя.

### Восстановление (restore)

```bash
cd /opt/cdn-split
docker compose stop
mv data data.old                     # при необходимости
tar xzf backups/backup-2026-10-21.tgz
sudo chown -R 1000:1000 data
docker compose up -d
curl -f http://127.0.0.1:8095/health
```

Важно: восстановление выполняется с тем же `APP_SECRET_KEY`, что был на момент
бэкапа, иначе токены провайдеров не расшифруются.

## Локальный запуск и тесты

```bash
pip install -r requirements.txt
APP_ENV=development uvicorn app.main:app --host 0.0.0.0 --port 8095
pytest tests/ -v
```
