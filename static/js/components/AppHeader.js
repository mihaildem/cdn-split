/**
 * AppHeader Component - Brand, Connection Badge & Global Actions
 */

export const AppHeader = {
  name: "AppHeader",
  props: {
    store: { type: Object, required: true }
  },
  template: `
    <header class="app-header">
      <div class="brand">
        <div class="brand-icon">⚡</div>
        <div>
          <div class="brand-title">
            <span>CDN Splitwise</span>
            <span
              class="badge-mode"
              :class="store.connectionMode"
              @click="store.openModal('security')"
              :title="'Режим: ' + (store.connectionMode === 'server' ? 'FastAPI Сервер' : 'Автономный LocalStorage') + ' (нажмите для настройки)'"
            >
              {{ store.connectionMode === 'server' ? '🔒 Сервер' : '📱 Демо' }}
            </span>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <button
          class="btn btn-sm"
          :disabled="store.loading"
          @click="store.syncAll()"
          title="Синхронизировать балансы и домены со всеми CDN провайдерами"
        >
          <span :style="{ display: 'inline-block', transform: store.loading ? 'rotate(360deg)' : 'none', transition: 'transform 0.8s ease' }">🔄</span>
          <span>Синхр.</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('participants')" title="Управление участниками взаиморасчетов">
          <span>👥</span>
          <span>Участники</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('telegram')" title="Настройка Telegram ботов для алертов">
          <span>🤖</span>
          <span>Telegram</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('history')" title="История закрытия взаиморасчетов">
          <span>📜</span>
          <span>История</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('json')" title="Экспорт и импорт базы в JSON">
          <span>⇄</span>
          <span>JSON</span>
        </button>

        <button class="btn btn-sm btn-primary" @click="store.openModal('account')" title="Добавить новый CDN аккаунт">
          <span>+</span>
          <span>Аккаунт</span>
        </button>
      </div>
    </header>
  `
};
