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
        <div class="brand-icon">◈</div>
        <div>
          <div class="brand-title">
            <span>CDN Splitwise</span>
            <span
              class="badge-mode"
              :class="store.connectionMode"
              @click="store.openModal('security')"
              :title="'Режим: ' + (store.connectionMode === 'server' ? 'FastAPI Сервер' : 'Автономный LocalStorage') + ' (нажмите для настройки)'"
            >
              {{ store.connectionMode === 'server' ? '● Server' : '○ Local' }}
            </span>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <!-- 3-Way UI Version Switcher [v1 | v2 | v3 👾] -->
        <div class="ui-segmented-switcher" title="Стиль интерфейса: v1 Классика / v2 Linear / v3 Pixel">
          <button
            class="ui-ver-btn"
            :class="{ active: store.uiVersion === 'v1' }"
            @click="store.setUiVersion('v1')"
            title="v1: Bento Classic"
          >
            v1
          </button>
          <button
            class="ui-ver-btn"
            :class="{ active: store.uiVersion === 'v2' }"
            @click="store.setUiVersion('v2')"
            title="v2: Geist / Linear Precision"
          >
            v2
          </button>
          <button
            class="ui-ver-btn"
            :class="{ active: store.uiVersion === 'v3' }"
            @click="store.setUiVersion('v3')"
            title="v3: Teenage / Nothing Pixel Bitmap"
          >
            v3 👾
          </button>
        </div>

        <button
          class="btn btn-sm"
          :disabled="store.loading"
          @click="store.syncAll()"
          title="Синхронизировать балансы и домены со всеми CDN провайдерами"
        >
          <span>↻</span>
          <span>Синхр.</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('participants')" title="Управление участниками взаиморасчетов">
          <span>Участники</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('telegram')" title="Настройка Telegram ботов для алертов">
          <span>Telegram</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('history')" title="История закрытия взаиморасчетов">
          <span>История</span>
        </button>

        <button class="btn btn-sm" @click="store.openModal('json')" title="Экспорт и импорт базы в JSON">
          <span>⇄ JSON</span>
        </button>

        <button class="btn btn-sm btn-primary" @click="store.openModal('account')" title="Добавить новый CDN аккаунт">
          <span>+ Аккаунт</span>
        </button>
      </div>
    </header>
  `
};
