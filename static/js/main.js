/**
 * Main Entry Point - Root Vue 3 Application
 */

import { createApp, watchEffect } from "vue";
import { store } from "./store.js";
import { AppHeader } from "./components/AppHeader.js";
import { SplitwiseHero } from "./components/SplitwiseHero.js";
import { AccountCard } from "./components/AccountCard.js";
import { AccountModal, ResourceModal } from "./components/AccountModal.js";
import { ParticipantsModal, TelegramModal, HistoryModal, JsonModal, SecurityModal } from "./components/ManageModals.js";

const App = {
  name: "CDNApp",
  components: {
    AppHeader, SplitwiseHero, AccountCard, AccountModal, ResourceModal,
    ParticipantsModal, TelegramModal, HistoryModal, JsonModal, SecurityModal
  },
  setup() {
    store.loadAll();
    watchEffect(() => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("theme-v2", store.uiVersion === "v2");
        document.documentElement.classList.toggle("theme-v3", store.uiVersion === "v3");
      }
    });
    return { store };
  },
  template: `
    <div class="app-container" :class="{ 'theme-v2': store.uiVersion === 'v2', 'theme-v3': store.uiVersion === 'v3' }">
      <AppHeader :store="store" />
      <SplitwiseHero :store="store" />

      <!-- Filter Pills -->
      <nav class="filter-bar">
        <button class="filter-pill" :class="{ active: store.activeFilter === 'all' }" @click="store.activeFilter = 'all'">
          Все ({{ store.dashboard.accounts.length }})
        </button>
        <button class="filter-pill" :class="{ active: store.activeFilter === 'low_balance' }" @click="store.activeFilter = 'low_balance'">
          Низкий баланс
        </button>
        <button class="filter-pill" :class="{ active: store.activeFilter === 'issues' }" @click="store.activeFilter = 'issues'">
          Проблемные
        </button>
        <button
          v-for="p in store.dashboard.participants"
          :key="p.id"
          class="filter-pill"
          :class="{ active: store.activeFilter === p.id }"
          @click="store.activeFilter = p.id"
        >
          {{ p.name }}
        </button>
      </nav>

      <!-- Accounts Grid -->
      <main class="accounts-grid">
        <AccountCard
          v-for="acc in store.filteredAccounts"
          :key="acc.id"
          :account="acc"
          :store="store"
        />
        <div v-if="!store.filteredAccounts.length" class="form-hint" style="text-align: center; padding: 2rem;">
          {{ store.loading ? 'Загрузка аккаунтов...' : 'Нет аккаунтов по выбранному фильтру.' }}
        </div>
      </main>

      <!-- Modals -->
      <AccountModal v-if="store.activeModal === 'account'" :store="store" />
      <ResourceModal v-if="store.activeModal === 'resource'" :store="store" />
      <ParticipantsModal v-if="store.activeModal === 'participants'" :store="store" />
      <TelegramModal v-if="store.activeModal === 'telegram'" :store="store" />
      <HistoryModal v-if="store.activeModal === 'history'" :store="store" />
      <JsonModal v-if="store.activeModal === 'json'" :store="store" />
      <SecurityModal v-if="store.activeModal === 'security'" :store="store" />

      <!-- Toast Container -->
      <div class="toast-container">
        <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.type">
          {{ t.message }}
        </div>
      </div>
    </div>
  `
};

createApp(App).mount("#app");
