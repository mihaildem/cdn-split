/**
 * CDN Splitwise & Resource Dashboard - Seed Catalog & Demo Data
 */

export const PROVIDERS_CATALOG = {
  selectel: {
    id: "selectel", name: "Selectel CDN", color: "#0016ff", default_free_gb: 100.0, default_price_per_gb: 1.50,
    fields: [{ key: "api_token", label: "API-токен (Selectel Key)", type: "password", placeholder: "sel_api_xxx", required: true }],
    help: {
      title: "Инструкция для Selectel", portal_url: "https://my.selectel.ru/profile/service-users", portal_label: "Панель Selectel",
      steps: [
        "Войдите в панель my.selectel.ru → «Профиль» → «Управление пользователями».",
        "Создайте сервисного пользователя с ролью «Администратор» или «Просмотр CDN».",
        "Выпустите API-токен и скопируйте его значение в форму."
      ]
    }
  },
  yandex: {
    id: "yandex", name: "Yandex Cloud CDN", color: "#fc3f1d", default_free_gb: 0.0, default_price_per_gb: 1.20,
    fields: [
      { key: "oauth_token", label: "OAuth или IAM токен", type: "password", placeholder: "y0_AgAAA...", required: true },
      { key: "folder_id", label: "Folder ID (Каталог)", type: "text", placeholder: "b1gxxxx", required: true }
    ],
    help: {
      title: "Инструкция для Yandex Cloud", portal_url: "https://console.yandex.cloud/", portal_label: "Yandex Cloud Console",
      steps: [
        "В консоли Yandex Cloud скопируйте Folder ID каталога.",
        "Выпустите OAuth-токен или IAM-токен сервисного аккаунта с ролью cdn.viewer.",
        "Вставьте Folder ID и токен в поля формы."
      ]
    }
  },
  vk: {
    id: "vk", name: "VK Cloud CDN", color: "#0077ff", default_free_gb: 0.0, default_price_per_gb: 1.40,
    fields: [
      { key: "api_token", label: "API-токен / Keystone", type: "password", placeholder: "vk_api_xxx", required: true },
      { key: "project_id", label: "Project ID (Проект)", type: "text", placeholder: "mcs_proj_xxx", required: false }
    ],
    help: {
      title: "Инструкция для VK Cloud", portal_url: "https://mcs.mail.ru/app/settings/api", portal_label: "VK Cloud Console",
      steps: [
        "В панели mcs.mail.ru перейдите в «Настройки проекта» → «Безопасность» → «API-ключи».",
        "Создайте API-ключ с доступом к CDN и балансу проекта.",
        "Скопируйте ключ и Project ID."
      ]
    }
  },
  mts: {
    id: "mts", name: "MTS Web Services", color: "#e30611", default_free_gb: 50.0, default_price_per_gb: 1.30,
    fields: [
      { key: "api_key", label: "API-ключ MTS Cloud", type: "password", placeholder: "mts_key_xxx", required: true },
      { key: "tenant_id", label: "ID организации / Тенанта", type: "text", placeholder: "org_xxx", required: false }
    ],
    help: {
      title: "Инструкция для MTS Cloud", portal_url: "https://cloud.mts.ru/", portal_label: "Панель CloudMTS",
      steps: [
        "В личном кабинете cloud.mts.ru перейдите в «Профиль» → «API-ключи».",
        "Сгенерируйте ключ с правами чтения баланса и CDN.",
        "Вставьте ключ в поле формы."
      ]
    }
  },
  timeweb: {
    id: "timeweb", name: "Timeweb Cloud CDN", color: "#2060ff", default_free_gb: 0.0, default_price_per_gb: 1.60,
    fields: [{ key: "api_token", label: "API-токен Timeweb", type: "password", placeholder: "Bearer eyJhbGciOi...", required: true }],
    help: {
      title: "Инструкция для Timeweb Cloud", portal_url: "https://timeweb.cloud/api-tokens", portal_label: "API-токены Timeweb",
      steps: [
        "Войдите в timeweb.cloud → «Токены API» (или timeweb.cloud/api-tokens).",
        "Выпустите API-токен с доступом к балансу и CDN сервисам.",
        "Вставьте токен в поле выше."
      ]
    }
  },
  beget: {
    id: "beget", name: "Beget CDN", color: "#00aa5b", default_free_gb: 0.0, default_price_per_gb: 1.50,
    fields: [
      { key: "login", label: "Логин Beget", type: "text", placeholder: "my_login", required: true },
      { key: "password", label: "API-пароль", type: "password", placeholder: "••••••••", required: true }
    ],
    help: {
      title: "Инструкция для Beget", portal_url: "https://cp.beget.com/", portal_label: "Панель Beget",
      steps: [
        "В панели cp.beget.com перейдите в «Безопасность» → «API и вебхуки».",
        "Включите доступ к API и сохраните API-пароль.",
        "Укажите ваш логин и пароль в форме."
      ]
    }
  }
};

