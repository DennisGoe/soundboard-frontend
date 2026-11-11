// Editor-Modul: Bauen-Modus, Palette, Platzieren per Drag/Click, Auswahl,
// Verschieben/Drehen/Loeschen/Duplizieren, Undo/Redo, LocalStorage,
// Export/Import, Reset.
//
// Entwurf fuer Phase 2/3:
//   - Phase 2 (Pinsel): die Editor-Modi werden in einem oberen Tab-Set
//     (Objekte / Pfade / Felder / Baeume / Terrain / Wasser) gewaehlt. Dafuer
//     ist unten CurrentMode als Enum vorbereitet; weitere Modi koennen als
//     eigene "tool"-Objekte dazukommen (begin/update/end).
//   - Phase 3 (Lichter): Lichter sind bereits ein Catalog-Eintrag mit
//     type="light.lantern". Wenn Phase 3 echte PointLights braucht, erweitert
//     spawnPlaceable die Entry-Erzeugung um .add(new PointLight(...)).

import * as THREE from 'three';
import { spawn, placeOnGround } from '../scene/assets.js';
import { sampleHeight } from '../scene/terrain.js';
import { distanceToRivers } from '../scene/mapLayout.js';
import { CATALOG, CATEGORIES, catalogByCategory, getCatalogEntry } from './catalog.js';
import { nextId, setProcOverride, deleteProcOverride } from './sceneDoc.js';
import { loadFromStorage, saveToStorage, exportDoc, importDocFromFile, clearStorage } from './storage.js';
import { defaultDoc } from './sceneDoc.js';
import { buildLightByType } from '../scene/editorLights.js';
import { makeWoodBridge, makeStoneBridge } from '../scene/bridges.js';
import { createTemple } from '../scene/temple.js';
import { PathTool, FENCE_STYLES } from './pathTool.js';
import { TerrainTool, TERRAIN_MODES } from './terrainTool.js';
import { MATERIALS as PAINT_MATERIALS } from '../world/paintEdits.js';
import { importHeightGrid, exportHeightGrid, resetHeightGrid } from '../world/heightEdits.js';
import { importPaintGrid, exportPaintGrid, resetPaintGrid } from '../world/paintEdits.js';
import { refreshTerrainHeights, refreshTerrainColors } from '../scene/terrain.js';

const UP = new THREE.Vector3(0, 1, 0);
const COLOR_OK   = new THREE.Color(0x66ff8e);
const COLOR_BAD  = new THREE.Color(0xff6f6f);
const COLOR_SEL  = new THREE.Color(0xffd166);

// Ein platzierter Haus-Trockenbau zur Kollisionspruefung in placeholder.
const PLACE_PAD = 0.3;

// ----- Objekt-Spawn -------------------------------------------------------

// Erzeugt eine fertige THREE.Group fuer type (aus catalog). Markiert die Group
// mit userData.editable = { id, type, scale, yOffset }. placeOnGround ruft bereits an.
// yOffset: Hoehen-Offset relativ zum Gelaende (bzw. zur Wasserebene bei Bruecken).
// Wird vom Shift-Drag gesetzt und persistiert — sorgt dafuer, dass angehobene
// Objekte nach Reload/Terraforming ihren Abstand zum Boden behalten.
export function spawnPlaceable({ id, type, x, z, rotY = 0, scale = null, yOffset = 0 }) {
  const entry = getCatalogEntry(type);
  if (!entry) {
    console.warn('[editor] unknown type', type);
    return null;
  }
  const s = scale == null ? entry.defaultScale : scale;
  const yOff = Number.isFinite(yOffset) ? yOffset : 0;
  let mesh;
  if (type.startsWith('light.')) {
    mesh = buildLightByType(type);
  } else if (type === 'bridge.wood') {
    mesh = makeWoodBridge(4.4, 1.8);
  } else if (type === 'bridge.stone') {
    mesh = makeStoneBridge(5.4, 2.2);
  } else if (type === 'house.temple') {
    // Tempel ist prozedural (keine GLTF-Datei) — eigener Builder.
    mesh = createTemple({ scale: 1.0 });
  } else {
    if (!entry.asset) {
      console.warn('[editor] catalog entry without asset', type);
      return null;
    }
    mesh = spawn(entry.asset);
  }
  mesh.scale.setScalar(s);
  mesh.rotation.y = rotY;
  // Bruecken werden explizit auf Wasserhoehe bzw. mit eigener y gebaut.
  // Sie kommen nicht auf sampleHeight sondern auf 0 (deren Geometrie liegt
  // selber um RIVER_SURFACE herum). yOffset addiert das Shift-Drag-Delta.
  if (type.startsWith('bridge.')) {
    mesh.position.set(x, yOff, z);
  } else {
    placeOnGround(mesh, x, z, sampleHeight(x, z) + yOff);
  }
  mesh.userData.editable = {
    id: id || nextId('obj'),
    type,
    scale: s,
    standardHouseId: null,     // nur bei Standard-Haeusern gesetzt
    isLight: type.startsWith('light.'),
    isBridge: type.startsWith('bridge.'),
    yOffset: yOff,
  };
  mesh.name = 'editable:' + type + ':' + mesh.userData.editable.id;
  return mesh;
}

// ----- Marker fuer Standard-Haeuser ---------------------------------------
// village.js setzt userData.editable auf dem gespawnten Haus (siehe Patch).
// Wir benutzen in editor.js nur die gleiche Markierung.

// ----- Selection-Outline (BoxHelper) --------------------------------------

function newBoxHelper(obj, color) {
  const bh = new THREE.BoxHelper(obj, color.getHex());
  bh.material.depthTest = false;
  bh.material.transparent = true;
  bh.material.opacity = 0.9;
  bh.renderOrder = 999;
  return bh;
}

// ----- Editor-Klasse ------------------------------------------------------

export class Editor {
  constructor({ scene, camera, renderer, controls, world, villageGroup, container, applyTimeOfDay }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.world = world;
    this.container = container;
    this.applyTimeOfDay = applyTimeOfDay;

    // Doc + Zustand
    this.doc = loadFromStorage();
    this.editMode = false;
    this.selected = null;    // THREE.Object3D oder null
    this.hoverGhost = null;  // Geister-Vorschau beim Drag/Placement
    this.pendingType = null; // type aus Palette, der platziert werden soll
    this.draggingSelected = false;
    this.lastValidGhostPos = null;
    // Pro Typ gemerkte Default-Rotation/Scale fuer naechstes Objekt.
    // Wird beim Rotieren/Skalieren des Ghosts aktualisiert.
    this._typeDefaults = Object.create(null);
    // Registrierte prozedurale Picker: fuegen Objekte in InstancedMesh anhand
    // instanceId zurueckverfolgbar machen. { instancedMesh, meta: [{id,type,x,z,rotY,scale}] }
    this._procPickers = [];

    // Container fuer spaeter hinzugefuegte editierbare Objekte.
    this.editGroup = new THREE.Group();
    this.editGroup.name = 'editor:objects';
    this.world.add(this.editGroup);

    // Alle Standard-Haeuser (Villagen-Gruppe) werden ebenfalls editierbar
    // markiert — village.js tagged sie bereits bei placeVillage().

    // Undo/Redo Stack (Patches-basiert: speichert vorher-nachher-Snapshots).
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndo = 50;

    // Raycaster
    this.ray = new THREE.Raycaster();
    this.mouseNDC = new THREE.Vector2();

    // Bounded ground fuer Raycast gegen Terrain (grosse Plane mit sampleHeight).
    // Billiger als Raycast gegen die hoch-aufgeloeste Terrain-Mesh.
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Pfad-Werkzeug (muss VOR _buildUI stehen — die UI referenziert pathTool).
    this.pathTool = new PathTool({ editor: this });
    this._pathDragHandle = -1;
    this._lastPathClickAt = 0;
    this._activeTab = 'objects';
    this._activeFenceStyle = 'wood';

    // Terraforming- + Paint-Werkzeug (Runde C).
    this.terrainTool = new TerrainTool({ editor: this });
    // Vorher persistiertes Terrain/Paint-Grid laden + auf Terrain anwenden.
    if (this.doc.terrain) importHeightGrid(this.doc.terrain);
    if (this.doc.paint)   importPaintGrid(this.doc.paint);
    // Nach Import: Terrain-Mesh auffrischen (Hoehen + Farben). Muss NACH
    // createTerrain() laufen -> wir rufen's defensiv jetzt (createTerrain lief
    // vor Editor-Mount). Falls kein Terrain-Grid vorhanden, no-op.
    try { refreshTerrainHeights(); refreshTerrainColors(); } catch (e) { /* Terrain noch nicht bereit */ }

    // UI
    this._buildUI();
    this._bindHotkeys();
    this._bindPointer();

    // Auto-save alle 2 s wenn dirty
    this._dirty = false;
    this._saveTimer = null;

    // Wenn storage already Overrides enthaelt -> Objekte aus doc materialisieren.
    this._rebuildFromDoc();

    if (typeof window !== 'undefined') {
      window.__editor = this;
    }
  }

  // ---------- Doc / Rebuild ------------------------------------------------

  _markDirty() {
    this._dirty = true;
    if (!this._saveTimer) {
      this._saveTimer = setTimeout(() => {
        // Terrain-/Paint-Grids in doc serialisieren BEVOR gespeichert wird.
        try { this.doc.terrain = exportHeightGrid(); } catch (e) { /* ignore */ }
        try { this.doc.paint   = exportPaintGrid();  } catch (e) { /* ignore */ }
        saveToStorage(this.doc);
        this._dirty = false;
        this._saveTimer = null;
        // Backend-Autosave (MapsPanel klinkt sich hier ein).
        if (typeof this.onDocPersistedToStorage === 'function') {
          try { this.onDocPersistedToStorage(this.doc); } catch (e) { /* ignore */ }
        }
      }, 500);
    }
  }

  _rebuildFromDoc() {
    // Standard-Haeuser werden von placeVillage schon korrekt gesetzt (via Overrides
    // aus dem Doc). Hier materialisieren wir die zusaetzlichen Objects aus dem Doc.
    // Zuerst alle bisherigen entfernen; ggf. deren Pool-Registrierung auch.
    const pool = (typeof window !== 'undefined') ? window.__lightsPool : null;
    while (this.editGroup.children.length > 0) {
      const o = this.editGroup.children[0];
      if (pool && o.userData.poolReg) pool.unregister(o.userData.poolReg);
      this.editGroup.remove(o);
    }
    for (const o of this.doc.objects) {
      const mesh = spawnPlaceable({
        id: o.id, type: o.type, x: o.x, z: o.z, rotY: o.rotY, scale: o.scale,
        yOffset: o.yOffset || 0,
      });
      if (mesh) {
        this.editGroup.add(mesh);
        this._registerLightIfNeeded(mesh);
      }
    }
    // Pfade materialisieren (Zaeune etc.).
    if (this.pathTool) this.pathTool.materializeAllFromDoc();
  }

