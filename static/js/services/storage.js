/**
 * CDN Splitwise & Resource Dashboard - LocalStorage Serverless Repository & Telegram Client
 */

import { getInitialDemoState } from "./seed.js";
import { calculateAccountBilling, calculateSplitwiseOverview } from "./billing.js";

const KEY = "cdn_split_storage_v1";

export const storage = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return this.resetDemo();
      const parsed = JSON.parse(raw);
      return (parsed.accounts && parsed.resources) ? parsed : this.resetDemo();
    } catch { return this.resetDemo(); }
  },

  save(data) { localStorage.setItem(KEY, JSON.stringify(data)); },

  resetDemo() {
    const demo = getInitialDemoState();
    this.save(demo);
    return demo;
  },

  buildDashboard() {
    const data = this.load(), resByAcc = {};
    for (const r of (data.resources || [])) (resByAcc[r.account_id] = resByAcc[r.account_id] || []).push(r);
    const accounts = (data.accounts || []).map(a => calculateAccountBilling(a, resByAcc[a.id] || []));
    const splitwise = calculateSplitwiseOverview(accounts, data.participants || []);
    return { splitwise, accounts, participants: data.participants || [], settlements: data.settlements || [], last_updated_at: new Date().toISOString() };
  },

  saveAccount(acc) {
    const data = this.load();
    if (!acc.id) { acc.id = "acc_" + Date.now().toString(36); data.accounts.push(acc); }
    else {
      const idx = data.accounts.findIndex(a => a.id === acc.id);
      if (idx !== -1) data.accounts[idx] = { ...data.accounts[idx], ...acc }; else data.accounts.push(acc);
    }
    this.save(data); return acc;
  },

  deleteAccount(id) {
    const data = this.load();
    data.accounts = data.accounts.filter(a => a.id !== id);
    data.resources = data.resources.filter(r => r.account_id !== id);
    this.save(data);
  },

  saveResource(res) {
    const data = this.load();
    if (!res.id) {
      res.id = "res_" + Date.now().toString(36);
      res.paid_watermark_gb = 0.0; res.paid_watermark_cost = 0.0; res.http_status = res.http_status || "up";
      res.http_code = 200; res.http_latency_ms = Math.floor(Math.random() * 25 + 15);
      data.resources.push(res);
    } else {
      const idx = data.resources.findIndex(r => r.id === res.id);
      if (idx !== -1) data.resources[idx] = { ...data.resources[idx], ...res }; else data.resources.push(res);
    }
    this.save(data); return res;
  },

  deleteResource(id) {
    const data = this.load();
    data.resources = data.resources.filter(r => r.id !== id);
    this.save(data);
  },

  setResourceConsumer(resId, consumer) {
    const data = this.load();
    const r = data.resources.find(res => res.id === resId);
    if (r) { r.consumer = consumer; this.save(data); }
  },

  setAccountPayer(accId, payer) {
    const data = this.load();
    const a = data.accounts.find(acc => acc.id === accId);
    if (a) { a.payer = payer; this.save(data); }
  },

  saveParticipant(part) {
    const data = this.load();
    data.participants = data.participants || [];
    if (!part.id) {
      part.id = part.name.toLowerCase().replace(/[^a-z0-9]/g, "") || ("p_" + Date.now().toString(36));
      data.participants.push(part);
    } else {
      const idx = data.participants.findIndex(p => p.id === part.id);
      if (idx !== -1) data.participants[idx] = { ...data.participants[idx], ...part }; else data.participants.push(part);
    }
    this.save(data); return part;
  },

  deleteParticipant(id) {
    const data = this.load();
    if (data.accounts.some(a => a.payer === id) || data.resources.some(r => r.consumer === id)) {
      throw new Error("Нельзя удалить участника, привязанного к аккаунтам или ресурсам");
    }
    data.participants = (data.participants || []).filter(p => p.id !== id);
    this.save(data);
  },

  saveBot(bot) {
    const data = this.load();
    data.telegram_bots = data.telegram_bots || [];
    if (!bot.id) { bot.id = "bot_" + Date.now().toString(36); data.telegram_bots.push(bot); }
    else {
      const idx = data.telegram_bots.findIndex(b => b.id === bot.id);
      if (idx !== -1) data.telegram_bots[idx] = { ...data.telegram_bots[idx], ...bot }; else data.telegram_bots.push(bot);
    }
    this.save(data); return bot;
  },

  deleteBot(id) {
    const data = this.load();
    data.telegram_bots = (data.telegram_bots || []).filter(b => b.id !== id);
    this.save(data);
  },

  settleBalances(note = "") {
    const dash = this.buildDashboard(), data = this.load();
    data.settlements = data.settlements || [];
    const snapshot = {};
    for (const r of data.resources) {
      snapshot[r.id] = { gb: r.paid_watermark_gb || 0, cost: r.paid_watermark_cost || 0 };
      const cur = dash.accounts.flatMap(a => a.resources).find(x => x.id === r.id);
      if (cur) { r.paid_watermark_gb = cur.total_gb; r.paid_watermark_cost = cur.current_cumulative_cost; }
    }
    const settlement = {
      id: "stl_" + Date.now().toString(36), settled_at: new Date().toISOString(),
      summary: dash.splitwise.summary_text, note: note || "Взаиморасчет закрыт", snapshot
    };
    data.settlements.unshift(settlement);
    this.save(data);

    for (const bot of (data.telegram_bots || [])) {
      if (bot.notify_settlement && bot.bot_token && bot.chat_id) {
        this.sendTelegram(bot.bot_token, bot.chat_id, `🤝 <b>Взаиморасчет закрыт!</b>\n\n${settlement.summary}\n<i>${settlement.note}</i>`);
      }
    }
    return settlement;
  },

  undoLatestSettlement() {
    const data = this.load();
    if (!data.settlements?.length) return null;
    const latest = data.settlements.shift();
    if (latest.snapshot) {
      for (const r of data.resources) {
        if (latest.snapshot[r.id]) {
          r.paid_watermark_gb = latest.snapshot[r.id].gb;
          r.paid_watermark_cost = latest.snapshot[r.id].cost;
        }
      }
    }
    this.save(data);
    return latest;
  },

  async sendTelegram(token, chatId, text) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
      });
      return await res.json();
    } catch (e) { return { ok: false, description: e.message }; }
  }
};
