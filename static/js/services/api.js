/**
 * CDN Splitwise & Resource Dashboard - REST API Client with Pin & Serverless Fallback
 */

import { storage } from "./storage.js";

const CONFIG_KEY = "cdn_split_config_v1";

export const api = {
  config: {
    backendUrl: "",
    accessPin: ""
  },

  init() {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config.backendUrl = parsed.backendUrl || "";
        this.config.accessPin = parsed.accessPin || "";
      }
    } catch {}
  },

  saveConfig(backendUrl, accessPin) {
    this.config.backendUrl = (backendUrl || "").trim().replace(/\/+$/, "");
    this.config.accessPin = (accessPin || "").trim();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
  },

  async request(path, options = {}) {
    const base = this.config.backendUrl;
    const url = base ? `${base}${path.startsWith('/') ? path : '/' + path}` : path;
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (this.config.accessPin) {
      headers["X-Access-Pin"] = this.config.accessPin;
    }

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      const err = new Error("Неверный PIN-код доступа (401)");
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      let detail = `Ошибка HTTP ${res.status}`;
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch {}
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : await res.json();
  },

  get(path) { return this.request(path, { method: "GET" }); },
  post(path, body) { return this.request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); },
  put(path, body) { return this.request(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }); },
  patch(path, body) { return this.request(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }); },
  delete(path) { return this.request(path, { method: "DELETE" }); },

  async checkHealth() {
    try {
      const base = this.config.backendUrl;
      const url = base ? `${base}/health` : "/health";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }
};

api.init();
