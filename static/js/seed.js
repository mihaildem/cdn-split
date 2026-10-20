/**
 * seed.js — Static data, constants, providers, and default state for CDN Split.
 */

export const DAY = 18;
export const DIM = 30;
export const F = DIM / DAY;

export const PROV = {
  yandex: {
    n: 'Yandex Cloud',
    s: 'Ya',
    c: '#FC3F1D',
    need: 'billing.accounts.viewer',
    fields: [
      ['Service account ID', 'text', 'ajeXXXXXXXXXXXXXXXX'],
      ['Authorized key (JSON)', 'password', 'Вставьте содержимое key.json'],
      ['Billing account ID', 'text', 'dn2XXXXXXXXXXXXXXXXX'],
    ],
    help: {
      steps: [
        'Консоль → IAM → Сервисные аккаунты → создайте аккаунт',
        'Назначьте роли: <b>cdn.viewer</b> и <b>billing.accounts.viewer</b>',
        'Откройте аккаунт → «Создать авторизованный ключ» → скачайте JSON',
      ],
      url: 'https://yandex.cloud/ru/docs/iam/operations/authorized-key/create',
    },
  },
  selectel: {
    n: 'Selectel',
    s: 'Se',
    c: '#1E6BFF',
    need: 'billing_reader',
    fields: [
      ['ID аккаунта', 'text', '123456'],
      ['API-токен', 'password', 'Токен сервисного пользователя'],
    ],
    help: {
      steps: [
        'Панель → Управление доступом → Сервисные пользователи → создать',
        'Роль: <b>reader</b> на проект с CDN и <b>billing_reader</b> на аккаунт',
        'Сгенерируйте токен и скопируйте его — он показывается один раз',
      ],
      url: 'https://docs.selectel.ru/control-panel-actions/users-and-roles/',
    },
  },
  vk: {
    n: 'VK Cloud',
    s: 'VK',
    c: '#0077FF',
    need: 'роль «Наблюдатель» на проект',
    fields: [
      ['ID проекта', 'text', 'mcs1234567890'],
      ['Логин (e-mail)', 'text', 'you@mail.ru'],
      ['Пароль сервисного пользователя', 'password', '••••••••'],
    ],
    help: {
      steps: [
        'Консоль → Настройки проекта → Пользователи → добавить пользователя',
        'Роль: <b>Наблюдатель</b> (read-only) для проекта',
        'ID проекта — в «Настройки проекта → Информация»',
      ],
      url: 'https://cloud.vk.com/docs/tools-for-using-services/api/rest-api/endpoints',
    },
  },
  mts: {
    n: 'MTS Cloud',
    s: 'MTS',
    c: '#E30611',
    need: 'право «Биллинг: чтение»',
    fields: [
      ['ID организации', 'text', 'org-xxxx'],
      ['API-токен', 'password', 'Токен доступа'],
    ],
    help: {
      steps: [
        'Личный кабинет → Профиль → Доступ по API',
        'Создайте токен с правами <b>только чтение</b> на CDN и биллинг',
        'Скопируйте токен и ID организации',
      ],
      url: 'https://cloud.mts.ru/',
    },
  },
  timeweb: {
    n: 'Timeweb Cloud',
    s: 'Tw',
    c: '#6C4BFF',
    need: 'право «Финансы»',
    fields: [
      ['API-токен', 'password', 'eyJhbGciOi…'],
    ],
    help: {
      steps: [
        'Панель → «API и Terraform» → «Создать токен»',
        'Выберите права <b>только чтение</b> (CDN, финансы)',
        'Скопируйте токен — позже его не показать',
      ],
      url: 'https://timeweb.cloud/my/api-keys',
    },
  },
  beget: {
    n: 'Beget',
    s: 'Be',
    c: '#00A86B',
    need: 'доступ к статистике',
    fields: [
      ['Логин', 'text', 'login'],
      ['Пароль для API', 'password', 'Отдельный пароль API'],
    ],
    help: {
      steps: [
        'Панель → «Настройки» → «Доступ по API» → включить',
        'Задайте отдельный API-пароль (не пароль от кабинета)',
        'Добавьте IP сервиса в белый список, если используется',
      ],
      url: 'https://beget.com/ru/kb/api/beget-api',
    },
  },
};