  // ---------- Mode-Toggle ---------------------------------------------------

  setEditMode(on) {
    if (this.editMode === on) return;
    this.editMode = on;
    this._toolbar.classList.toggle('on', on);
    this._palette.style.display = on ? 'flex' : 'none';
    this._helpBar.style.display = on ? 'block' : 'none';
    // Kamera-Hilfeleiste unten verstecken, um Ueberlappen zu vermeiden.
    const mh = document.getElementById('mainHelp');
    if (mh) mh.style.display = on ? 'none' : '';
    if (!on) {
      this._clearSelection();
      this._clearGhost();
      this.pendingType = null;
    }
    // Im View-Modus: Kamera rotiert mit linker Maus. Im Bauen-Modus: wir nutzen
    // links fuer Auswahl/Drag — Kamera rotiert mit MITTE oder Alt+Links.
    if (this.controls) {
      if (on) {
        this.controls.mouseButtons = {
          LEFT: null, // behandelt der Editor selbst
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.PAN,
        };
      } else {
        this.controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
      }
    }
    if (typeof window !== 'undefined') window.__editMode = on;
  }

  // ---------- UI -----------------------------------------------------------

  _buildUI() {
    // Toolbar oben links
    const tb = document.createElement('div');
    tb.id = 'editorToolbar';
    tb.style.cssText = [
      'position:fixed', 'left:12px', 'top:12px', 'z-index:30',
      'display:flex', 'gap:6px', 'align-items:center',
      'background:rgba(10,14,32,0.82)', 'color:#eaf0ff',
      'padding:6px 8px', 'border-radius:10px',
      'font:12px/1 ui-monospace,SF Mono,monospace',
      'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
    ].join(';');
    const btn = (label, title) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title || '';
      b.style.cssText = [
        'background:rgba(40,52,88,0.9)', 'color:#eaf0ff', 'border:1px solid #334',
        'padding:6px 10px', 'border-radius:6px', 'cursor:pointer',
        'font:12px ui-monospace,monospace',
      ].join(';');
      b.addEventListener('mouseenter', () => { b.style.background = 'rgba(70,95,160,0.95)'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'rgba(40,52,88,0.9)'; });
      return b;
    };
    const bModeOn = btn('🔨 Bauen', 'Bauen-Modus (B)');
    bModeOn.id = 'btnEditToggle';
    bModeOn.addEventListener('click', () => this.setEditMode(!this.editMode));
    const bExport = btn('📥 Exportieren', 'JSON herunterladen');
    bExport.addEventListener('click', () => exportDoc(this.doc));
    const bImport = btn('📤 Importieren', 'JSON laden');
    bImport.addEventListener('click', () => this._openImport());
    const bReset = btn('↺ Zurücksetzen', 'Standard-Dorf wiederherstellen');
    bReset.addEventListener('click', () => this._confirmReset());
    tb.appendChild(bModeOn);
    tb.appendChild(bExport);
    tb.appendChild(bImport);
    tb.appendChild(bReset);

    // Style-On: wenn editMode aktiv ist, Button gelb hinterlegen.
    const styleOn = document.createElement('style');
    styleOn.textContent = `
      #editorToolbar.on #btnEditToggle { background: #ffb867 !important; color:#2a1c0a !important; border-color:#c88a2d !important; }
      #editorPalette .plt-item:hover { background: rgba(70,95,160,0.6) !important; }
      #editorPalette .plt-item.active { background: #ffb867 !important; color:#2a1c0a !important; }
    `;
    document.head.appendChild(styleOn);

    this.container.appendChild(tb);
    this._toolbar = tb;

    // Palette links unten / Mitte
    const palette = document.createElement('div');
    palette.id = 'editorPalette';
    palette.style.cssText = [
      'position:fixed', 'left:12px', 'top:62px', 'bottom:12px',
      'width:240px', 'z-index:29',
      'background:rgba(10,14,32,0.86)', 'color:#eaf0ff',
      'border-radius:10px', 'padding:8px', 'overflow:auto',
      'font:12px ui-monospace,SF Mono,monospace',
      'display:none', 'flex-direction:column', 'gap:8px',
      'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
    ].join(';');

