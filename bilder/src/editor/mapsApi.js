// API-Modul fuer /api/maps des Soundboard-Backends.
//
// - Token wird aus localStorage.token gelesen (gleicher Key wie das Soundboard).
// - Basis-URL: VITE_API_URL (falls gesetzt) oder die Render-Produktions-URL.
// - Fehler werfen Error-Objekte mit .status + .msg; 401 wird vom Caller fuer
//   den "Session abgelaufen"-Hinweis genutzt.

const DEFAULT_BASE = 'https://soundboard-backend.onrender.com';
// Reihenfolge:
//   1. window.__API_URL  (Runtime-Override, nuetzlich fuer Tests)
//   2. import.meta.env.VITE_API_URL  (Build-time, z.B. lokal gegen Dev-BE)
//   3. Produktion.
export const BASE_URL = (
  (typeof window !== 'undefined' && window.__API_URL)
  || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  || DEFAULT_BASE
).replace(/\/$/, '');

export function getToken() {
  try { return localStorage.getItem('token') || null; } catch (e) { return null; }
}

export function hasToken() {
  return !!getToken();
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const e = new Error('Netzwerkfehler');
    e.status = 0;
    e.cause = networkErr;
    throw e;
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (e) { /* non-JSON */ }
  }
  if (!res.ok) {
    const e = new Error((data && data.msg) || `HTTP ${res.status}`);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  return data;
}

export async function listMaps() {
  const r = await request('/api/maps');
  return r.maps || [];
}

export async function getMap(id) {
  const r = await request(`/api/maps/${encodeURIComponent(id)}`);
  return r.map;
}

export async function createMap({ name, doc }) {
  const r = await request('/api/maps', { method: 'POST', body: { name, doc } });
  return r.map;
}

export async function updateMap(id, patch) {
  const r = await request(`/api/maps/${encodeURIComponent(id)}`, { method: 'PUT', body: patch });
  return r.map;
}

export async function deleteMap(id) {
  await request(`/api/maps/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
