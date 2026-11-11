// Karten-Panel: zeigt eigene + Beispiel-Karten, laesst Open/Rename/Delete/New
// und Autosaves ins Backend.
//
// Design-Prinzip: der Editor bleibt die einzige Quelle fuer das doc. Dieses
// Panel liest `editor.doc` (nach Autosave in localStorage) und spiegelt
// Aenderungen ins Backend. Ein Map-Wechsel wird ueber die URL gesteuert:
// `?map=<id>` triggert beim Start einen Reload mit vorher ersetztem
// localStorage — so bleibt die bestehende Boot-Logik (main.js liest
// localStorage synchron) unangetastet.

import { listMaps, getMap, createMap, updateMap, deleteMap, hasToken, BASE_URL } from './mapsApi.js';
import { normalize, defaultDoc } from './sceneDoc.js';

const LS_DOC_KEY = 'dnd-world.sceneDoc.v1';
const LS_META_KEY = 'dnd-world.mapMeta.v1';  // { mapId, name, isExample }
const AUTOSAVE_DEBOUNCE_MS = 2000;

function readMeta() {
  try {
    const raw = localStorage.getItem(LS_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function writeMeta(meta) {
  try {
    if (meta == null) localStorage.removeItem(LS_META_KEY);
    else localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
  } catch (e) { /* ignore */ }
}
function writeDoc(doc) {
  try { localStorage.setItem(LS_DOC_KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ }
}

function replaceMapIdInUrl(id) {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('map', id);
    else u.searchParams.delete('map');
    window.history.replaceState({}, '', u.toString());
  } catch (e) { /* ignore */ }
}

export class MapsPanel {
  constructor({ editor, container }) {
    this.editor = editor;
    this.container = container;
    this.maps = [];
    this.meta = readMeta();
    this.status = 'idle';   // idle | saving | saved | error | offline
    this.lastSaveError = null;
    this._saveTimer = null;
    this._pendingSave = false;
    this._pendingName = null;
    this._destroyed = false;

    this._buildPanel();

    // 401-sichere Boot-Logik:
    // 1. Wenn ?map=<id> gesetzt ist und sich von meta.mapId unterscheidet ->
    //    Map laden, localStorage ersetzen, reload.
    // 2. Sonst: einfach die Liste laden, UI zeigen.
    this._bootstrap();

    // Editor klinkt sich beim Autosave bei uns ein (siehe editor.js:_markDirty):
    editor.onDocPersistedToStorage = (doc) => this._onEditorDocChanged(doc);
  }

  // -------- UI -----------------------------------------------------------

  _buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'mapsPanel';
    panel.style.cssText = [
      'position:fixed', 'right:12px', 'top:150px',
      'z-index:30', 'width:280px',
      'background:rgba(10,14,32,0.86)', 'color:#eaf0ff',
      'border-radius:10px', 'padding:10px',
      'font:12px ui-monospace,SF Mono,monospace',
      'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
      'display:flex', 'flex-direction:column', 'gap:8px',
      'max-height:70vh',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
    const title = document.createElement('div');
    title.textContent = 'Karten';
    title.style.cssText = 'opacity:0.75;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;';
    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText = 'font-size:11px;opacity:0.8;';
    header.appendChild(title);
    header.appendChild(this._statusEl);
    panel.appendChild(header);

    // Aktueller Karten-Name + Umbenennen-Button
    this._currentRow = document.createElement('div');
    this._currentRow.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 8px;background:rgba(255,255,255,0.05);border-radius:6px;';
    panel.appendChild(this._currentRow);

    // Login-Hinweis (wenn kein Token)
    this._loginHint = document.createElement('div');
    this._loginHint.style.cssText = 'padding:8px;background:rgba(255,184,103,0.12);border:1px solid rgba(255,184,103,0.3);border-radius:6px;line-height:1.5;display:none;';
    this._loginHint.innerHTML =
      'Nicht eingeloggt — lokale Änderungen werden nur im Browser gespeichert.<br>' +
      '<a href="/" style="color:#ffb867;">Zum Soundboard einloggen →</a>';
    panel.appendChild(this._loginHint);

    // Liste
    this._listEl = document.createElement('div');
    this._listEl.style.cssText = 'display:flex;flex-direction:column;gap:3px;overflow:auto;max-height:36vh;';
    panel.appendChild(this._listEl);

    // Aktionen
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    this._btnNewEmpty = this._mkBtn('＋ Neue leere Karte');
    this._btnNewEmpty.addEventListener('click', () => this._createFromCurrentOrEmpty('empty'));
    this._btnNewFromExample = this._mkBtn('＋ Neu aus Beispiel');
    this._btnNewFromExample.addEventListener('click', () => this._createFromCurrentOrEmpty('example'));
    this._btnSaveAs = this._mkBtn('💾 Als Kopie speichern…');
    this._btnSaveAs.addEventListener('click', () => this._saveCurrentAsCopy());
    this._btnRefresh = this._mkBtn('↻ Liste neu laden');
    this._btnRefresh.addEventListener('click', () => this.refresh().catch(() => {}));
    actions.appendChild(this._btnNewEmpty);
    actions.appendChild(this._btnNewFromExample);
    actions.appendChild(this._btnSaveAs);
    actions.appendChild(this._btnRefresh);
    panel.appendChild(actions);

    this.container.appendChild(panel);
    this._panel = panel;
    this._renderCurrentRow();
    this._renderStatus();
  }

  _mkBtn(label) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = [
      'background:rgba(40,52,88,0.9)', 'color:#eaf0ff', 'border:1px solid #334',
      'padding:6px 8px', 'border-radius:6px', 'cursor:pointer', 'text-align:left',
      'font:11px ui-monospace,monospace',
    ].join(';');
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(70,95,160,0.95)'; });
    b.addEventListener('mouseleave', () => { b.style.background = 'rgba(40,52,88,0.9)'; });
    return b;
  }

  _renderCurrentRow() {
    const row = this._currentRow;
    row.innerHTML = '';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:10px;opacity:0.65;text-transform:uppercase;letter-spacing:0.08em;';
    label.textContent = 'Aktuell geöffnet';
    row.appendChild(label);
    const meta = this.meta;
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    if (!meta) {
      nameEl.textContent = '— lokal (nicht gespeichert) —';
    } else {
      nameEl.textContent = (meta.isExample ? '⭐ ' : '') + meta.name;
    }
    row.appendChild(nameEl);
    if (meta && !meta.isExample && hasToken()) {
      const renameBtn = this._mkBtn('✎ Umbenennen');
      renameBtn.style.marginTop = '4px';
      renameBtn.addEventListener('click', () => this._rename());
      row.appendChild(renameBtn);
    }
    if (meta && meta.isExample) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;opacity:0.75;line-height:1.4;';
      hint.textContent = 'Beispiel ist read-only. "Als Kopie speichern" legt deine Version an.';
      row.appendChild(hint);
    }
  }

  _renderStatus() {
    const s = this._statusEl;
    if (!hasToken()) { s.textContent = '○ lokal'; s.style.color = '#ffb867'; return; }
    switch (this.status) {
      case 'saving': s.textContent = '● speichert…';   s.style.color = '#ffb867'; break;
      case 'saved':  s.textContent = '✓ gespeichert'; s.style.color = '#79d08c'; break;
      case 'error':  s.textContent = '✗ Fehler';       s.style.color = '#ff7f7f'; break;
      case 'offline':s.textContent = '○ offline';      s.style.color = '#ffb867'; break;
      default:       s.textContent = '○';              s.style.color = '#8fa0c0';
    }
  }

  _renderList() {
    const list = this._listEl;
    list.innerHTML = '';
    if (!hasToken()) {
      this._loginHint.style.display = 'block';
      this._btnSaveAs.style.display = 'none';
      this._btnNewEmpty.style.display = 'none';
      this._btnNewFromExample.style.display = 'none';
      this._btnRefresh.style.display = 'none';
      return;
    }
    this._loginHint.style.display = 'none';
    this._btnRefresh.style.display = 'block';
    this._btnNewEmpty.style.display = 'block';
    this._btnNewFromExample.style.display = 'block';
    this._btnSaveAs.style.display = (this.meta && this.meta.isExample) ? 'block' : 'block';

    if (this.maps.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'opacity:0.6;padding:6px 2px;font-size:11px;';
      empty.textContent = 'Noch keine Karten. Lege eine neue an.';
      list.appendChild(empty);
      return;
    }
    const activeId = this.meta?.mapId;
    // Erst Beispiele, dann eigene (updatedAt-Sortierung vom Server bleibt stabil)
    const sorted = [...this.maps].sort((a, b) => Number(b.isExample) - Number(a.isExample));
    for (const m of sorted) {
      const row = document.createElement('div');
      const isActive = activeId === m._id;
      row.style.cssText = [
        'display:flex', 'align-items:center', 'gap:4px',
        'padding:5px 6px', 'border-radius:5px', 'cursor:pointer',
        'background:' + (isActive ? 'rgba(255,184,103,0.25)' : 'rgba(40,52,88,0.55)'),
        'border:1px solid ' + (isActive ? '#c88a2d' : '#223'),
        'font-size:11px',
      ].join(';');
      const nameWrap = document.createElement('div');
      nameWrap.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameWrap.innerHTML = (m.isExample ? '⭐ ' : '') + this._esc(m.name);
      nameWrap.addEventListener('click', () => this._openMap(m._id));
      row.appendChild(nameWrap);
      if (!m.isExample) {
        const del = document.createElement('button');
        del.textContent = '🗑';
        del.title = 'Löschen';
        del.style.cssText = 'background:transparent;border:none;color:#ff9f9f;cursor:pointer;font-size:12px;';
        del.addEventListener('click', (ev) => { ev.stopPropagation(); this._deleteMap(m._id, m.name); });
        row.appendChild(del);
      }
      list.appendChild(row);
    }
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  setStatus(s) { this.status = s; this._renderStatus(); }

  // -------- Flow ---------------------------------------------------------

  async _bootstrap() {
    if (!hasToken()) {
      this._renderList();
      return;
    }
    try {
      const url = new URL(window.location.href);
      const urlMapId = url.searchParams.get('map');
      // 1. URL ?map=<id> gesetzt, unterscheidet sich von localStorage-meta?
      if (urlMapId && urlMapId !== this.meta?.mapId) {
        try {
          const map = await getMap(urlMapId);
          // localStorage ersetzen, dann reload — damit main.js die neue Karte liest.
          writeDoc(normalize(map.doc));
          writeMeta({ mapId: map._id, name: map.name, isExample: !!map.isExample });
          window.location.reload();
          return;
        } catch (e) {
          if (e.status === 401) { this._handle401(); }
          else if (e.status === 404) {
            console.warn('[maps] Map in URL nicht gefunden, ignoriere.');
            replaceMapIdInUrl(null);
            writeMeta(null); this.meta = null;
          } else {
            this.setStatus('error');
          }
        }
      } else if (this.meta?.mapId && !urlMapId) {
        // Umgekehrt: localStorage kennt eine Karte, URL nicht -> URL nachziehen.
        replaceMapIdInUrl(this.meta.mapId);
      }
      await this.refresh();
    } catch (e) {
      console.warn('[maps] bootstrap failed:', e);
    }
  }

  async refresh() {
    if (!hasToken()) { this._renderList(); return; }
    try {
      this.maps = await listMaps();
      this._renderList();
      // Falls unsere aktuelle Karte in der Liste nicht mehr existiert (z.B.
      // in anderem Browser gelöscht), lokale Meta räumen.
      if (this.meta?.mapId && !this.maps.find((m) => m._id === this.meta.mapId)) {
        writeMeta(null); this.meta = null;
        replaceMapIdInUrl(null);
        this._renderCurrentRow();
      }
    } catch (e) {
      if (e.status === 401) this._handle401();
      else this.setStatus('offline');
    }
  }

  _onEditorDocChanged(doc) {
    if (!hasToken()) return;
    if (!this.meta?.mapId) return;             // keine Backend-Karte offen
    if (this.meta.isExample) return;           // Beispiel: nicht autosaven
    this._pendingSave = true;
    clearTimeout(this._saveTimer);
    this.setStatus('saving');
    this._saveTimer = setTimeout(() => this._flushSave(), AUTOSAVE_DEBOUNCE_MS);
  }

  async _flushSave() {
    if (!this._pendingSave) return;
    this._pendingSave = false;
    const mapId = this.meta?.mapId;
    if (!mapId) return;
    const doc = this.editor.doc;
    try {
      await updateMap(mapId, { doc });
      this.setStatus('saved');
    } catch (e) {
      if (e.status === 401) { this._handle401(); return; }
      console.warn('[maps] save failed:', e);
      this.lastSaveError = e;
      this.setStatus('error');
      // Retry in 5s: erneut dirty markieren
      this._pendingSave = true;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._flushSave(), 5000);
    }
  }

  _handle401() {
    this.setStatus('error');
    // Wichtig: Doc/Meta NICHT loeschen — bleibt im localStorage. User logged
    // sich neu ein, kommt zurueck, kann weiterarbeiten.
    const warn = document.createElement('div');
    warn.style.cssText = 'padding:8px;background:rgba(255,127,127,0.15);border:1px solid rgba(255,127,127,0.4);border-radius:6px;line-height:1.5;margin-top:4px;';
    warn.innerHTML =
      'Session abgelaufen. Änderungen bleiben lokal erhalten.<br>' +
      '<a href="/" style="color:#ffb867;">Neu einloggen → /</a>';
    // Nur einmal einfügen.
    if (!this._warnShown) {
      this._panel.appendChild(warn);
      this._warnShown = true;
    }
  }

  async _openMap(id) {
    if (id === this.meta?.mapId) return;
    try {
      const map = await getMap(id);
      writeDoc(normalize(map.doc));
      writeMeta({ mapId: map._id, name: map.name, isExample: !!map.isExample });
      replaceMapIdInUrl(id);
      window.location.reload();
    } catch (e) {
      if (e.status === 401) this._handle401();
      else alert('Karte konnte nicht geöffnet werden: ' + e.message);
    }
  }

  async _createFromCurrentOrEmpty(kind) {
    if (!hasToken()) return;
    const name = (prompt('Name der neuen Karte:', '') || '').trim();
    if (!name) return;
    const doc = kind === 'example'
      ? (this._findExample()?.doc || defaultDoc())
      : defaultDoc();
    // Fuer kind='example' brauchen wir das Beispiel-Doc -> nachladen.
    let finalDoc = doc;
    if (kind === 'example') {
      const ex = this._findExample();
      if (ex) {
        try {
          const full = await getMap(ex._id);
          finalDoc = normalize(full.doc);
        } catch (e) { /* fallback: defaultDoc() */ }
      }
    }
    try {
      const map = await createMap({ name, doc: finalDoc });
      writeDoc(normalize(finalDoc));
      writeMeta({ mapId: map._id, name: map.name, isExample: false });
      replaceMapIdInUrl(map._id);
      window.location.reload();
    } catch (e) {
      if (e.status === 401) this._handle401();
      else alert('Erstellen fehlgeschlagen: ' + e.message);
    }
  }

  _findExample() { return this.maps.find((m) => m.isExample); }

  async _saveCurrentAsCopy() {
    if (!hasToken()) return;
    const defaultName = this.meta?.name ? `${this.meta.name} (Kopie)` : 'Neue Karte';
    const name = (prompt('Name der Kopie:', defaultName) || '').trim();
    if (!name) return;
    try {
      const map = await createMap({ name, doc: this.editor.doc });
      writeMeta({ mapId: map._id, name: map.name, isExample: false });
      replaceMapIdInUrl(map._id);
      this.meta = readMeta();
      await this.refresh();
      this._renderCurrentRow();
      this.setStatus('saved');
    } catch (e) {
      if (e.status === 401) this._handle401();
      else alert('Kopie speichern fehlgeschlagen: ' + e.message);
    }
  }

  async _rename() {
    if (!this.meta?.mapId || this.meta.isExample) return;
    const name = (prompt('Neuer Name:', this.meta.name) || '').trim();
    if (!name || name === this.meta.name) return;
    try {
      const map = await updateMap(this.meta.mapId, { name });
      this.meta = { ...this.meta, name: map.name };
      writeMeta(this.meta);
      await this.refresh();
      this._renderCurrentRow();
      this.setStatus('saved');
    } catch (e) {
      if (e.status === 401) this._handle401();
      else alert('Umbenennen fehlgeschlagen: ' + e.message);
    }
  }

  async _deleteMap(id, name) {
    if (!confirm(`Karte "${name}" wirklich löschen?`)) return;
    try {
      await deleteMap(id);
      if (this.meta?.mapId === id) {
        writeMeta(null); this.meta = null;
        replaceMapIdInUrl(null);
        this._renderCurrentRow();
      }
      await this.refresh();
    } catch (e) {
      if (e.status === 401) this._handle401();
      else alert('Löschen fehlgeschlagen: ' + e.message);
    }
  }
}

export { BASE_URL };