    // --- Tab-Leiste oben: Objekte | Pfade -------------------------------
    const tabs = document.createElement('div');
    tabs.id = 'editorTabs';
    tabs.style.cssText = [
      'display:flex', 'gap:4px',
      'padding:2px', 'border-radius:7px',
      'background:rgba(255,255,255,0.05)',
    ].join(';');
    const _tabBtn = (id, label) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.tab = id;
      b.style.cssText = [
        'flex:1', 'padding:5px 7px', 'cursor:pointer',
        'border:none', 'border-radius:5px',
        'background:transparent', 'color:#eaf0ff',
        'font:11px ui-monospace,monospace',
      ].join(';');
      b.addEventListener('click', () => this._setActiveTab(id));
      return b;
    };
    const tabObjects = _tabBtn('objects', 'Objekte');
    const tabPaths   = _tabBtn('paths',   'Pfade');
    const tabTerrain = _tabBtn('terrain', 'Gelände');
    const tabPaint   = _tabBtn('paint',   'Malen');
    tabs.appendChild(tabObjects);
    tabs.appendChild(tabPaths);
    tabs.appendChild(tabTerrain);
    tabs.appendChild(tabPaint);
    palette.appendChild(tabs);
    this._tabObjects = tabObjects;
    this._tabPaths   = tabPaths;
    this._tabTerrain = tabTerrain;
    this._tabPaint   = tabPaint;

    // --- Container "Objekte" (altes Palette-Grid) -----------------------
    const objectsPane = document.createElement('div');
    objectsPane.id = 'editorObjectsPane';
    objectsPane.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    palette.appendChild(objectsPane);
    this._objectsPane = objectsPane;

    // --- Container "Pfade" --------------------------------------------------
    const pathsPane = document.createElement('div');
    pathsPane.id = 'editorPathsPane';
    pathsPane.style.cssText = 'display:none;flex-direction:column;gap:8px;';
    palette.appendChild(pathsPane);
    this._pathsPane = pathsPane;

    const pathHead = document.createElement('div');
    pathHead.textContent = 'Zaun-Stil';
    pathHead.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.65;margin-top:4px;';
    pathsPane.appendChild(pathHead);
    const fenceList = document.createElement('div');
    fenceList.style.cssText = 'display:grid;grid-template-columns:1fr;gap:4px;';
    for (const st of FENCE_STYLES) {
      const item = document.createElement('div');
      item.className = 'plt-item fence-style';
      item.dataset.style = st.id;
      item.style.cssText = [
        'cursor:pointer', 'padding:7px 8px', 'border-radius:5px',
        'background:rgba(40,52,88,0.55)', 'border:1px solid #223',
        'display:flex', 'align-items:center', 'gap:8px',
        'font-size:12px',
      ].join(';');
      item.innerHTML = `<span style="font-size:18px;">${st.icon}</span><span>${st.label}</span>`;
      item.addEventListener('click', () => this._selectFenceStyle(st.id));
      fenceList.appendChild(item);
    }
    pathsPane.appendChild(fenceList);
    // Draw button
    const drawBtn = document.createElement('button');
    drawBtn.id = 'btnDrawPath';
    drawBtn.textContent = '✏️ Zaun zeichnen';
    drawBtn.style.cssText = [
      'margin-top:8px', 'padding:8px 10px', 'cursor:pointer',
      'border:1px solid #334', 'border-radius:6px',
      'background:rgba(40,52,88,0.9)', 'color:#eaf0ff',
      'font:12px ui-monospace,monospace',
    ].join(';');
    drawBtn.addEventListener('click', () => this.pathTool.beginDraw(this._activeFenceStyle));
    pathsPane.appendChild(drawBtn);
    this._btnDrawPath = drawBtn;
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:4px;opacity:0.65;font-size:11px;line-height:1.4;';
    hint.innerHTML = 'Klick: Punkt setzen · Doppelklick / Enter: fertig · Esc: abbrechen';
    pathsPane.appendChild(hint);

    // --- Container "Gelände" (Terraforming) ---------------------------------
    const terrainPane = document.createElement('div');
    terrainPane.id = 'editorTerrainPane';
    terrainPane.style.cssText = 'display:none;flex-direction:column;gap:8px;';
    palette.appendChild(terrainPane);
    this._terrainPane = terrainPane;
    this._buildTerrainPane(terrainPane);

    // --- Container "Malen" ---------------------------------------------------
    const paintPane = document.createElement('div');
    paintPane.id = 'editorPaintPane';
    paintPane.style.cssText = 'display:none;flex-direction:column;gap:8px;';
    palette.appendChild(paintPane);
    this._paintPane = paintPane;
    this._buildPaintPane(paintPane);

    // --- Objekt-Kategorien (in objectsPane) -----------------------------
    const byCat = catalogByCategory();
    for (const c of CATEGORIES) {
      const head = document.createElement('div');
      head.textContent = c.label;
      head.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.65;margin-top:4px;';
      objectsPane.appendChild(head);
      const list = document.createElement('div');
      list.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
      for (const e of byCat[c.id]) {
        const item = document.createElement('div');
        item.className = 'plt-item';
        item.dataset.type = e.type;
        item.style.cssText = [
          'cursor:grab', 'padding:6px 4px', 'border-radius:5px',
          'background:rgba(40,52,88,0.55)', 'border:1px solid #223',
          'display:flex', 'flex-direction:column', 'align-items:center', 'gap:3px',
          'font-size:10px', 'text-align:center',
        ].join(';');
        item.draggable = true;
        item.innerHTML = `<div style="font-size:18px;line-height:1;">${e.icon || '◻'}</div><div style="opacity:0.92;">${e.label}</div>`;
        item.addEventListener('click', () => this._selectPaletteType(e.type, item));
        item.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/plain', e.type);
          ev.dataTransfer.effectAllowed = 'copy';
          this._selectPaletteType(e.type, item);
        });
        list.appendChild(item);
      }
      objectsPane.appendChild(list);
    }
    this.container.appendChild(palette);
    // Initial Tab-Setup (default: Objekte).
    this._setActiveTab('objects');
    this._palette = palette;

    // Hilfe-Leiste unten — ZUSAMMENGEFUEHRT: enthaelt Kamera- + Editor-Hinweise.
    // Dadurch gibt es keine ueberlappenden Boxen mehr.
    const help = document.createElement('div');
    help.id = 'editorHelpBar';
    help.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:12px', 'transform:translateX(-50%)',
      'z-index:28', 'background:rgba(10,14,32,0.82)', 'color:#dfe6ff',
      'padding:6px 14px', 'border-radius:8px',
      'font:11px/1.5 ui-monospace,monospace', 'display:none',
      'pointer-events:none',
      'max-width:92vw',
    ].join(';');
    help.innerHTML = [
      '<div><b>Bauen</b>: Klick platziert · Ziehen verschiebt · '
        + '<b>Shift+Ziehen</b>: Höhe · '
        + '<b>R</b>/Alt+Rad: drehen · <b>+/-</b> / Shift+Alt+Rad / Strg+Rad: skalieren · '
        + 'Entf: löschen · Strg+D: duplizieren · Strg+Z/Y: Undo/Redo · Esc: Auswahl weg</div>',
      '<div style="opacity:0.75;margin-top:2px;"><b>Kamera</b>: '
        + 'Alt+Links/Q/E drehen · Mitte dreht · Rechts verschiebt · '
        + 'WASD/Pfeile bewegen · R/F zoomen (Rad ohne Modifier zoomt)</div>',
    ].join('');
    this.container.appendChild(help);
    this._helpBar = help;
  }

  _selectPaletteType(type, itemEl) {
    this.pendingType = type;
    // Beim Palette-Click: Selection abraeumen, damit Alt+Wheel/R am Ghost wirken
    // (nicht am alten Objekt).
    this._clearSelection();
    // active-Hervorhebung
    const prev = this._palette.querySelector('.plt-item.active');
    if (prev) prev.classList.remove('active');
    if (itemEl) itemEl.classList.add('active');
    // Ghost spawnen
    this._spawnGhost(type);
  }

  _setActiveTab(tabId) {
    this._activeTab = tabId;
    const on = (btn, active) => {
      btn.style.background = active ? 'rgba(255,184,103,0.95)' : 'transparent';
      btn.style.color = active ? '#2a1c0a' : '#eaf0ff';
      btn.style.fontWeight = active ? '700' : '400';
    };
    on(this._tabObjects, tabId === 'objects');
    on(this._tabPaths,   tabId === 'paths');
    if (this._tabTerrain) on(this._tabTerrain, tabId === 'terrain');
    if (this._tabPaint)   on(this._tabPaint,   tabId === 'paint');
    this._objectsPane.style.display = (tabId === 'objects') ? 'flex' : 'none';
    this._pathsPane.style.display   = (tabId === 'paths')   ? 'flex' : 'none';
    if (this._terrainPane) this._terrainPane.style.display = (tabId === 'terrain') ? 'flex' : 'none';
    if (this._paintPane)   this._paintPane.style.display   = (tabId === 'paint')   ? 'flex' : 'none';
    // Wenn Objekte-Tab verlassen -> Pending+Ghost abraeumen.
    if (tabId !== 'objects') {
      this.pendingType = null;
      this._clearGhost();
    }
    // Wenn Pfade-Tab verlassen -> aktives Zeichnen abbrechen.
    if (tabId !== 'paths' && this.pathTool.isActive()) {
      this.pathTool.cancelDraw();
    }
    // Wenn Terrain/Paint-Tab verlassen -> Pinsel deaktivieren.
    if (tabId !== 'terrain' && tabId !== 'paint') {
      if (this.terrainTool) {
        this.terrainTool.setActive(false);
      }
      if (this._btnTerrainBrush) {
        this._btnTerrainBrush.textContent = '🖌️ Pinsel aktivieren';
        this._btnTerrainBrush.style.background = 'rgba(40,52,88,0.9)';
        this._btnTerrainBrush.style.color = '#eaf0ff';
      }
      if (this._btnPaintBrush) {
        this._btnPaintBrush.textContent = '🖌️ Pinsel aktivieren';
        this._btnPaintBrush.style.background = 'rgba(40,52,88,0.9)';
        this._btnPaintBrush.style.color = '#eaf0ff';
      }
    }
  }

  _buildTerrainPane(pane) {
    const head = document.createElement('div');
    head.textContent = 'Pinsel';
    head.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.65;margin-top:4px;';
    pane.appendChild(head);
    // Modi-Buttons
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
    const modeBtns = [];
    for (const m of TERRAIN_MODES) {
      const b = document.createElement('div');
      b.className = 'plt-item terrain-mode';
      b.dataset.mode = m.id;
      b.style.cssText = 'cursor:pointer;padding:6px 4px;border-radius:5px;background:rgba(40,52,88,0.55);border:1px solid #223;display:flex;align-items:center;gap:6px;font-size:12px;';
      b.innerHTML = `<span style="font-size:14px;">${m.icon}</span><span>${m.label}</span>`;
      b.addEventListener('click', () => this._selectTerrainMode(m.id));
      modeRow.appendChild(b);
      modeBtns.push(b);
    }
    pane.appendChild(modeRow);
    this._terrainModeBtns = modeBtns;
    // Radius + Strength Slider
    const addSlider = (label, min, max, step, val, onChange) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const l = document.createElement('div');
      l.style.cssText = 'font-size:11px;opacity:0.8;';
      l.textContent = `${label}: ${val}`;
      const s = document.createElement('input');
      s.type = 'range';
      s.min = String(min); s.max = String(max); s.step = String(step);
      s.value = String(val);
      s.style.cssText = 'width:100%;accent-color:#ffb867;';
      s.addEventListener('input', () => {
        const v = parseFloat(s.value);
        l.textContent = `${label}: ${v.toFixed(2)}`;
        onChange(v);
      });
      wrap.appendChild(l);
      wrap.appendChild(s);
      pane.appendChild(wrap);
      return { wrap, slider: s, label: l };
    };
    this._terrainRadiusCtl   = addSlider('Radius', 0.5, 15, 0.1, this.terrainTool.radius, (v) => this.terrainTool.setRadius(v));
    this._terrainStrengthCtl = addSlider('Stärke', 0.02, 1.0, 0.01, this.terrainTool.strength, (v) => this.terrainTool.setStrength(v));
    // Pinsel an/aus Button
    const brushBtn = document.createElement('button');
    brushBtn.id = 'btnTerrainBrush';
    brushBtn.textContent = '🖌️ Pinsel aktivieren';
    brushBtn.style.cssText = 'margin-top:8px;padding:8px 10px;cursor:pointer;border:1px solid #334;border-radius:6px;background:rgba(40,52,88,0.9);color:#eaf0ff;font:12px ui-monospace,monospace;';
    brushBtn.addEventListener('click', () => this._toggleTerrainBrush());
    pane.appendChild(brushBtn);
    this._btnTerrainBrush = brushBtn;
    const h2 = document.createElement('div');
    h2.style.cssText = 'margin-top:4px;opacity:0.65;font-size:11px;line-height:1.4;';
    h2.innerHTML = 'Linke Maus gedrückt halten: malen · [ ] / Shift+[ ] : Radius / Stärke · Esc: Pinsel aus';
    pane.appendChild(h2);
    // Initial-Selection
    this._selectTerrainMode('raise');
  }

  _buildPaintPane(pane) {
    const head = document.createElement('div');
    head.textContent = 'Material';
    head.style.cssText = 'font-size:10px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.65;margin-top:4px;';
    pane.appendChild(head);
    const list = document.createElement('div');
    list.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
    const matBtns = [];
    for (let i = 1; i < PAINT_MATERIALS.length; i++) {
      const m = PAINT_MATERIALS[i];
      const b = document.createElement('div');
      b.className = 'plt-item paint-mat';
      b.dataset.mat = String(i);
      const swatch = m.color
        ? `#${m.color.toString(16).padStart(6, '0')}`
        : '#333';
      b.style.cssText = 'cursor:pointer;padding:6px 4px;border-radius:5px;background:rgba(40,52,88,0.55);border:1px solid #223;display:flex;align-items:center;gap:6px;font-size:12px;';
      b.innerHTML = `<span style="display:inline-block;width:16px;height:16px;background:${swatch};border-radius:3px;border:1px solid #111;"></span><span>${m.label}</span>`;
      b.addEventListener('click', () => this._selectPaintMat(i));
      list.appendChild(b);
      matBtns.push(b);
    }
    pane.appendChild(list);
    this._paintMatBtns = matBtns;
    // Radius + Strength
    const addSlider = (label, min, max, step, val, onChange) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const l = document.createElement('div');
      l.style.cssText = 'font-size:11px;opacity:0.8;';
      l.textContent = `${label}: ${val}`;
      const s = document.createElement('input');
      s.type = 'range';
      s.min = String(min); s.max = String(max); s.step = String(step);
      s.value = String(val);
      s.style.cssText = 'width:100%;accent-color:#ffb867;';
      s.addEventListener('input', () => {
        const v = parseFloat(s.value);
        l.textContent = `${label}: ${v.toFixed(2)}`;
        onChange(v);
      });
      wrap.appendChild(l);
      wrap.appendChild(s);
      pane.appendChild(wrap);
    };
    this._paintRadiusCtl   = addSlider('Radius', 0.5, 15, 0.1, this.terrainTool.radius, (v) => this.terrainTool.setRadius(v));
    this._paintStrengthCtl = addSlider('Stärke', 0.02, 1.0, 0.01, this.terrainTool.strength, (v) => this.terrainTool.setStrength(v));
    const brushBtn = document.createElement('button');
    brushBtn.id = 'btnPaintBrush';
    brushBtn.textContent = '🖌️ Pinsel aktivieren';
    brushBtn.style.cssText = 'margin-top:8px;padding:8px 10px;cursor:pointer;border:1px solid #334;border-radius:6px;background:rgba(40,52,88,0.9);color:#eaf0ff;font:12px ui-monospace,monospace;';
    brushBtn.addEventListener('click', () => this._togglePaintBrush());
    pane.appendChild(brushBtn);
    this._btnPaintBrush = brushBtn;
    const h2 = document.createElement('div');
    h2.style.cssText = 'margin-top:4px;opacity:0.65;font-size:11px;line-height:1.4;';
    h2.innerHTML = 'Linke Maus: malen · [ ] : Radius · Shift+[ ] : Stärke · Esc: Pinsel aus';
    pane.appendChild(h2);
    this._selectPaintMat(1);
  }

  _selectTerrainMode(id) {
    this.terrainTool.setMode(id);
    for (const b of this._terrainModeBtns) {
      const active = b.dataset.mode === id;
      b.style.background = active ? 'rgba(255,184,103,0.95)' : 'rgba(40,52,88,0.55)';
      b.style.color = active ? '#2a1c0a' : '#eaf0ff';
    }
  }

  _selectPaintMat(id) {
    this.terrainTool.setPaintMat(id);
    for (const b of this._paintMatBtns) {
      const active = parseInt(b.dataset.mat, 10) === id;
      b.style.background = active ? 'rgba(255,184,103,0.95)' : 'rgba(40,52,88,0.55)';
      b.style.color = active ? '#2a1c0a' : '#eaf0ff';
    }
  }

  _toggleTerrainBrush() {
    this.terrainTool.setKind('terrain');
    const on = !this.terrainTool.isActive();
    this.terrainTool.setActive(on);
    this._btnTerrainBrush.textContent = on ? '✖ Pinsel aus' : '🖌️ Pinsel aktivieren';
    this._btnTerrainBrush.style.background = on ? '#ffb867' : 'rgba(40,52,88,0.9)';
    this._btnTerrainBrush.style.color = on ? '#2a1c0a' : '#eaf0ff';
    if (this._btnPaintBrush) {
      this._btnPaintBrush.textContent = '🖌️ Pinsel aktivieren';
      this._btnPaintBrush.style.background = 'rgba(40,52,88,0.9)';
      this._btnPaintBrush.style.color = '#eaf0ff';
    }
  }
  _togglePaintBrush() {
    this.terrainTool.setKind('paint');
    const on = !this.terrainTool.isActive();
    this.terrainTool.setActive(on);
    this._btnPaintBrush.textContent = on ? '✖ Pinsel aus' : '🖌️ Pinsel aktivieren';
    this._btnPaintBrush.style.background = on ? '#ffb867' : 'rgba(40,52,88,0.9)';
    this._btnPaintBrush.style.color = on ? '#2a1c0a' : '#eaf0ff';
    if (this._btnTerrainBrush) {
      this._btnTerrainBrush.textContent = '🖌️ Pinsel aktivieren';
      this._btnTerrainBrush.style.background = 'rgba(40,52,88,0.9)';
      this._btnTerrainBrush.style.color = '#eaf0ff';
    }
  }

  _syncBrushSliders() {
    const setCtl = (ctl, label, v, fmt = 2) => {
      if (!ctl) return;
      ctl.slider.value = String(v);
      ctl.label.textContent = `${label}: ${v.toFixed(fmt)}`;
    };
    const r = this.terrainTool.radius, s = this.terrainTool.strength;
    setCtl(this._terrainRadiusCtl,   'Radius', r);
    setCtl(this._terrainStrengthCtl, 'Stärke', s);
    setCtl(this._paintRadiusCtl,     'Radius', r);
    setCtl(this._paintStrengthCtl,   'Stärke', s);
  }

  _selectFenceStyle(id) {
    this._activeFenceStyle = id;
    // Visuell hervorheben.
    const items = this._pathsPane.querySelectorAll('.fence-style');
    items.forEach((it) => {
      const active = it.dataset.style === id;
      it.style.background = active ? 'rgba(255,184,103,0.95)' : 'rgba(40,52,88,0.55)';
      it.style.color = active ? '#2a1c0a' : '#eaf0ff';
    });
    // Falls gerade aktiv gezeichnet wird, Style live wechseln.
    if (this.pathTool.mode === 'DRAWING') {
      this.pathTool.style = id;
      // Ghost refresh
      this.pathTool.onCanvasMove(0, 0);
    }
  }

  // ---------- Import/Export/Reset ------------------------------------------

  _openImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      if (!input.files || !input.files[0]) return;
      try {
        const doc = await importDocFromFile(input.files[0]);
        this._applyDoc(doc, { reloadVillage: true });
      } catch (e) {
        alert('Importieren fehlgeschlagen: ' + e.message);
      }
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  _confirmReset() {
    const ok = confirm('Standard-Dorf wiederherstellen?\nAlle eigenen Änderungen gehen verloren.');
    if (!ok) return;
    this._applyDoc(defaultDoc(), { reloadVillage: true });
  }

  _applyDoc(newDoc, opts = {}) {
    this.doc = newDoc;
    saveToStorage(this.doc);
    this._rebuildFromDoc();
    // Haus-Overrides brauchen einen Re-Build des Dorfes. Fuer Phase 1 geschieht
    // das via location.reload() — die Alternative waere, placeVillage inkrementell
    // anwendbar zu machen; das sprengt den Umfang. Die UX ist OK (geht schnell).
    if (opts.reloadVillage) {
      // Give storage eine Mikrosekunde, dann reload.
      setTimeout(() => location.reload(), 60);
    }
  }

  // ---------- Pointer / Raycast --------------------------------------------

  _ndcFromEvent(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouseNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseNDC.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  }

  _groundHit() {
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    // Flache Ebene bei y=0 reicht fuer Phase 1 — terrain ist nahezu flach.
    const hit = new THREE.Vector3();
    const ok = this.ray.ray.intersectPlane(this._groundPlane, hit);
    return ok ? hit : null;
  }

  // Schnittpunkt des aktuellen Mausstrahls mit einer vertikalen Ebene durch
  // (objX, 0, objZ), deren Normale horizontal zur Kamera zeigt. Rueckgabe: Y
  // des Treffers (Welt-Koordinate). Wird fuer Shift-Drag (Hoehen-Modus) genutzt.
  _verticalPlaneHitY(objX, objZ) {
    const cx = this.camera.position.x - objX;
    const cz = this.camera.position.z - objZ;
    let nL = Math.hypot(cx, cz);
    if (nL < 1e-3) nL = 1;
    const normal = new THREE.Vector3(cx / nL, 0, cz / nL);
    const coplanar = new THREE.Vector3(objX, 0, objZ);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, coplanar);
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    const hit = new THREE.Vector3();
    const ok = this.ray.ray.intersectPlane(plane, hit);
    return ok ? hit.y : null;
  }

  _pickEditable() {
    this.ray.setFromCamera(this.mouseNDC, this.camera);
    // Sammelt alle editierbaren Roots (edit-group + Standard-Haeuser)
    const candidates = [];
    this.scene.traverse((o) => {
      if (o.userData && o.userData.editable) candidates.push(o);
    });
    // Instanced-Pools fuer prozedurale Objekte zusaetzlich sammeln.
    const procInstanced = [];
    for (const p of this._procPickers) {
      for (const im of p.instancedMeshes) procInstanced.push(im);
    }
    for (const root of candidates) root.updateMatrixWorld(true);
    for (const pm of procInstanced) pm.updateMatrixWorld(true);
    const allTargets = candidates.concat(procInstanced);
    const hits = this.ray.intersectObjects(allTargets, true);
    if (!hits.length) return null;
    const hit = hits[0];
    // Pruefen: ist der Treffer ein InstancedMesh aus den procPickers?
    for (const picker of this._procPickers) {
      if (picker.instancedMeshes.includes(hit.object) && hit.instanceId != null) {
        const meta = picker.meta[hit.instanceId];
        if (!meta) continue;
        if (meta._placedMesh) return meta._placedMesh;
        return this._materializeProcInstance(picker, hit.instanceId);
      }
    }
    // Zum Root aufsteigen (normale Objekte)
    let n = hit.object;
    while (n && !(n.userData && n.userData.editable)) n = n.parent;
    return n || null;
  }

  // procOverrides auf alle bereits einzeln platzierten prozeduralen Objekte
  // (z.B. Felsen aus scatterNature) anwenden. Muss aufgerufen werden NACH
  // scatterNature + placeDecor, damit alle userData.editable-Objekte existieren.
  applyProcOverridesToScene() {
    if (!this.doc.procOverrides) return;
    const byId = new Map();
    this.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (e && e.procId) byId.set(e.procId, o);
    });
    for (const [id, ov] of Object.entries(this.doc.procOverrides)) {
      const o = byId.get(id);
      if (!o) continue;  // kein passendes Objekt (evtl. aus Picker-Pool)
      if (ov.deleted) {
        if (o.parent) o.parent.remove(o);
        continue;
      }
      const e = o.userData && o.userData.editable;
      // yOffset VOR Positions-Update einlesen, damit die neue y korrekt wird.
      if (Number.isFinite(ov.yOffset) && e) e.yOffset = ov.yOffset;
      const yOff = (e && e.yOffset) || 0;
      if (ov.x != null || ov.z != null || Number.isFinite(ov.yOffset)) {
        const nx = ov.x ?? o.position.x;
        const nz = ov.z ?? o.position.z;
        // Bruecken behalten y=0 + yOffset (Geometrie liegt auf Fluss-Niveau).
        const ny = ((e && e.isBridge) ? 0 : sampleHeight(nx, nz)) + yOff;
        o.position.set(nx, ny, nz);
      }
      if (ov.rotY != null) o.rotation.y = ov.rotY;
      if (ov.scale != null) {
        o.scale.setScalar(ov.scale);
        o.userData.editable.scale = ov.scale;
      }
    }
  }

  // Registriere einen prozeduralen Picker.
  //   { instancedMeshes: [InstancedMesh,...], meta: [{id,type,x,z,rotY,scale,...}], buildMesh?(meta)=>Object3D }
  // Optional legacy-form: (instancedMesh, meta) wird akzeptiert.
  registerProcPicker(a, b) {
    let entry;
    if (a && a.instancedMeshes && a.meta) {
      entry = { instancedMeshes: a.instancedMeshes, meta: a.meta, buildMesh: a.buildMesh };
    } else if (a && a.isInstancedMesh && Array.isArray(b)) {
      entry = { instancedMeshes: [a], meta: b, buildMesh: null };
    } else {
      return;
    }
    this._procPickers.push(entry);
    // procOverrides aus dem Doc anwenden (verschoben / geloescht / skaliert).
    for (let i = 0; i < entry.meta.length; i++) {
      const m = entry.meta[i];
      const ov = this.doc.procOverrides && this.doc.procOverrides[m.id];
      if (!ov) continue;
      if (ov.deleted) {
        this._hidePoolInstance(entry.instancedMeshes, i);
      } else if (ov.x != null || ov.z != null || ov.rotY != null || ov.scale != null
                || Number.isFinite(ov.yOffset)) {
        // Pool-Instance verstecken + Einzel-Objekt am Override-Standpunkt platzieren.
        this._hidePoolInstance(entry.instancedMeshes, i);
        const mesh = this._buildProcMesh(entry, m, {
          x: ov.x ?? m.x, z: ov.z ?? m.z,
          rotY: ov.rotY ?? m.rotY, scale: ov.scale ?? m.scale,
          yOffset: ov.yOffset || 0,
        });
        if (mesh) {
          this.editGroup.add(mesh);
          m._placedMesh = mesh;
        }
      }
    }
  }

  _hidePoolInstance(instancedMeshes, instanceId) {
    const zeroMat = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    for (const im of instancedMeshes) {
      im.setMatrixAt(instanceId, zeroMat);
      im.instanceMatrix.needsUpdate = true;
    }
  }

  _buildProcMesh(picker, meta, pos) {
    const yOff = Number.isFinite(pos.yOffset) ? pos.yOffset : 0;
    const mesh = picker.buildMesh
      ? picker.buildMesh({ ...meta, ...pos })
      : spawnPlaceable({
          id: meta.id, type: meta.type,
          x: pos.x, z: pos.z, rotY: pos.rotY, scale: pos.scale,
          yOffset: yOff,
        });
    if (!mesh) return null;
    // Benutzerdefinierter buildMesh (z.B. Baeume) setzt y nicht selbst korrekt
    // mit yOffset — hier zentral anwenden. Bruecken stehen sowieso auf y=0.
    const isBridge = typeof meta.type === 'string' && meta.type.startsWith('bridge.');
    if (yOff !== 0) {
      if (isBridge) mesh.position.y = yOff;
      else          mesh.position.y = sampleHeight(pos.x, pos.z) + yOff;
    }
    mesh.userData.editable = {
      id: meta.id,
      type: meta.type,
      scale: pos.scale,
      standardHouseId: null,
      procId: meta.id,
      isBridge,
      yOffset: yOff,
    };
    mesh.name = 'editable:' + meta.type + ':' + meta.id;
    return mesh;
  }

  // Materialisiert eine Instance als eigenstaendiges Mesh (editierbar).
  _materializeProcInstance(picker, instanceId) {
    const meta = picker.meta[instanceId];
    if (!meta) return null;
    // Alle Instanzen (crown + trunk, oder post+arm+cage...) der GLEICHEN
    // instanceId in allen InstancedMeshes dieser Picker-Gruppe verstecken.
    this._hidePoolInstance(picker.instancedMeshes, instanceId);
    const ov = this.doc.procOverrides && this.doc.procOverrides[meta.id];
    const yOff = (ov && Number.isFinite(ov.yOffset)) ? ov.yOffset : 0;
    const mesh = this._buildProcMesh(picker, meta, {
      x: meta.x, z: meta.z, rotY: meta.rotY, scale: meta.scale, yOffset: yOff,
    });
    if (!mesh) return null;
    this.editGroup.add(mesh);
    meta._placedMesh = mesh;
    return mesh;
  }

  _bindPointer() {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointermove', (ev) => {
      if (!this.editMode) return;
      this._ndcFromEvent(ev);
      // Terrain-/Paint-Brush aktiv -> Pinselstrich (nur Bodenhit noetig).
      if (this.terrainTool && this.terrainTool.isActive()) {
        const p = this._groundHit();
        if (p) this.terrainTool.onPointerMove(p.x, p.z);
        return;
      }
      if (this.hoverGhost) {
        const p = this._groundHit();
        if (p) {
          const ok = this._ghostValidAt(p.x, p.z);
          this.hoverGhost.position.set(p.x, sampleHeight(p.x, p.z), p.z);
          this._tintGhost(ok);
          this.lastValidGhostPos = ok ? { x: p.x, z: p.z } : null;
        }
      }
      if (this.draggingSelected && this.selected) {
        const e = this.selected.userData.editable;
        if (ev.shiftKey) {
          // Hoehen-Drag: vertikale Ebene durch das Objekt in Richtung Kamera.
          // Mausbewegung in Y-Richtung veraendert den Hoehen-Offset.
          const mouseY = this._verticalPlaneHitY(this.selected.position.x, this.selected.position.z);
          if (mouseY != null) {
            if (!this._dragHeightActive) {
              this._dragHeightActive = true;
              this._dragHeightStartMouseY = mouseY;
              this._dragHeightStartOffset = (e && e.yOffset) || 0;
            }
            const newOff = this._dragHeightStartOffset + (mouseY - this._dragHeightStartMouseY);
            if (e) e.yOffset = newOff;
            const baseY = (e && e.isBridge) ? 0 : sampleHeight(this.selected.position.x, this.selected.position.z);
            this.selected.position.y = baseY + newOff;
            this._updateSelectionBox();
          }
        } else {
          // Shift gerade losgelassen? Cursor-Offset setzen, damit das Objekt
          // nicht zur Maus springt sondern von der aktuellen Position aus
          // dem Cursor folgt.
          if (this._dragHeightActive) {
            this._dragHeightActive = false;
            const p0 = this._groundHit();
            if (p0) {
              this._dragCursorOffset = {
                dx: this.selected.position.x - p0.x,
                dz: this.selected.position.z - p0.z,
              };
            }
          }
          const p = this._groundHit();
          if (p) {
            const off = this._dragCursorOffset || { dx: 0, dz: 0 };
            const nx = p.x + off.dx;
            const nz = p.z + off.dz;
            // Bruecken liegen bewusst auf y=0 (Geometrie steht selbst um
            // RIVER_SURFACE herum). Alles andere folgt dem Terrain.
            const yOff = (e && e.yOffset) || 0;
            const y = ((e && e.isBridge) ? 0 : sampleHeight(nx, nz)) + yOff;
            this.selected.position.set(nx, y, nz);
            this._updateSelectionBox();
          }
        }
      }
      // Pfad-Werkzeug: Ghost folgt Maus (DRAWING).
      if (this.pathTool && this.pathTool.mode === 'DRAWING') {
        const p = this._groundHit();
        if (p) this.pathTool.onCanvasMove(p.x, p.z);
      }
      // Pfad-Werkzeug: Handle-Drag (EDITING).
      if (this.pathTool && this._pathDragHandle >= 0) {
        const p = this._groundHit();
        if (p) this.pathTool.dragHandle(this._pathDragHandle, p.x, p.z);
      }
    });

    // dragover + drop fuer HTML5 DnD
    dom.addEventListener('dragover', (ev) => {
      if (!this.editMode) return;
      ev.preventDefault();
      this._ndcFromEvent(ev);
      if (!this.hoverGhost && this.pendingType) {
        this._spawnGhost(this.pendingType);
      }
      if (this.hoverGhost) {
        const p = this._groundHit();
        if (p) {
          const ok = this._ghostValidAt(p.x, p.z);
          this.hoverGhost.position.set(p.x, sampleHeight(p.x, p.z), p.z);
          this._tintGhost(ok);
          this.lastValidGhostPos = ok ? { x: p.x, z: p.z } : null;
        }
      }
    });
    dom.addEventListener('drop', (ev) => {
      if (!this.editMode) return;
      ev.preventDefault();
      const type = ev.dataTransfer?.getData('text/plain') || this.pendingType;
      if (!type) return;
      this._ndcFromEvent(ev);
      const p = this._groundHit();
      if (!p) return;
      if (!this._ghostValidAt(p.x, p.z)) return;
      this._placeAt(type, p.x, p.z);
    });

    dom.addEventListener('pointerdown', (ev) => {
      if (!this.editMode) return;
      if (ev.button !== 0) return; // nur linke Maus
      // Alt+Linksklick im Bauen-Modus: Kamera-Drag (temporaer OrbitControls-Rotate).
      // OrbitControls nicht angreifen — stattdessen MouseButtons umschalten + Event
      // durchlassen, indem wir hier nichts tun. Siehe setEditMode: LEFT:null.
      // Wir setzen temporaer LEFT:ROTATE solange Alt gedrueckt ist.
      if (ev.altKey) {
        if (this.controls) {
          this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN,
          };
        }
        return; // Standard-OrbitControls uebernimmt
      }
      this._ndcFromEvent(ev);
      // 0-pre) Wenn Terrain-/Paint-Brush aktiv ist -> Pinselstrich starten.
      if (this.terrainTool && this.terrainTool.isActive()) {
        const p = this._groundHit();
        if (p) {
          this.terrainTool.onPointerDown(p.x, p.z);
          // Capture pointer so we keep receiving pointerup even outside canvas.
          try { dom.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        }
        return;
      }
      // 0) Wenn Pfad-Werkzeug aktiv ist (DRAWING): Punkt setzen.
      if (this.pathTool && this.pathTool.mode === 'DRAWING') {
        const p = this._groundHit();
        if (p) {
          // Doppelklick-Erkennung: zwei Klicks < 300 ms = finish.
          const now = performance.now();
          if (this._lastPathClickAt && (now - this._lastPathClickAt) < 300) {
            this.pathTool.finishDraw();
            this._lastPathClickAt = 0;
            return;
          }
          this._lastPathClickAt = now;
          this.pathTool.onCanvasClick(p.x, p.z);
        }
        return;
      }
      // 0b) Wenn Pfad-Werkzeug EDITING: Handle-Klick erkennen -> Drag starten.
      if (this.pathTool && this.pathTool.mode === 'EDITING') {
        const p = this._groundHit();
        if (p) {
          const hIdx = this.pathTool.pickHandleAt(p.x, p.z, 1.2);
          if (hIdx >= 0) {
            this._pathDragHandle = hIdx;
            // Snapshot der Punkte VOR dem Drag fuer Undo.
            const entry = this.pathTool._activePathEntry;
            if (entry) {
              this._pathDragStart = {
                id: entry.id,
                before: entry.points.map((q) => ({ x: q.x, z: q.z })),
              };
            }
            return;
          }
        }
      }
      // 1) Wenn Palette-Typ ausgewaehlt ist -> platzieren
      if (this.pendingType) {
        const p = this._groundHit();
        if (p && this._ghostValidAt(p.x, p.z)) {
          this._placeAt(this.pendingType, p.x, p.z);
        }
        return;
      }
      // 2) Sonst: Objekt picken
      const picked = this._pickEditable();
      if (picked) {
        this._select(picked);
        this.draggingSelected = true;
        // Drag-State zuruecksetzen: kein Cursor-Offset, kein Hoehen-Modus.
        // Bei Shift ab dem ersten Move wird _dragHeightActive erst lazy aktiv.
        this._dragCursorOffset = { dx: 0, dz: 0 };
        this._dragHeightActive = false;
        this._dragHeightStartMouseY = 0;
        this._dragHeightStartOffset = 0;
        // Wenn das gepickte Objekt ein Pfad ist: Pfad-Werkzeug in EDIT-Mode.
        if (picked.userData && picked.userData.editable && picked.userData.editable.isPath) {
          this.pathTool.beginEditPath(picked);
        } else if (this.pathTool.mode === 'EDITING') {
          // Verlasse EditMode wenn etwas anderes gepickt wurde.
          this.pathTool._endEditing();
        }
        // Alter Zustand fuer Undo merken (inkl. yOffset).
        this._dragStart = this._snapshotSelected();
      } else {
        this._clearSelection();
        if (this.pathTool.mode === 'EDITING') this.pathTool._endEditing();
      }
    });
    // Nach Alt-Loslassen: zurueck in den normalen Bauen-Mausmodus.
    window.addEventListener('keyup', (ev) => {
      if (!this.editMode) return;
      if (ev.code === 'AltLeft' || ev.code === 'AltRight') {
        if (this.controls) {
          this.controls.mouseButtons = {
            LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN,
          };
        }
      }
    });

    dom.addEventListener('pointerup', (ev) => {
      if (!this.editMode) return;
      if (ev.button !== 0) return;
      // Terrain-/Paint-Brush aktiv -> Stroke commiten.
      if (this.terrainTool && this.terrainTool.isActive()) {
        this.terrainTool.onPointerUp();
        try { dom.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        return;
      }
      if (this.draggingSelected && this.selected && this._dragStart) {
        const now = this._snapshotSelected();
        const dYOff = Math.abs((now.yOffset || 0) - (this._dragStart.yOffset || 0));
        if (now.x !== this._dragStart.x || now.z !== this._dragStart.z || dYOff > 1e-4) {
          this._pushUndo({ kind: 'move', id: this._dragStart.id, before: this._dragStart, after: now });
          this._writeSelectedToDoc();
        }
      }
      this.draggingSelected = false;
      this._dragStart = null;
      this._dragHeightActive = false;
      this._dragCursorOffset = null;
      // Pfad-Handle-Drag beenden — Undo-Eintrag erzeugen wenn Punkte veraendert.
      if (this._pathDragHandle >= 0) {
        this._pathDragHandle = -1;
        if (this._pathDragStart && this.pathTool._activePathEntry) {
          const entry = this.pathTool._activePathEntry;
          const after = entry.points.map((q) => ({ x: q.x, z: q.z }));
          const before = this._pathDragStart.before;
          // Pruefen ob wirklich geaendert
          let changed = false;
          for (let i = 0; i < Math.min(before.length, after.length); i++) {
            if (Math.abs(before[i].x - after[i].x) > 1e-4
                || Math.abs(before[i].z - after[i].z) > 1e-4) { changed = true; break; }
          }
          if (changed) {
            this._pushUndo({
              kind: 'pathEdit',
              id: this._pathDragStart.id,
              before, after,
            });
          }
        }
        this._pathDragStart = null;
        this._markDirty();
      }
    });

    // Mausrad in Bauen-Modus: Modifikator-abhaengig.
    //   Alt+Rad                 -> drehen (Ghost ODER ausgewaehltes Objekt) — ZOOM BLOCKED.
    //   Shift+Alt+Rad / Strg+Rad -> skalieren (Ghost ODER ausgewaehltes Objekt).
    //   sonst                   -> Standard-OrbitControls-Zoom (durchlassen).
    dom.addEventListener('wheel', (ev) => {
      if (!this.editMode) return;
      const hasAlt = ev.altKey;
      const hasShiftAlt = ev.altKey && ev.shiftKey;
      const hasCtrl = ev.ctrlKey || ev.metaKey;
      if (!hasAlt && !hasCtrl) return; // Standard-Zoom darf durch
      // Alt bzw. Strg Rad fuer Editor: Kamera-Zoom WAEHREND der Aktion unterdruecken.
      ev.preventDefault();
      ev.stopPropagation();
      const dir = ev.deltaY < 0 ? 1 : -1;
      const target = this.selected || this.hoverGhost;
      if (!target) return;
      if (hasShiftAlt || hasCtrl) {
        // Skalieren
        const step = 1 + dir * 0.08;
        this._scaleTarget(target, step);
      } else if (hasAlt) {
        // Drehen (feines Raster per Shift — aber Shift+Alt ist schon skalieren.
        // Deshalb nur plain Alt -> 15-Grad-Raster; Shift wuerde Skalierung sein).
        const step = Math.PI / 12; // 15 Grad
        this._rotateTarget(target, dir * step, { snap15: true });
      }
    }, { passive: false, capture: true });
  }

  _bindHotkeys() {
    window.addEventListener('keydown', (ev) => {
      // Mode-Toggle: 'b' / 'B' funktioniert immer
      if (ev.code === 'KeyB' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !isTypingTarget(ev.target)) {
        this.setEditMode(!this.editMode);
        ev.preventDefault();
        return;
      }
      if (!this.editMode) return;
      if (isTypingTarget(ev.target)) return;

      // Undo / Redo
      if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyZ' && !ev.shiftKey) {
        ev.preventDefault();
        this._undo();
        return;
      }
      if (((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyZ' && ev.shiftKey)
          || ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyY')) {
        ev.preventDefault();
        this._redo();
        return;
      }
      // Duplicate (nur mit Auswahl)
      if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyD' && this.selected) {
        ev.preventDefault();
        this._duplicateSelected();
        return;
      }
      // Escape raeumt IMMER Auswahl + pendingType + Ghost + aktives Zeichnen auf.
      if (ev.code === 'Escape') {
        // Terrain-/Paint-Pinsel aus.
        if (this.terrainTool && this.terrainTool.isActive()) {
          this.terrainTool.setActive(false);
          if (this._btnTerrainBrush) {
            this._btnTerrainBrush.textContent = '🖌️ Pinsel aktivieren';
            this._btnTerrainBrush.style.background = 'rgba(40,52,88,0.9)';
            this._btnTerrainBrush.style.color = '#eaf0ff';
          }
          if (this._btnPaintBrush) {
            this._btnPaintBrush.textContent = '🖌️ Pinsel aktivieren';
            this._btnPaintBrush.style.background = 'rgba(40,52,88,0.9)';
            this._btnPaintBrush.style.color = '#eaf0ff';
          }
          ev.preventDefault();
          return;
        }
        if (this.pathTool && this.pathTool.mode === 'DRAWING') {
          this.pathTool.cancelDraw();
          ev.preventDefault();
          return;
        }
        if (this.pathTool && this.pathTool.mode === 'EDITING') {
          this.pathTool._endEditing();
        }
        this._clearSelection();
        this._clearGhost();
        this.pendingType = null;
        const prev = this._palette.querySelector('.plt-item.active');
        if (prev) prev.classList.remove('active');
        ev.preventDefault();
        return;
      }
      // Enter: Pfadzeichnen abschliessen.
      if ((ev.code === 'Enter' || ev.code === 'NumpadEnter')
          && this.pathTool && this.pathTool.mode === 'DRAWING') {
        this.pathTool.finishDraw();
        ev.preventDefault();
        return;
      }
      // R rotiert IMMER: Ghost (wenn gerade platziert wird) oder Selected.
      if (ev.code === 'KeyR') {
        ev.preventDefault();
        const step = ev.shiftKey ? 0.02 : Math.PI / 12;
        const target = this.selected || this.hoverGhost;
        if (target) this._rotateTarget(target, step, { snap15: !ev.shiftKey });
        return;
      }
      // Terrain-/Paint-Brush: [ ] Radius, Shift+[ ] Staerke. Nur wenn Pinsel aktiv.
      // Muss VOR dem Scale-Handler stehen, der sonst BracketRight als '+' frisst.
      if (this.terrainTool && this.terrainTool.isActive()
          && (ev.code === 'BracketLeft' || ev.code === 'BracketRight')) {
        ev.preventDefault();
        const inc = (ev.code === 'BracketRight') ? 1 : -1;
        if (ev.shiftKey) {
          const s = this.terrainTool.strength + inc * 0.05;
          this.terrainTool.setStrength(s);
        } else {
          const r = this.terrainTool.radius + inc * 0.5;
          this.terrainTool.setRadius(r);
        }
        this._syncBrushSliders();
        return;
      }
      // + / - skalieren (NumpadAdd/Subtract + Equal/Minus). Target: Selected ODER Ghost.
      if (ev.code === 'Equal' || ev.code === 'NumpadAdd' || ev.code === 'BracketRight') {
        ev.preventDefault();
        const t = this.selected || this.hoverGhost;
        if (t) this._scaleTarget(t, 1.08);
        return;
      }
      if (ev.code === 'Minus' || ev.code === 'NumpadSubtract' || ev.code === 'Slash') {
        ev.preventDefault();
        const t = this.selected || this.hoverGhost;
        if (t) this._scaleTarget(t, 1 / 1.08);
        return;
      }
      if (!this.selected) return;
      // Loeschen
      if (ev.code === 'Delete' || ev.code === 'Backspace') {
        ev.preventDefault();
        // Pfad: Spezialfall (loeschen mit Doc-Cleanup + Undo).
        if (this.selected.userData.editable
            && this.selected.userData.editable.isPath
            && this.pathTool.mode === 'EDITING') {
          const entry = this.pathTool._activePathEntry;
          const snapshot = entry ? { ...entry, points: entry.points.map((q) => ({ ...q })) } : null;
          const id = this.pathTool.deleteActivePath();
          this._clearSelection();
          if (snapshot) {
            this._pushUndo({ kind: 'pathDelete', id, snapshot });
          }
          return;
        }
        this._deleteSelected();
        return;
      }
    });
  }

  // ---------- Ghost + Validierung ------------------------------------------

  _spawnGhost(type) {
    this._clearGhost();
    const entry = getCatalogEntry(type);
    if (!entry) return;
    const defaults = this._typeDefaults[type] || {};
    const rotY = defaults.rotY ?? 0;
    const scale = defaults.scale ?? entry.defaultScale;
    const g = spawnPlaceable({ id: 'ghost', type, x: 0, z: 0, rotY, scale });
    if (!g) return;
    g.userData.ghost = true;
    // Semi-transparent machen, keine Schatten
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
        o.material.depthWrite = false;
      }
    });
    this.scene.add(g);
    this.hoverGhost = g;
  }

  _tintGhost(ok) {
    if (!this.hoverGhost) return;
    const col = ok ? COLOR_OK : COLOR_BAD;
    this.hoverGhost.traverse((o) => {
      if (o.isMesh && o.material) {
        if (!o.material.emissive) return;
        o.material.emissive.copy(col);
        o.material.emissiveIntensity = 0.75;
      }
    });
  }

  _clearGhost() {
    if (this.hoverGhost) {
      this.scene.remove(this.hoverGhost);
      this.hoverGhost = null;
      this.lastValidGhostPos = null;
    }
  }

  _ghostValidAt(x, z) {
    const entry = getCatalogEntry(this.pendingType);
    const type = entry ? entry.type : '';
    const isBridge = type.startsWith('bridge.');
    // Bruecken DUERFEN ueber Wasser liegen — ihre Kollisionsregel ist umgekehrt.
    if (!isBridge && distanceToRivers(x, z) < 0.8) return false;
    if (!entry) return true;
    const isHouse = entry.type.startsWith('house.');
    // Beruecksichtige Skalierung bei Kollisionscheck
    const sc = this._typeDefaults[type]?.scale ?? entry.defaultScale ?? 1;
    const houseR = isHouse ? Math.max(1.0, 2.2 * (sc / 3.2)) : 2.2;
    if (!isHouse) return true;
    // Scan Haeuser
    let bad = false;
    this.scene.traverse((o) => {
      if (bad) return;
      if (!o.userData || !o.userData.editable) return;
      // Ghost-Objekt und gerade ausgewaehltes Objekt nicht gegen sich selbst kollidieren lassen.
      if (o.userData.ghost) return;
      if (o === this.selected) return;
      if (!o.userData.editable.type || !o.userData.editable.type.startsWith('house.')) return;
      const dx = o.position.x - x;
      const dz = o.position.z - z;
      if (Math.hypot(dx, dz) < houseR) bad = true;
    });
    return !bad;
  }

  // ---------- Platzieren / Auswahl / Operationen ---------------------------

  _placeAt(type, x, z) {
    const id = nextId('obj');
    const entry = getCatalogEntry(type);
    const defaults = this._typeDefaults[type] || {};
    // Rotation/Groesse vom Ghost uebernehmen (fallback: catalog-default).
    const rotY = this.hoverGhost ? this.hoverGhost.rotation.y : (defaults.rotY ?? 0);
    const scale = this.hoverGhost
      ? (this.hoverGhost.userData.editable?.scale ?? defaults.scale ?? (entry ? entry.defaultScale : 1))
      : (defaults.scale ?? (entry ? entry.defaultScale : 1));
    const yOffset = 0;
    const mesh = spawnPlaceable({ id, type, x, z, rotY, scale, yOffset });
    if (!mesh) return;
    this.editGroup.add(mesh);
    this.doc.objects.push({ id, type, x, z, rotY, scale, yOffset });
    // Lichter beim Pool registrieren.
    this._registerLightIfNeeded(mesh);
    this._pushUndo({ kind: 'create', id, snapshot: { id, type, x, z, rotY, scale, yOffset } });
    this._markDirty();
    this._select(mesh);
  }

  _registerLightIfNeeded(mesh) {
    if (!mesh || !mesh.userData.editable || !mesh.userData.editable.isLight) return;
    const pool = (typeof window !== 'undefined') ? window.__lightsPool : null;
    if (!pool) return;
    // Lampenmeshes haben lightGlowMaterials/lightOffset.
    const mats = mesh.userData.lightGlowMaterials || [];
    const offset = mesh.userData.lightOffset || new THREE.Vector3(0, 0.5, 0);
    const worldPos = mesh.position.clone().add(offset);
    const reg = pool.register({
      position: worldPos,
      color: mesh.userData.lightColor ?? 0xffa858,
      distance: mesh.userData.lightDistance ?? 7,
      baseIntensity: mesh.userData.lightBaseIntensity ?? 2.5,
      emissiveMaterials: mats,
    });
    mesh.userData.poolReg = reg;
  }

  _select(obj) {
    this._clearSelection();
    this.selected = obj;
    const bh = newBoxHelper(obj, COLOR_SEL);
    this.scene.add(bh);
    this._selBox = bh;
  }

  _clearSelection() {
    // Haengende Scale-Undo-Operation sofort abschliessen.
    if (this._pendingScaleOp) this._commitPendingScaleUndo();
    if (this._selBox) {
      this.scene.remove(this._selBox);
      this._selBox = null;
    }
    this.selected = null;
  }

  _updateSelectionBox() {
    if (this._selBox && this.selected) {
      this._selBox.update();
    }
  }

  _snapshotSelected() {
    const s = this.selected;
    if (!s) return null;
    return {
      id: s.userData.editable.id,
      type: s.userData.editable.type,
      x: s.position.x, z: s.position.z,
      rotY: s.rotation.y,
      scale: s.userData.editable.scale,
      yOffset: s.userData.editable.yOffset || 0,
    };
  }

  _writeSelectedToDoc() {
    // Entscheidet: Standard-Haus-Override, prozedurales Override, oder objects-Eintrag.
    const s = this.selected;
    if (!s) return;
    const e = s.userData.editable;
    const yOff = e.yOffset || 0;
    if (e.standardHouseId) {
      // Override anlegen/aktualisieren
      const ov = this.doc.houses.overrides[e.standardHouseId] || {};
      ov.x = s.position.x;
      ov.z = s.position.z;
      ov.rotY = s.rotation.y;
      ov.scale = e.scale;
      ov.yOffset = yOff;
      this.doc.houses.overrides[e.standardHouseId] = ov;
    } else if (e.procId) {
      // prozedurales Override (Baum, Felsen, Deko etc.)
      setProcOverride(this.doc, e.procId, {
        x: s.position.x, z: s.position.z,
        rotY: s.rotation.y, scale: e.scale,
        yOffset: yOff,
      });
    } else {
      // objects-Eintrag
      const idx = this.doc.objects.findIndex((o) => o.id === e.id);
      const entry = {
        id: e.id,
        type: e.type,
        x: s.position.x, z: s.position.z,
        rotY: s.rotation.y,
        scale: e.scale,
        yOffset: yOff,
      };
      if (idx >= 0) this.doc.objects[idx] = entry;
      else this.doc.objects.push(entry);
    }
    this._markDirty();
  }

  _rotateSelected(delta, { snap15 = true } = {}) {
    if (!this.selected) return;
    const before = this._snapshotSelected();
    let newRot = this.selected.rotation.y + delta;
    if (snap15) {
      const step = Math.PI / 12; // 15 Grad
      newRot = Math.round(newRot / step) * step;
    }
    this.selected.rotation.y = newRot;
    this._updateSelectionBox();
    const after = this._snapshotSelected();
    this._pushUndo({ kind: 'rotate', id: before.id, before, after });
    this._writeSelectedToDoc();
  }

  // Rotieren fuer belieb. Target (Ghost oder Selected). Merkt sich die
  // Rotation pro Typ, damit sie beim Platzieren erhalten bleibt.
  _rotateTarget(obj, delta, { snap15 = true } = {}) {
    if (!obj) return;
    if (obj === this.selected) { this._rotateSelected(delta, { snap15 }); return; }
    // Ghost
    let nR = obj.rotation.y + delta;
    if (snap15) {
      const step = Math.PI / 12;
      nR = Math.round(nR / step) * step;
    }
    obj.rotation.y = nR;
    if (obj.userData.ghost && this.pendingType) {
      this._typeDefaults[this.pendingType] = this._typeDefaults[this.pendingType] || {};
      this._typeDefaults[this.pendingType].rotY = nR;
    }
  }

  _scaleTarget(obj, factor) {
    if (!obj) return;
    const ed = obj.userData.editable;
    const curS = ed?.scale ?? obj.scale.x;
    // Snapshot VOR Aenderung festhalten, falls das der Start einer Scale-
    // Sequenz auf dem selektierten Objekt ist.
    let snapBefore = null;
    if (obj === this.selected && !this._pendingScaleOp) {
      snapBefore = this._snapshotSelected(); // enthaelt curS
    }
    const entry = ed ? getCatalogEntry(ed.type) : null;
    const defS = entry ? entry.defaultScale : 1;
    const minS = defS * 0.5;
    const maxS = defS * 2;
    const newS = Math.max(minS, Math.min(maxS, curS * factor));
    obj.scale.setScalar(newS);
    if (ed) ed.scale = newS;
    if (obj === this.selected) {
      this._updateSelectionBox();
      this._writeSelectedToDoc();
      // Scale-Undo mit Coalescing (400 ms Fenster).
      this._coalesceScaleUndo(newS, snapBefore, curS);
    }
    if (obj.userData.ghost && this.pendingType) {
      this._typeDefaults[this.pendingType] = this._typeDefaults[this.pendingType] || {};
      this._typeDefaults[this.pendingType].scale = newS;
    }
  }

  // Scale-Undo-Coalescing: erster Call bekommt snapBefore + beforeScale;
  // weitere Calls innerhalb SCALE_COALESCE_MS updaten nur den after-Wert.
  // Nach Pause wird genau 1 Undo-Eintrag erzeugt.
  _coalesceScaleUndo(newScale, snapBefore, beforeScale) {
    const s = this.selected;
    if (!s) return;
    const id = s.userData.editable.id;
    const SCALE_COALESCE_MS = 400;
    if (!this._pendingScaleOp || this._pendingScaleOp.id !== id) {
      if (this._pendingScaleOp) this._commitPendingScaleUndo();
      this._pendingScaleOp = {
        id,
        beforeScale: beforeScale,
        snapBefore: snapBefore,
      };
    }
    this._pendingScaleOp.afterScale = newScale;
    this._pendingScaleOp.snapAfter = this._snapshotSelected();
    clearTimeout(this._pendingScaleTimer);
    this._pendingScaleTimer = setTimeout(() => {
      this._commitPendingScaleUndo();
    }, SCALE_COALESCE_MS);
  }
  _commitPendingScaleUndo() {
    if (!this._pendingScaleOp) return;
    const op = this._pendingScaleOp;
    this._pendingScaleOp = null;
    clearTimeout(this._pendingScaleTimer);
    this._pendingScaleTimer = null;
    if (!op.snapAfter || !op.snapBefore) return;
    if (Math.abs(op.afterScale - op.beforeScale) < 1e-4) return;
    this._pushUndo({
      kind: 'scale', id: op.id,
      before: op.snapBefore, after: op.snapAfter,
    });
  }

  _deleteSelected() {
    if (!this.selected) return;
    const s = this.selected;
    const snap = this._snapshotSelected();
    const e = s.userData.editable;
    // Doc-update
    if (e.standardHouseId) {
      this.doc.houses.overrides[e.standardHouseId] =
        { ...(this.doc.houses.overrides[e.standardHouseId] || {}), deleted: true };
    } else if (e.procId) {
      setProcOverride(this.doc, e.procId, { deleted: true });
    } else {
      this.doc.objects = this.doc.objects.filter((o) => o.id !== e.id);
    }
    // Scene-Update
    if (s.parent) s.parent.remove(s);
    this._clearSelection();
    this._pushUndo({
      kind: 'delete', id: snap.id, snapshot: snap,
      standardHouseId: e.standardHouseId, procId: e.procId,
    });
    this._markDirty();
  }

  _duplicateSelected() {
    if (!this.selected) return;
    const snap = this._snapshotSelected();
    // Dup etwas versetzt
    const nx = snap.x + 1.0;
    const nz = snap.z + 1.0;
    const id = nextId('obj');
    const yOffset = snap.yOffset || 0;
    // Duplikate landen immer in objects (nie als Standard-Override) — auch wenn
    // ein Standard-Haus dupliziert wird: Kopie ist ein zusaetzliches Objekt.
    const mesh = spawnPlaceable({ id, type: snap.type, x: nx, z: nz, rotY: snap.rotY, scale: snap.scale, yOffset });
    if (!mesh) return;
    this.editGroup.add(mesh);
    this.doc.objects.push({ id, type: snap.type, x: nx, z: nz, rotY: snap.rotY, scale: snap.scale, yOffset });
    this._pushUndo({ kind: 'create', id, snapshot: { id, type: snap.type, x: nx, z: nz, rotY: snap.rotY, scale: snap.scale, yOffset } });
    this._markDirty();
    this._select(mesh);
  }

  // ---------- Undo/Redo ----------------------------------------------------

  _pushUndo(op) {
    this.undoStack.push(op);
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  _findSceneObjectById(id) {
    let found = null;
    this.scene.traverse((o) => {
      if (found) return;
      if (o.userData && o.userData.editable && o.userData.editable.id === id) found = o;
    });
    return found;
  }

  _undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    this.redoStack.push(op);
    this._applyOp(op, 'undo');
  }

  _redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    this.undoStack.push(op);
    this._applyOp(op, 'redo');
  }

  _applyOp(op, dir) {
    if (op.kind === 'create') {
      if (dir === 'undo') {
        // Entfernen
        const o = this._findSceneObjectById(op.id);
        if (o && o.parent) o.parent.remove(o);
        this.doc.objects = this.doc.objects.filter((d) => d.id !== op.id);
      } else {
        // Wieder anlegen
        const s = op.snapshot;
        const mesh = spawnPlaceable({ id: s.id, type: s.type, x: s.x, z: s.z, rotY: s.rotY, scale: s.scale, yOffset: s.yOffset || 0 });
        if (mesh) this.editGroup.add(mesh);
        if (!this.doc.objects.find((d) => d.id === s.id)) {
          this.doc.objects.push({ id: s.id, type: s.type, x: s.x, z: s.z, rotY: s.rotY, scale: s.scale, yOffset: s.yOffset || 0 });
        }
      }
    } else if (op.kind === 'delete') {
      if (dir === 'undo') {
        const s = op.snapshot;
        if (op.standardHouseId) {
          // Delete-Override aufheben
          const ov = this.doc.houses.overrides[op.standardHouseId];
          if (ov) delete ov.deleted;
          // Standard-Haeuser werden bei placeVillage angelegt — hier ein
          // Reload erforderlich, um sie zurueckzuholen. Minimal invasiv:
          // wir speichern + reloaden.
          saveToStorage(this.doc);
          location.reload();
          return;
        }
        if (op.procId) {
          // Prozedurales Objekt (z.B. Karten-Bruecke, Felsen, Baum): das
          // `deleted`-Flag im procOverride entfernen und Mesh neu aufbauen.
          const ov = this.doc.procOverrides && this.doc.procOverrides[op.procId];
          if (ov) {
            delete ov.deleted;
            if (Object.keys(ov).length === 0) delete this.doc.procOverrides[op.procId];
          }
          const mesh = spawnPlaceable({ id: s.id, type: s.type, x: s.x, z: s.z, rotY: s.rotY, scale: s.scale, yOffset: s.yOffset || 0 });
          if (mesh) {
            mesh.userData.editable.procId = op.procId;
            this.editGroup.add(mesh);
          }
          return;
        }
        const mesh = spawnPlaceable({ id: s.id, type: s.type, x: s.x, z: s.z, rotY: s.rotY, scale: s.scale, yOffset: s.yOffset || 0 });
        if (mesh) this.editGroup.add(mesh);
        this.doc.objects.push({ id: s.id, type: s.type, x: s.x, z: s.z, rotY: s.rotY, scale: s.scale, yOffset: s.yOffset || 0 });
      } else {
        // Redo: Loeschen
        if (op.standardHouseId) {
          this.doc.houses.overrides[op.standardHouseId] =
            { ...(this.doc.houses.overrides[op.standardHouseId] || {}), deleted: true };
          saveToStorage(this.doc);
          location.reload();
          return;
        }
        if (op.procId) {
          setProcOverride(this.doc, op.procId, { deleted: true });
          const o = this._findSceneObjectById(op.id);
          if (o && o.parent) o.parent.remove(o);
          return;
        }
        const o = this._findSceneObjectById(op.id);
        if (o && o.parent) o.parent.remove(o);
        this.doc.objects = this.doc.objects.filter((d) => d.id !== op.id);
      }
    } else if (op.kind === 'move' || op.kind === 'rotate') {
      const snap = dir === 'undo' ? op.before : op.after;
      const o = this._findSceneObjectById(op.id);
      const e = o?.userData?.editable;
      const yOff = snap.yOffset || 0;
      if (o) {
        // Bruecken: y=0; sonst sampleHeight. yOffset addiert Shift-Drag-Hoehe.
        const baseY = (e && e.isBridge) ? 0 : sampleHeight(snap.x, snap.z);
        o.position.set(snap.x, baseY + yOff, snap.z);
        o.rotation.y = snap.rotY;
        if (e) e.yOffset = yOff;
      }
      // Doc-Update
      if (e && e.standardHouseId) {
        const ov = this.doc.houses.overrides[e.standardHouseId] || {};
        ov.x = snap.x; ov.z = snap.z; ov.rotY = snap.rotY;
        ov.yOffset = yOff;
        this.doc.houses.overrides[e.standardHouseId] = ov;
      } else if (e && e.procId) {
        setProcOverride(this.doc, e.procId, { x: snap.x, z: snap.z, rotY: snap.rotY, yOffset: yOff });
      } else {
        const idx = this.doc.objects.findIndex((d) => d.id === op.id);
        if (idx >= 0) {
          this.doc.objects[idx] = { ...this.doc.objects[idx], x: snap.x, z: snap.z, rotY: snap.rotY, yOffset: yOff };
        }
      }
      if (this.selected === o) this._updateSelectionBox();
    } else if (op.kind === 'pathCreate') {
      if (dir === 'undo') {
        // Pfad entfernen
        this.doc.paths = (this.doc.paths || []).filter((p) => p.id !== op.id);
        const mesh = this._findSceneObjectById(op.id);
        if (mesh && mesh.parent) mesh.parent.remove(mesh);
      } else {
        // Wieder anlegen
        if (!this.doc.paths) this.doc.paths = [];
        this.doc.paths.push({ ...op.snapshot, points: op.snapshot.points.map((q) => ({ ...q })) });
        const mesh = this.pathTool._buildPathMesh(op.snapshot);
        if (mesh) this.editGroup.add(mesh);
      }
    } else if (op.kind === 'pathEdit') {
      // Handle-Drag: pts auf before/after setzen, Mesh neu bauen.
      const pts = dir === 'undo' ? op.before : op.after;
      if (!this.doc.paths) this.doc.paths = [];
      const idx = this.doc.paths.findIndex((p) => p.id === op.id);
      if (idx < 0) { this._markDirty(); return; }
      this.doc.paths[idx].points = pts.map((q) => ({ x: q.x, z: q.z }));
      // Scene: altes Mesh raus, neues rein.
      const oldMesh = this._findSceneObjectById(op.id);
      const parent = oldMesh ? oldMesh.parent : this.editGroup;
      if (oldMesh && oldMesh.parent) oldMesh.parent.remove(oldMesh);
      const newMesh = this.pathTool._buildPathMesh(this.doc.paths[idx]);
      if (newMesh) parent.add(newMesh);
      // Wenn gerade im Edit-Mode auf diesem Pfad, Punkte + aktives Mesh updaten.
      if (this.pathTool._activePathEntry && this.pathTool._activePathEntry.id === op.id) {
        this.pathTool._activePathEntry.points = this.doc.paths[idx].points.map((q) => ({ ...q }));
        this.pathTool.points = this.pathTool._activePathEntry.points.map((q) => ({ ...q }));
        this.pathTool._activePathMesh = newMesh;
        this.pathTool._updateHandles();
      }
    } else if (op.kind === 'pathDelete') {
      if (dir === 'undo') {
        if (!this.doc.paths) this.doc.paths = [];
        this.doc.paths.push({ ...op.snapshot, points: op.snapshot.points.map((q) => ({ ...q })) });
        const mesh = this.pathTool._buildPathMesh(op.snapshot);
        if (mesh) this.editGroup.add(mesh);
      } else {
        this.doc.paths = (this.doc.paths || []).filter((p) => p.id !== op.id);
        const mesh = this._findSceneObjectById(op.id);
        if (mesh && mesh.parent) mesh.parent.remove(mesh);
      }
    } else if (op.kind === 'terrainStroke') {
      // Terrain-Pinselstrich zurueckspielen: Zellen setzen + Mesh updaten.
      if (this.terrainTool) this.terrainTool.applyTerrainStrokeOp(op, dir);
    } else if (op.kind === 'paintStroke') {
      // Paint-Pinselstrich zurueckspielen.
      if (this.terrainTool) this.terrainTool.applyPaintStrokeOp(op, dir);
    } else if (op.kind === 'scale') {
      const snap = dir === 'undo' ? op.before : op.after;
      const o = this._findSceneObjectById(op.id);
      if (o) {
        o.scale.setScalar(snap.scale);
        o.userData.editable.scale = snap.scale;
      }
      const e = o?.userData?.editable;
      if (e && e.standardHouseId) {
        const ov = this.doc.houses.overrides[e.standardHouseId] || {};
        ov.scale = snap.scale;
        this.doc.houses.overrides[e.standardHouseId] = ov;
      } else if (e && e.procId) {
        setProcOverride(this.doc, e.procId, { scale: snap.scale });
      } else {
        const idx = this.doc.objects.findIndex((d) => d.id === op.id);
        if (idx >= 0) {
          this.doc.objects[idx] = { ...this.doc.objects[idx], scale: snap.scale };
        }
      }
      if (this.selected === o) this._updateSelectionBox();
    }
    this._markDirty();
  }

  dispose() {
    // Phase 1: no explicit cleanup needed — UI/listeners teardown bei Reload.
  }
}

function isTypingTarget(t) {
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || t.isContentEditable;
}
