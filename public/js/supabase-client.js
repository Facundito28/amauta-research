import { AMAUTA_CONFIG } from './config.js';

const cfg = AMAUTA_CONFIG;
const REST  = `${cfg.SUPABASE_URL}/rest/v1`;
const FN    = `${cfg.SUPABASE_URL}/functions/v1`;
const AUTH  = `${cfg.SUPABASE_URL}/auth/v1`;
const CACHE_TTL = 60 * 60 * 1000;

// Sesión en memoria — nunca en localStorage
let _session = null;

const BASE_HEADERS = {
  apikey: cfg.SUPABASE_KEY,
  'Content-Type': 'application/json',
};

function getHeaders() {
  const token = _session?.access_token;
  return {
    ...BASE_HEADERS,
    Authorization: `Bearer ${token || cfg.SUPABASE_KEY}`,
  };
}

// -------------- Auth --------------
export async function signIn(email, password) {
  const r = await fetch(`${AUTH}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || 'Credenciales incorrectas');
  _session = { access_token: data.access_token, refresh_token: data.refresh_token };
  return data;
}

export async function signOut() {
  if (!_session?.access_token) return;
  await fetch(`${AUTH}/logout`, {
    method: 'POST',
    headers: { ...BASE_HEADERS, Authorization: `Bearer ${_session.access_token}` },
  }).catch(() => {});
  _session = null;
}

export function getSession() { return _session; }

// -------------- Caché localStorage --------------
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}
function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function cacheInvalidate(pattern) {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(pattern)).forEach(k => localStorage.removeItem(k));
  } catch {}
}

// -------------- Lecturas (usan JWT si hay sesión) --------------
export async function listInstruments() {
  const key = `amr:instruments:${!!_session}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const r = await fetch(`${REST}/instruments?select=*&order=sort_order.asc`, { headers: getHeaders() });
  if (!r.ok) throw new Error(`listInstruments ${r.status}`);
  const data = await r.json();
  cacheSet(key, data);
  return data;
}

export async function getInstrument(id) {
  const key = `amr:inst:${id}:${!!_session}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const r = await fetch(`${REST}/instruments?id=eq.${encodeURIComponent(id)}&select=*`, { headers: getHeaders() });
  if (!r.ok) throw new Error(`getInstrument ${r.status}`);
  const rows = await r.json();
  const data = rows[0] || null;
  if (data) cacheSet(key, data);
  return data;
}

export async function getBlocks(instrumentId) {
  const key = `amr:blocks:${instrumentId}:${!!_session}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const url = `${REST}/instrument_blocks?instrument_id=eq.${encodeURIComponent(instrumentId)}&order=tab_index.asc,block_order.asc&select=*`;
  const r = await fetch(url, { headers: getHeaders() });
  if (!r.ok) throw new Error(`getBlocks ${r.status}`);
  const data = await r.json();
  cacheSet(key, data);
  return data;
}

// -------------- Escrituras (requieren JWT en header) --------------
export async function adminWrite(action, payload) {
  if (!_session?.access_token) throw new Error('No autenticado');
  const r = await fetch(`${FN}/admin-write`, {
    method: 'POST',
    headers: { ...BASE_HEADERS, Authorization: `Bearer ${_session.access_token}` },
    body: JSON.stringify({ action, payload }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `admin-write ${r.status}`);
  if (body.ok) {
    const id = payload?.id || payload?.instrument_id;
    if (id) { cacheInvalidate(`amr:inst:${id}`); cacheInvalidate(`amr:blocks:${id}`); }
    cacheInvalidate('amr:instruments');
  }
  return body;
}

export function clearCache() {
  try { Object.keys(localStorage).filter(k => k.startsWith('amr:')).forEach(k => localStorage.removeItem(k)); } catch {}
}

// -------------- Real-time --------------
const _listeners = new Set();
let _wsRetryTimer = null;

export function onInstrumentsChanged(fn) { _listeners.add(fn); }
export function offInstrumentsChanged(fn) { _listeners.delete(fn); }

function _notifyListeners(event) {
  _listeners.forEach(fn => { try { fn(event); } catch (_) {} });
}

export function subscribeRealtime() {
  // Supabase Realtime via WebSocket (protocolo phoenix)
  const wsUrl = cfg.SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + cfg.SUPABASE_KEY + '&vsn=1.0.0';

  let ws;
  let heartbeat;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Unirse al canal de cambios en instruments
      ws.send(JSON.stringify({
        topic: 'realtime:public:instruments',
        event: 'phx_join',
        payload: { config: { broadcast: { self: false }, presence: { key: '' } } },
        ref: '1',
      }));
      heartbeat = setInterval(() => {
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
      }, 25000);
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const ev = data?.payload?.data;
        if (ev && ['INSERT', 'UPDATE', 'DELETE'].includes(ev.type)) {
          clearCache();
          _notifyListeners({ type: ev.type, table: ev.table, record: ev.record });
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      clearInterval(heartbeat);
      // Reconectar en 5 segundos
      _wsRetryTimer = setTimeout(connect, 5000);
    };

    ws.onerror = () => ws.close();
  }

  connect();

  return () => {
    clearTimeout(_wsRetryTimer);
    clearInterval(heartbeat);
    ws?.close();
  };
}

export const AmautaDB = {
  listInstruments, getInstrument, getBlocks,
  adminWrite, clearCache,
  signIn, signOut, getSession,
  onInstrumentsChanged, offInstrumentsChanged, subscribeRealtime,
};
