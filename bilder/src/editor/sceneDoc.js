// SceneDoc — Datenmodell des Dorfs als JSON.
//
// Phase 1 bearbeitet:
//   - HAUS-OVERRIDES: Wenn Dennis ein Haus aus dem Standard-Dorf verschiebt,
//     dreht, loescht oder dupliziert, wird das hier als Override gespeichert.
//     Das Dorf baut sich weiterhin aus mapLayout.HOUSES auf, nur eben mit
//     angewendeten Overrides (+ zusaetzliche Dups).
//   - OBJECTS: zusaetzliche, frei platzierte Objekte (Baeume, Felsen, Props,
//     Laternen, weitere Haeuser). Werden einzeln ueber spawnPlaceable()
//     erzeugt und sind frei beweglich / loeschbar.
//
// Phase 2 (vorbereitet): zusaetzliche Datenbereiche fuer Pinsel-Deko
//   (Wege-Polylinien, Feld-Polygonen, Baum-Streuungen, Terraforming-Bumps,
//   Wasser-Polygone). Hier als leere Arrays mit angelegtem Schluessel reserviert.
//
// Phase 3 (vorbereitet): user-defined Lichter als Objects-Entries mit
//   type beginning with "light.". Datenmodell deckt das bereits ab.
//
// Format (Version 1):
//   {
//     version: 1,
//     houses: {
//       overrides: { [houseId]: { x?, z?, rotY?, scale?, deleted? } },
//       extra: [ { id, type, x, z, rotY, scale } ],  // duplizierte / neue Haeuser
//     },
//     objects: [ { id, type, x, z, rotY, scale, ...props } ],
//     brushes: { paths: [], fields: [], trees: [], water: [], terrain: [] }, // Phase 2
//   }

import { HOUSES } from '../scene/mapLayout.js';

export const SCENE_DOC_VERSION = 1;

// Factory: leeres Dokument im passenden Schema.
export function emptyDoc() {
  return {
    version: SCENE_DOC_VERSION,
    houses: { overrides: {}, extra: [] },
    objects: [],
    // procedural-Overrides: fuer prozedural erzeugte Objekte (Baeume, Felsen,
    // Deko-Props, Marktstaende, Bienenstoecke etc.). Keyed by stable seed-ID.
    // Wert: { deleted?: true, x?, z?, rotY?, scale? }.
    procOverrides: {},
    // Pfade (Zaeune, spaeter Wege/Fluesse). Jeder Eintrag:
    //   { id, type:'fence'|'path'|'river', style, points:[{x,z},...] }
    paths: [],
    brushes: { paths: [], fields: [], trees: [], water: [], terrain: [] },
    // Terraforming (Runde C): dichtes Hoehen-Delta-Grid (sparse-packed Base64).
    // null = keine Edits. Beim Laden via importHeightGrid() ins Grid gezogen.
    terrain: null,
    // Painting (Runde C): dichte Material-ID + Strength-Grid (sparse-packed Base64).
    paint: null,
  };
}

// Default-Doc: identisch zur bisherigen prozeduralen Startszene.
// Ergebnis: keine Overrides, keine extra Objekte — Startlook bleibt exakt gleich.
export function defaultDoc() {
  return emptyDoc();
}