export const PROVKEYS = Object.keys(PROV);

export const SKINS = {
  pixel: 'Pixel',
  air: 'Air',
  orbit: 'Orbit',
};

export const SKIN_PAL = {
  pixel: 'mint',
  air: 'sky',
  orbit: 'lilac',
};

export const PALS = {
  mint: ['Мята', '#c8edb2', '#365b34', '#f1f4ef'],
  sky: ['Небо', '#e2ecfc', '#2c4163', '#fbfaf7'],
  lilac: ['Сирень', '#e9dffb', '#493660', '#f4f4f9'],
  peach: ['Персик', '#ffdcc6', '#5c3a28', '#fbf6f1'],
  graphite: ['Графит', '#1b1f24', '#e9ecef', '#f6f7f8'],
};

export const EVS = [
  ['balance', 'Заканчивается баланс'],
  ['key', 'Отвалился API-ключ'],
  ['down', 'Упал CDN-ресурс'],
  ['spike', 'Всплеск трафика'],
  ['newcdn', 'Найден новый CDN'],
  ['paid', 'Перевод и «Оплатил»'],
  ['weekly', 'Сводка по воскресеньям'],
];

export const CHK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" shape-rendering="crispEdges" stroke-linecap="square"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
export const CHK_S = CHK.replace('<svg', '<svg width="14" height="14"');
export const XX = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" shape-rendering="crispEdges" stroke-linecap="square" style="display:inline-block;vertical-align:-1px"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

export const ICONS = {
  chev: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  set: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
};

export const mk = (b, spike) =>
  Array.from({ length: 14 }, (_, i) =>
    Math.round(b * (1 + 0.16 * Math.sin(i * 1.7) + 0.05 * Math.cos(i * 3.1)) * (spike && i === 13 ? 3.4 : 1))
  );