export const DEFAULT_PARTICIPANTS = [
  { id: "misha", name: "Миша", color: "#38bdf8" },
  { id: "max", name: "Макс", color: "#c084fc" }
];

export function getInitialDemoState() {
  return {
    participants: [...DEFAULT_PARTICIPANTS],
    accounts: [
      {
        id: "acc_selectel_main", provider: "selectel", name: "Selectel (Основной)", payer: "misha",
        balance_rub: 1450.0, bonus_balance_rub: 300.0, currency: "RUB", account_identifier: "selectel-28491",
        free_tier_gb: 100.0, price_per_gb: 1.50, package_cost_rub: 0.0, ignore_bonus: false,
        low_balance_threshold: 200.0, sync_status: "ok", credentials: { api_token: "••••••••a942" }
      },
      {
        id: "acc_vk_max", provider: "vk", name: "VK Cloud (Проект Макса)", payer: "max",
        balance_rub: 620.0, bonus_balance_rub: 0.0, currency: "RUB", account_identifier: "mcs_proj_8410",
        free_tier_gb: 0.0, price_per_gb: 1.40, package_cost_rub: 0.0, ignore_bonus: false,
        low_balance_threshold: 200.0, sync_status: "ok", credentials: { api_token: "••••••••bb12", project_id: "mcs_proj_8410" }
      },
      {
        id: "acc_yc_misha", provider: "yandex", name: "Yandex Cloud (Edge CDN)", payer: "misha",
        balance_rub: 2100.0, bonus_balance_rub: 500.0, currency: "RUB", account_identifier: "b1g9941a0e1",
        free_tier_gb: 0.0, price_per_gb: 1.20, package_cost_rub: 0.0, ignore_bonus: false,
        low_balance_threshold: 300.0, sync_status: "ok", credentials: { oauth_token: "••••••••AAAA", folder_id: "b1g9941a0e1" }
      },
      {
        id: "acc_tw_max", provider: "timeweb", name: "Timeweb (Микросервисы)", payer: "max",
        balance_rub: 180.0, bonus_balance_rub: 0.0, currency: "RUB", account_identifier: "tw_client_942",
        free_tier_gb: 0.0, price_per_gb: 1.60, package_cost_rub: 0.0, ignore_bonus: false,
        low_balance_threshold: 200.0, sync_status: "ok", credentials: { api_token: "••••••••1823" }
      }
    ],
    resources: [
      { id: "res_sel_1", account_id: "acc_selectel_main", domain: "api-data3.mdworks.uk", cname: "sel-cdn-942.selectelcdn.ru", status: "active", consumer: "split", total_gb: 42.5, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 28.4 },
      { id: "res_sel_2", account_id: "acc_selectel_main", domain: "media-assets.sreda.cc", cname: "sel-cdn-811.selectelcdn.ru", status: "active", consumer: "max", total_gb: 65.0, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 34.1 },
      { id: "res_sel_3", account_id: "acc_selectel_main", domain: "cdn-static.mishadev.ru", cname: "sel-cdn-102.selectelcdn.ru", status: "active", consumer: "misha", total_gb: 18.2, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 19.2 },
      { id: "res_vk_1", account_id: "acc_vk_max", domain: "stream-cache.video-cdn.ru", cname: "vkcdn-live-42.mcs.mail.ru", status: "active", consumer: "split", total_gb: 80.0, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 45.0 },
      { id: "res_vk_2", account_id: "acc_vk_max", domain: "heavy-files.maxhub.io", cname: "vkcdn-storage-19.mcs.mail.ru", status: "active", consumer: "max", total_gb: 45.0, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 52.3 },
      { id: "res_yc_1", account_id: "acc_yc_misha", domain: "origin-edge.sreda-hub.net", cname: "yc-cdn-cache.yandexcloud.net", status: "active", consumer: "misha", total_gb: 120.0, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 18.7 },
      { id: "res_tw_1", account_id: "acc_tw_max", domain: "cdn-app.tw-cluster.pro", cname: "twcdn-proxy.timeweb.cloud", status: "active", consumer: "max", total_gb: 30.0, paid_watermark_gb: 0.0, paid_watermark_cost: 0.0, http_status: "up", http_code: 200, http_latency_ms: 31.0 }
    ],
    settlements: [],
    telegram_bots: []
  };
}