// Merge geladene Daten mit aktuellem Schema, defekte Felder reparieren.
export function normalize(doc) {
  const d = emptyDoc();
  if (doc && typeof doc === 'object') {
    if (doc.houses && typeof doc.houses === 'object') {
      if (doc.houses.overrides && typeof doc.houses.overrides === 'object') {
        for (const [id, ov] of Object.entries(doc.houses.overrides)) {
          if (!ov || typeof ov !== 'object') continue;
          d.houses.overrides[id] = {};
          if (Number.isFinite(ov.x)) d.houses.overrides[id].x = ov.x;
          if (Number.isFinite(ov.z)) d.houses.overrides[id].z = ov.z;
          if (Number.isFinite(ov.rotY)) d.houses.overrides[id].rotY = ov.rotY;
          if (Number.isFinite(ov.scale)) d.houses.overrides[id].scale = ov.scale;
          if (Number.isFinite(ov.yOffset)) d.houses.overrides[id].yOffset = ov.yOffset;
          if (ov.deleted === true) d.houses.overrides[id].deleted = true;
        }
      }
      if (Array.isArray(doc.houses.extra)) {
        for (const h of doc.houses.extra) {
          if (!h || typeof h !== 'object') continue;
          if (!h.id || !h.type) continue;
          if (!Number.isFinite(h.x) || !Number.isFinite(h.z)) continue;
          d.houses.extra.push({
            id: String(h.id),
            type: String(h.type),
            x: +h.x, z: +h.z,
            rotY: Number.isFinite(h.rotY) ? +h.rotY : 0,
            scale: Number.isFinite(h.scale) ? +h.scale : 3.2,
            yOffset: Number.isFinite(h.yOffset) ? +h.yOffset : 0,
          });
        }
      }
    }
    if (Array.isArray(doc.objects)) {
      for (const o of doc.objects) {
        if (!o || typeof o !== 'object') continue;
        if (!o.id || !o.type) continue;
        if (!Number.isFinite(o.x) || !Number.isFinite(o.z)) continue;
        d.objects.push({
          id: String(o.id),
          type: String(o.type),
          x: +o.x, z: +o.z,
          rotY: Number.isFinite(o.rotY) ? +o.rotY : 0,
          scale: Number.isFinite(o.scale) ? +o.scale : 1,
          yOffset: Number.isFinite(o.yOffset) ? +o.yOffset : 0,
        });
      }
    }
    // procOverrides: verschoben / geloescht / skaliert prozedurale Objekte.
    if (doc.procOverrides && typeof doc.procOverrides === 'object') {
      for (const [id, ov] of Object.entries(doc.procOverrides)) {
        if (!ov || typeof ov !== 'object') continue;
        d.procOverrides[id] = {};
        if (Number.isFinite(ov.x))       d.procOverrides[id].x = ov.x;
        if (Number.isFinite(ov.z))       d.procOverrides[id].z = ov.z;
        if (Number.isFinite(ov.rotY))    d.procOverrides[id].rotY = ov.rotY;
        if (Number.isFinite(ov.scale))   d.procOverrides[id].scale = ov.scale;
        if (Number.isFinite(ov.yOffset)) d.procOverrides[id].yOffset = ov.yOffset;
        if (ov.deleted === true)         d.procOverrides[id].deleted = true;
      }
    }
    // paths (Zaeune / Wege / Fluesse). Format { id, type, style, points: [{x,z}] }.
    if (Array.isArray(doc.paths)) {
      for (const p of doc.paths) {
        if (!p || typeof p !== 'object') continue;
        if (!p.id || !p.type) continue;
        if (!Array.isArray(p.points) || p.points.length < 2) continue;
        const pts = [];
        for (const q of p.points) {
          if (q && Number.isFinite(q.x) && Number.isFinite(q.z)) {
            pts.push({ x: +q.x, z: +q.z });
          }
        }
        if (pts.length < 2) continue;
        d.paths.push({
          id: String(p.id),
          type: String(p.type),
          style: p.style ? String(p.style) : 'wood',
          points: pts,
        });
      }
    }
    // brushes sind fuer Phase 2 — hier nur durchschleifen, wenn vorhanden.
    if (doc.brushes && typeof doc.brushes === 'object') {
      for (const k of Object.keys(d.brushes)) {
        if (Array.isArray(doc.brushes[k])) d.brushes[k] = doc.brushes[k];
      }
    }
    // Runde C: Terrain- + Paint-Grids als Base64-Strings.
    if (typeof doc.terrain === 'string' && doc.terrain.length > 0) d.terrain = doc.terrain;
    if (typeof doc.paint === 'string' && doc.paint.length > 0) d.paint = doc.paint;
  }
  return d;
}

// Wendet die Overrides auf HOUSES an und liefert die neue Liste (inkl. extras).
// Die Reihenfolge ist deterministisch: zuerst Standard-Haeuser in Original-
// reihenfolge, dann extras in Doc-Reihenfolge.
export function materializeHouses(doc) {
  const out = [];
  for (const h of HOUSES) {
    const ov = doc.houses.overrides[h.id];
    if (ov && ov.deleted) continue;
    // Wichtig: Standard-Haeuser speichern px/rotDeg — die Welt-Koordinaten
    // werden in village.js via toWorldX/Z berechnet. Wenn der User verschoben
    // hat, legen wir die Welt-Koordinaten als worldX/worldZ ab; village.js
    // nutzt diese bevorzugt.
    out.push({
      id: h.id,
      model: h.model,
      px: h.px,
      rotDeg: h.rotDeg,
      scale: ov && Number.isFinite(ov.scale) ? ov.scale : h.scale,
      worldX: ov && Number.isFinite(ov.x) ? ov.x : undefined,
      worldZ: ov && Number.isFinite(ov.z) ? ov.z : undefined,
      rotYOverride: ov && Number.isFinite(ov.rotY) ? ov.rotY : undefined,
      yOffsetOverride: ov && Number.isFinite(ov.yOffset) ? ov.yOffset : 0,
      _standard: true,
    });
  }
  for (const h of doc.houses.extra) {
    out.push({
      id: h.id,
      model: h.type.replace(/^house\./, ''),
      px: null,
      rotDeg: 0,
      scale: h.scale,
      worldX: h.x,
      worldZ: h.z,
      rotYOverride: h.rotY,
      yOffsetOverride: Number.isFinite(h.yOffset) ? h.yOffset : 0,
      _standard: false,
    });
  }
  return out;
}

// Finde einen freien eindeutigen Id-String fuer ein neues Objekt.
let _idCounter = 1;
export function nextId(prefix = 'obj') {
  const t = Date.now().toString(36);
  const n = (_idCounter++).toString(36);
  return `${prefix}_${t}${n}`;
}

// Prozedurale Objekte: stabile ID aus Kategorie + Seed-Index (z.B. 'p:tree:42').
// Seedbasiert heisst: ein generator mit bekannter Seed-Zahl erzeugt immer
// dieselbe ID an derselben Position. Dadurch koennen Overrides nach Neuladen
// das richtige Objekt finden.
export function procId(category, seedIndex) {
  return `p:${category}:${seedIndex}`;
}

// Hilfsfunktionen fuer prozedurale Overrides in main.js bzw. scene/*.
export function getProcOverride(doc, id) {
  if (!doc || !doc.procOverrides) return null;
  return doc.procOverrides[id] || null;
}
export function setProcOverride(doc, id, patch) {
  if (!doc.procOverrides) doc.procOverrides = {};
  const cur = doc.procOverrides[id] || {};
  doc.procOverrides[id] = { ...cur, ...patch };
}
export function deleteProcOverride(doc, id) {
  if (!doc.procOverrides) return;
  delete doc.procOverrides[id];
}
