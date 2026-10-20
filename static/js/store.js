/**
 * CDN Splitwise & Resource Dashboard - Central Reactive Store (Vue 3 Composition API)
 */
import { reactive, computed } from "vue";
import { api } from "./services/api.js";
import { storage } from "./services/storage.js";
import { PROVIDERS_CATALOG } from "./services/seed.js";
import { calculateSplitwiseOverview } from "./services/billing.js";

export const store = reactive({
  connectionMode: "server", backendUrl: api.config.backendUrl, accessPin: api.config.accessPin,
  activeFilter: "all", activeModal: null, modalData: null, loading: false,
  toasts: [], providers: PROVIDERS_CATALOG, bots: [], settlements: [],
  dashboard: {
    splitwise: { summary_text: "Загрузка...", direction: "settled", total_unsettled_cost: 0, participant_stats: [], transfers: [] },
    accounts: [], participants: [], last_updated_at: ""
  },

  filteredAccounts: computed(() => {
    const list = store.dashboard.accounts || [], f = store.activeFilter;
    if (f === "all") return list;
    if (f === "low_balance") return list.filter(a => a.is_low_balance);
    if (f === "issues") return list.filter(a => a.sync_status !== "ok" || (a.resources || []).some(r => r.http_status === "down"));
    return list.filter(a => a.payer === f || (a.resources || []).some(r => r.consumer === f || r.consumer === "split"));
  }),

  notify(message, type = "info") {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    store.toasts.push({ id, message, type });
    setTimeout(() => { store.toasts = store.toasts.filter(t => t.id !== id); }, 3500);
  },
  openModal(name, data = null) { store.activeModal = name; store.modalData = data ? JSON.parse(JSON.stringify(data)) : null; },
  closeModal() { store.activeModal = null; store.modalData = null; },

  async loadAll() {
    store.loading = true;
    store.connectionMode = (await api.checkHealth()) ? "server" : "local";
    if (store.connectionMode === "server") {
      try {
        const [dash, provList, botList, stlList] = await Promise.all([
          api.get("/api/dashboard"), api.get("/api/providers").catch(() => []),
          api.get("/api/telegram").catch(() => []), api.get("/api/settlements").catch(() => [])
        ]);
        store.dashboard = dash;
        if (Array.isArray(provList) && provList.length) store.providers = Object.fromEntries(provList.map(p => [p.id, p]));
        store.bots = botList; store.settlements = stlList;
      } catch (e) {
        if (e.status === 401) { store.openModal("security"); store.notify("Требуется PIN-код доступа", "error"); }
        else { store.connectionMode = "local"; store.dashboard = storage.buildDashboard(); }
      }
    } else {
      store.dashboard = storage.buildDashboard();
      const local = storage.load();
      store.bots = local.telegram_bots || []; store.settlements = local.settlements || [];
    }
    store.loading = false;
  },

  async syncAll() {
    store.loading = true;
    try {
      if (store.connectionMode === "server") store.dashboard = (await api.post("/api/sync/all")).dashboard || await api.get("/api/dashboard");
      else store.dashboard = storage.buildDashboard();
      store.notify("Данные синхронизированы", "success");
    } catch (e) { store.notify(e.message, "error"); }
    finally { store.loading = false; }
  },

  async setAccountPayer(acc, payerId) {
    acc.payer = payerId;
    store.dashboard.splitwise = calculateSplitwiseOverview(store.dashboard.accounts, store.dashboard.participants);
    try {
      store.connectionMode === "server" ? await api.put(`/api/accounts/${acc.id}`, { payer: payerId }) : storage.setAccountPayer(acc.id, payerId);
      store.notify(`Плательщик: ${payerId}`, "info");
    } catch (e) { store.notify(e.message, "error"); await store.loadAll(); }
  },
  async setResourceConsumer(res, consumerId) {
    res.consumer = consumerId;
    store.dashboard.splitwise = calculateSplitwiseOverview(store.dashboard.accounts, store.dashboard.participants);
    try {
      store.connectionMode === "server" ? await api.patch(`/api/resources/${res.id}/consumer`, { consumer: consumerId }) : storage.setResourceConsumer(res.id, consumerId);
    } catch (e) { store.notify(e.message, "error"); await store.loadAll(); }
  },
  async settleUp(note = "") {
    try {
      if (store.connectionMode === "server") store.dashboard = (await api.post("/api/settle", { note })).dashboard;
      else { storage.settleBalances(note); store.dashboard = storage.buildDashboard(); store.settlements = storage.load().settlements || []; }
      store.notify("Взаиморасчет зафиксирован!", "success");
    } catch (e) { store.notify(e.message, "error"); }
  },
  async undoSettlement() {
    try {
      if (store.connectionMode === "server") store.dashboard = (await api.post("/api/settlements/undo")).dashboard;
      else { storage.undoLatestSettlement(); store.dashboard = storage.buildDashboard(); store.settlements = storage.load().settlements || []; }
      store.notify("Взаиморасчет отменен", "info");
    } catch (e) { store.notify(e.message, "error"); }
  },
  async saveAccount(form) {
    store.connectionMode === "server" ? (form.id ? await api.put(`/api/accounts/${form.id}`, form) : await api.post("/api/accounts", form)) : storage.saveAccount(form);
    store.closeModal(); await store.loadAll(); store.notify("Аккаунт сохранен", "success");
  },
  async deleteAccount(id) {
    if (!confirm("Удалить этот CDN-аккаунт?")) return;
    store.connectionMode === "server" ? await api.delete(`/api/accounts/${id}`) : storage.deleteAccount(id);
    await store.loadAll(); store.notify("Аккаунт удален", "info");
  },
  async testAccountCredentials(payload) {
    return store.connectionMode === "server" ? await api.post("/api/accounts/test", payload) : { success: true, balance_rub: 1000.0, resources: [] };
  },

  async saveResource(form) {
    store.connectionMode === "server" ? (form.id ? await api.put(`/api/resources/${form.id}`, form) : await api.post("/api/resources", form)) : storage.saveResource(form);
    store.closeModal(); await store.loadAll(); store.notify("Ресурс сохранен", "success");
  },
  async deleteResource(id) {
    if (!confirm("Удалить ресурс?")) return;
    store.connectionMode === "server" ? await api.delete(`/api/resources/${id}`) : storage.deleteResource(id);
    await store.loadAll(); store.notify("Ресурс удален", "info");
  },
  async pingResource(res) {
    store.notify(`Проверка ${res.domain}...`, "info");
    try {
      if (store.connectionMode === "server") {
        const r = await api.post(`/api/resources/${res.id}/ping`);
        res.http_status = r.http_status; res.http_latency_ms = r.http_latency_ms;
      } else { res.http_status = "up"; res.http_latency_ms = Math.floor(Math.random() * 20 + 15); }
    } catch { res.http_status = "down"; }
  },
  async saveParticipant(form) {
    store.connectionMode === "server" ? (form.id ? await api.put(`/api/participants/${form.id}`, form) : await api.post("/api/participants", form)) : storage.saveParticipant(form);
    await store.loadAll(); store.notify("Участник сохранен", "success");
  },
  async deleteParticipant(id) {
    try {
      store.connectionMode === "server" ? await api.delete(`/api/participants/${id}`) : storage.deleteParticipant(id);
      await store.loadAll(); store.notify("Участник удален", "info");
    } catch (e) { store.notify(e.message, "error"); }
  },
  async saveBot(form) {
    store.connectionMode === "server" ? (form.id ? await api.put(`/api/telegram/${form.id}`, form) : await api.post("/api/telegram", form)) : storage.saveBot(form);
    await store.loadAll(); store.notify("Бот сохранен", "success");
  },
  async deleteBot(id) {
    store.connectionMode === "server" ? await api.delete(`/api/telegram/${id}`) : storage.deleteBot(id);
    await store.loadAll(); store.notify("Бот удален", "info");
  },
  async testBot(bot) {
    store.notify("Отправка тестового уведомления...", "info");
    if (store.connectionMode === "server") await api.post(`/api/telegram/${bot.id}/test`);
    else await storage.sendTelegram(bot.bot_token, bot.chat_id, "🤖 Тестовое уведомление из CDN Splitwise!");
    store.notify("Тестовое уведомление отправлено!", "success");
  },
  async resetDemo() {
    if (!confirm("Сбросить все данные к исходному демо-состоянию?")) return;
    store.connectionMode === "server" ? await api.post("/api/demo/reset") : storage.resetDemo();
    await store.loadAll(); store.notify("Демо-данные восстановлены", "info");
  },
  saveSecurity(backendUrl, accessPin) {
    api.saveConfig(backendUrl, accessPin);
    store.backendUrl = api.config.backendUrl; store.accessPin = api.config.accessPin;
    store.closeModal(); store.loadAll(); store.notify("Настройки сохранены", "success");
  },
  exportJson() {
    const data = store.connectionMode === "server" ? store.dashboard : storage.load();
    const a = document.createElement("a");
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    a.download = `cdn-split-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  },
  importJson(raw) {
    try {
      const data = JSON.parse(raw);
      if (!data.accounts) throw new Error("Неверный формат JSON");
      storage.save(data); store.loadAll(); store.closeModal(); store.notify("Данные импортированы", "success");
    } catch (e) { store.notify("Ошибка: " + e.message, "error"); }
  }
});
