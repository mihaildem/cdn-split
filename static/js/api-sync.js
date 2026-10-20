/**
 * api-sync.js — Backend synchronization & local storage persistence.
 * Connects with FastAPI /api/overview & /api/dashboard when available;
 * smoothly falls back to localStorage on GitHub Pages or offline.
 */

import { getInitialState } from './seed.js';

const STORAGE_KEY = 'cs-state-v1';

export function loadPersistedState() {
  let state = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Could not parse localStorage state:', err);
  }

  const initial = getInitialState();
  if (!state) {
    return initial;
  }

  // Ensure mandatory fields exist if schema evolved
  return {
    ...initial,
    ...state,
    skin: localStorage.getItem('cs-skin') || state.skin || initial.skin,
    palPick: localStorage.getItem('cs-pal') || state.palPick || initial.palPick,
    theme: localStorage.getItem('cs-theme') || state.theme || initial.theme,
    members: state.members && state.members.length ? state.members : initial.members,
    accounts: state.accounts && state.accounts.length ? state.accounts : initial.accounts,
    bots: state.bots && state.bots.length ? state.bots : initial.bots,
    history: state.history || initial.history,
    log: state.log || initial.log,
    baseline: state.baseline || initial.baseline,
    adj: state.adj || initial.adj,
  };
}

export function persistState(state) {
  try {
    const toSave = {
      tab: state.tab,
      me: state.me,
      pending: state.pending,
      settledAt: state.settledAt,
      refreshes: state.refreshes,
      members: state.members,
      accounts: state.accounts,
      bots: state.bots,
      history: state.history,
      log: state.log,
      baseline: state.baseline,
      adj: state.adj,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    if (state.skin) localStorage.setItem('cs-skin', state.skin);
    if (state.palPick) localStorage.setItem('cs-pal', state.palPick);
    if (state.theme) localStorage.setItem('cs-theme', state.theme);
  } catch (err) {
    console.warn('Could not persist state:', err);
  }
}

export async function checkBackendAvailability() {
  try {
    const res = await fetch('/health', { method: 'GET', cache: 'no-store' });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export async function fetchBackendDashboard() {
  try {
    const res = await fetch('/api/dashboard', { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function syncBackendAll() {
  try {
    const res = await fetch('/api/sync/all', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function testProviderApi(prov, credentials) {
  try {
    const res = await fetch('/api/accounts/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: prov, credentials }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {
    // Backend unavailable or network error
  }
  return null;
}

export async function testBotApi(botId) {
  try {
    const res = await fetch(`/api/bots/${botId}/test`, { method: 'POST' });
    if (res.ok) return await res.json();
  } catch (_) {}
  return null;
}

export async function saveManualUsage(accountId, usage) {
  try {
    const res = await fetch(`/api/accounts/${accountId}/manual-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usage),
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return null;
}