export function getInitialState() {
  const skin = (() => {
    try { return localStorage.getItem('cs-skin'); } catch (_) { return null; }
  })() || 'pixel';

  const palPick = (() => {
    try { return localStorage.getItem('cs-pal'); } catch (_) { return null; }
  })();

  const theme = (() => {
    try { return localStorage.getItem('cs-theme'); } catch (_) { return null; }
  })() || 'auto';

  return {
    skin,
    palPick,
    tab: 'home',
    me: 'm',
    theme,
    pending: null,
    settledAt: '12 апр',
    refreshes: 0,
    f: {},
    openHow: {},
    open: {},
    openAcc: {},
    testN: 0,
    members: [
      { id: 'm', name: 'Миша', sbp: '+7 900 123-45-67 · Т-Банк' },
      { id: 'x', name: 'Макс', sbp: '+7 911 765-43-21 · Сбер' },
    ],
    baseline: { paid: {}, cons: {} },
    adj: { paid: {}, cons: {} },
    history: [
      {
        id: 1,
        date: '12 апр 2025',
        tr: [{ from: 'x', to: 'm', sum: 2140 }],
        paid: { m: 6210, x: 5320 },
        cons: { m: 5800, x: 5730 },
        how: 'Макс отметил · Миша подтвердил',
      },
      {
        id: 2,
        date: '15 мар 2025',
        tr: [{ from: 'm', to: 'x', sum: 760 }],
        paid: { m: 4100, x: 5230 },
        cons: { m: 4950, x: 4380 },
        how: 'Макс отметил · Миша подтвердил',
      },
    ],
    log: [
      { d: '2 мая', t: 'Макс стал платить за Timeweb · с этой даты' },
      { d: '21 апр', t: 'static.maxapp.ru → потребитель Макс' },
    ],
    accounts: [
      {
        id: 1,
        source: 'api',
        prov: 'yandex',
        name: 'misha-main',
        login: 'misha@yandex.ru',
        balance: 842,
        bonus: 300,
        bonusSpent: 120,
        topup: 3000,
        payer: 'm',
        freeGb: 100,
        price: 1.9,
        countBonus: true,
        newRule: 'ask',
        status: 'ok',
        updated: 3,
        res: [
          { id: 11, domain: 'cdn.mishasite.ru', tech: 'a1b2c3.edge.yandexcloud.net', up: true, gb: 420, consumer: 'm', h: mk(24) },
          { id: 12, domain: 'static.maxapp.ru', tech: 'd4e5f6.edge.yandexcloud.net', up: true, gb: 180, consumer: 'x', h: mk(10) },
          { id: 13, domain: 'media.shared.ru', tech: 'g7h8i9.edge.yandexcloud.net', up: true, gb: 260, consumer: 'all', h: mk(14) },
        ],
      },
      {
        id: 2,
        source: 'api',
        prov: 'selectel',
        name: 'Selectel · 284117',
        login: 'max@gmail.com',
        balance: 410,
        bonus: 0,
        bonusSpent: 0,
        topup: 2000,
        payer: 'x',
        freeGb: 0,
        price: 2.2,
        countBonus: true,
        newRule: 'x',
        status: 'ok',
        updated: 3,
        res: [
          { id: 21, domain: 'img.maxapp.ru', tech: 'cdn-7731.selcdn.ru', up: true, gb: 310, consumer: 'x', h: mk(17, true) },
          { id: 22, domain: 'files.shared.ru', tech: 'cdn-7732.selcdn.ru', up: true, gb: 95, consumer: 'all', h: mk(5) },
          { id: 23, domain: 'promo.maxapp.ru', tech: 'cdn-7790.selcdn.ru', up: true, gb: 140, consumer: null, isNew: true, h: mk(8) },
        ],
      },
      {
        id: 3,
        source: 'api',
        prov: 'vk',
        name: 'mcs-8842190',
        login: 'misha@mail.ru',
        balance: 2300,
        bonus: 1500,
        bonusSpent: 640,
        topup: 0,
        payer: 'm',
        freeGb: 50,
        price: 1.6,
        countBonus: false,
        newRule: 'm',
        status: 'ok',
        updated: 3,
        res: [
          { id: 31, domain: 'video.mishasite.ru', tech: 'xyz.cdn.vk.cloud', up: false, gb: 540, consumer: 'm', h: mk(30) },
        ],
      },
      {
        id: 4,
        source: 'api',
        prov: 'timeweb',
        name: 'tw-max-prod',
        login: 'max@gmail.com',
        balance: 28,
        bonus: 0,
        bonusSpent: 0,
        topup: 500,
        payer: 'x',
        freeGb: 0,
        price: 1.4,
        countBonus: true,
        newRule: 'x',
        status: 'ok',
        updated: 3,
        res: [
          { id: 41, domain: 'cdn.blogmax.ru', tech: 'cdn-41.twcstorage.ru', up: true, gb: 230, consumer: 'x', h: mk(13) },
        ],
      },
      {
        id: 5,
        source: 'api',
        prov: 'beget',
        name: 'beget-misha',
        login: 'mishaweb',
        balance: 1520,
        bonus: 0,
        bonusSpent: 0,
        topup: 1500,
        payer: 'm',
        freeGb: 0,
        price: 2.0,
        countBonus: true,
        newRule: 'm',
        status: 'ok',
        updated: 3,
        res: [
          { id: 51, domain: 'assets.shared.ru', tech: 'cdn.beget.com/9912', up: true, gb: 150, consumer: 'all', h: mk(8) },
        ],
      },
      {
        id: 6,
        source: 'api',
        prov: 'mts',
        name: 'mts-org-5521',
        login: 'max@gmail.com',
        balance: 310,
        bonus: 0,
        bonusSpent: 0,
        topup: 0,
        payer: 'x',
        freeGb: 0,
        price: 2.4,
        countBonus: true,
        newRule: 'ask',
        status: 'error',
        updated: 2880,
        res: [
          { id: 61, domain: 'old.maxapp.ru', tech: '—', up: true, gb: 60, consumer: 'x', h: mk(3) },
        ],
      },
    ],
    bots: [
      {
        id: 1,
        name: 'Бот Миши',
        chat: '@mishka_dev',
        ev: { balance: 1, key: 1, down: 1, spike: 1, newcdn: 1, paid: 1, weekly: 1 },
      },
      {
        id: 2,
        name: 'Общий чат',
        chat: '-1002345678901',
        ev: { balance: 1, key: 0, down: 1, spike: 1, newcdn: 0, paid: 1, weekly: 0 },
      },
    ],
  };
}
