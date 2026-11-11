// Terrain-Painting: Grid aus Material-ID + Strength pro Zelle. Wird vom
// Terrain-Shader per vertex color sampled + lerped. Pinsel addiert
// "Farbgewicht" fuer ein Material (weiche Uebergaenge via smoothstep-Kernel).
//
// 8 Materialien (0..7):
//   0 none  (default: Original-Grasfarbe aus terrain.js)
//   1 grassLight
//   2 grassDark
//   3 dirt
//   4 sand
//   5 gravel
//   6 stone
//   7 flowers
//   8 snow
// Daraus werden in UI 8 Kacheln.
//
// Storage: dense Grid 192x192 mit Material-ID (Uint8) und Strength (Uint8 0..255).
// Lookup in sampleHeight-aehnlicher Form: bilinear interp der RGBs.
//
// Rendering: statt Shader-Umbau nutzen wir direkt die Terrain-Mesh-vertex-colors.
// Nach jedem Stroke werden die VertexColors der betroffenen Vertices neu gesetzt
// (Basisfarbe * (1-s) + paintFarbe * s).

import * as THREE from 'three';

const GRID_SEGS = 192;
const GRID_RANGE = 220;
const CELL = GRID_RANGE / GRID_SEGS;

// Material-Definitionen. Linearer Farb-Raum (Three.js arbeitet so).
// WICHTIG: Max-Channel aller Farben ist auf ~0.78 gedeckelt, damit helle
// Malfarben (Sand, Schnee, Blumen) auch im Mittagssonnen-Licht nicht ueber die
// Bloom-Threshold (0.88) kommen und wie Papier/Schnee gluehen. Snow/Sand sind
// bewusst matt-beige statt blendend weiss.
export const MATERIALS = [
  { id: 'none',       color: null,       label: 'Keine',        icon: '◻' },
  { id: 'grassLight', color: 0x6a8f42,   label: 'Gras hell',    icon: '🌿' },
  { id: 'grassDark',  color: 0x334f26,   label: 'Gras dunkel',  icon: '🌾' },
  { id: 'dirt',       color: 0x4e331c,   label: 'Erde',         icon: '🟤' },
  { id: 'sand',       color: 0xb59968,   label: 'Sand',         icon: '🟡' },
  { id: 'gravel',     color: 0x78736d,   label: 'Kies',         icon: '⚪' },
  { id: 'stone',      color: 0x55555c,   label: 'Stein',        icon: '⬛' },
  { id: 'flowers',    color: 0x9872b4,   label: 'Blumenwiese',  icon: '🌸' },
  { id: 'snow',       color: 0xa8a8ae,   label: 'Schnee',       icon: '❄' },
];

// Grid: material id (u8) + strength (u8).
const _matGrid = new Uint8Array((GRID_SEGS + 1) * (GRID_SEGS + 1));
const _strGrid = new Uint8Array((GRID_SEGS + 1) * (GRID_SEGS + 1));
let _dirtyCount = 0;

function idxAt(ix, iz) { return iz * (GRID_SEGS + 1) + ix; }
function worldToGrid(x, z) {
  const u = (x + GRID_RANGE * 0.5) / CELL;
  const v = (z + GRID_RANGE * 0.5) / CELL;
  return { u, v };
}

function kernel(t) {
  const u = 1 - Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

// Paint-Zuwachs pro Call deutlich entschaerft, damit auch bei strength=1 der
// Pinsel nicht in einem einzigen Call die Vollfarbe aufdrueckt — sanfter,
// mehrere Striche ergeben organische Uebergaenge.
const PAINT_PER_SAMPLE_SCALE = 0.18;

/**
 * Pinselstrich anwenden: setzt Material + mischt Strength in Kernel-Form.
 * matId: 1..8 (0 = radieren).
 * strength: 0..1 (Zuwachs pro Call; wird in u8 [0,255] codiert).
 */
export function applyPaintBrush(x, z, radius, strength, matId) {
  const sEff = strength * PAINT_PER_SAMPLE_SCALE;
  const { u, v } = worldToGrid(x, z);
  const rCells = radius / CELL;
  const i0 = Math.max(0, Math.floor(u - rCells));
  const i1 = Math.min(GRID_SEGS, Math.ceil(u + rCells));
  const j0 = Math.max(0, Math.floor(v - rCells));
  const j1 = Math.min(GRID_SEGS, Math.ceil(v + rCells));

  const touched = [];
  const prevMat = [];
  const prevStr = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = (i - u);
      const dz = (j - v);
      const d = Math.hypot(dx, dz);
      const t = d / Math.max(0.001, rCells);
      if (t >= 1.0) continue;
      const k = kernel(t);
      if (k < 1e-4) continue;
      const idx = idxAt(i, j);
      touched.push(idx);
      prevMat.push(_matGrid[idx]);
      prevStr.push(_strGrid[idx]);
      if (matId === 0) {
        // radieren: strength reduzieren, Mat auf 0 wenn <10%
        const curS = _strGrid[idx] / 255;
        const newS = Math.max(0, curS - sEff * k);
        _strGrid[idx] = Math.round(newS * 255);
        if (newS < 0.04) _matGrid[idx] = 0;
      } else {
        // setzen: wenn Mat gleich oder leer -> addieren. Sonst mischen (replace).
        // Max-Strength ist 0.85 statt 1.0, damit die Original-Terrain-Farbe
        // immer dezent durchscheint — hellste Malfarben (Schnee, Sand) bleiben
        // dadurch bodenstaendig.
        const S_MAX = 0.85;
        if (_matGrid[idx] === 0 || _matGrid[idx] === matId) {
          _matGrid[idx] = matId;
          const curS = _strGrid[idx] / 255;
          const newS = Math.min(S_MAX, curS + sEff * k);
          _strGrid[idx] = Math.round(newS * 255);
        } else {
          // andere Farbe drauf: reduziere alte, falls wenig; ersetze wenn < threshold.
          const curS = _strGrid[idx] / 255;
          const newS = curS - sEff * k * 0.6;
          if (newS <= 0.15) {
            _matGrid[idx] = matId;
            _strGrid[idx] = Math.round(Math.min(S_MAX, Math.max(0, sEff * k)) * 255);
          } else {
            _strGrid[idx] = Math.round(Math.max(0, newS) * 255);
          }
        }
      }
    }
  }
  if (touched.length > 0) _dirtyCount += touched.length;
  return { touched, prevMat, prevStr };
}

/**
 * Undo/Redo: Zellen zuruecksetzen.
 */
export function setPaintCells(indices, mats, strs) {
  for (let k = 0; k < indices.length; k++) {
    const idx = indices[k];
    _matGrid[idx] = mats[k];
    _strGrid[idx] = strs[k];
  }
}

/**
 * Gibt die aktuellen Werte (mat, str) an den gegebenen Indices zurueck.
 */
export function getPaintCells(indices) {
  const mats = new Uint8Array(indices.length);
  const strs = new Uint8Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    mats[k] = _matGrid[indices[k]];
    strs[k] = _strGrid[indices[k]];
  }
  return { mats, strs };
}

/**
 * Sample: gib { r, g, b, strength } an einer Welt-Pos zurueck.
 * Wenn kein Paint gesetzt ist, strength=0.
 */
const _tmpCol = new THREE.Color();
export function samplePaint(x, z, outCol = _tmpCol) {
  if (_dirtyCount === 0) return { col: null, strength: 0 };
  const { u, v } = worldToGrid(x, z);
  if (u < 0 || u >= GRID_SEGS || v < 0 || v >= GRID_SEGS) return { col: null, strength: 0 };
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = i0 + 1, j1 = j0 + 1;
  const fu = u - i0, fv = v - j0;
  // 4 Ecken + Gewichtung
  const w00 = (1 - fu) * (1 - fv);
  const w10 = fu * (1 - fv);
  const w01 = (1 - fu) * fv;
  const w11 = fu * fv;
  const a = idxAt(i0, j0), b = idxAt(i1, j0), c = idxAt(i0, j1), d = idxAt(i1, j1);
  const sA = _strGrid[a] / 255, sB = _strGrid[b] / 255, sC = _strGrid[c] / 255, sD = _strGrid[d] / 255;
  // Weighted avg strength
  const sStr = sA * w00 + sB * w10 + sC * w01 + sD * w11;
  if (sStr < 0.01) return { col: null, strength: 0 };
  // Weighted mix of material colors. Fuer "mehrere Materialien an einer Stelle"
  // nehmen wir die Mehrheits-Mat an der dominanten Ecke (minimaler Code).
  const corners = [
    { m: _matGrid[a], w: w00 * sA },
    { m: _matGrid[b], w: w10 * sB },
    { m: _matGrid[c], w: w01 * sC },
    { m: _matGrid[d], w: w11 * sD },
  ];
  // Akkumuliere Farbgewichte pro Material
  const colAcc = { r: 0, g: 0, b: 0 };
  let wTot = 0;
  for (const c of corners) {
    if (c.m === 0 || !MATERIALS[c.m] || !MATERIALS[c.m].color) continue;
    const mc = MATERIALS[c.m].color;
    const r = ((mc >> 16) & 255) / 255;
    const g = ((mc >> 8) & 255) / 255;
    const bb = (mc & 255) / 255;
    colAcc.r += r * c.w;
    colAcc.g += g * c.w;
    colAcc.b += bb * c.w;
    wTot += c.w;
  }
  if (wTot < 1e-5) return { col: null, strength: 0 };
  outCol.r = colAcc.r / wTot;
  outCol.g = colAcc.g / wTot;
  outCol.b = colAcc.b / wTot;
  return { col: outCol, strength: sStr };
}

export function strokeWorldBounds(x, z, radius) {
  return {
    minX: x - radius - CELL, maxX: x + radius + CELL,
    minZ: z - radius - CELL, maxZ: z + radius + CELL,
  };
}

export function resetPaintGrid() {
  _matGrid.fill(0);
  _strGrid.fill(0);
  _dirtyCount = 0;
}

/**
 * Serialisiere: pack (mat, str) jedes non-zero Cells.
 */
export function exportPaintGrid() {
  const idxs = [];
  const mats = [];
  const strs = [];
  for (let k = 0; k < _matGrid.length; k++) {
    if (_matGrid[k] > 0 || _strGrid[k] > 0) {
      idxs.push(k);
      mats.push(_matGrid[k]);
      strs.push(_strGrid[k]);
    }
  }
  if (idxs.length === 0) return null;
  // Struktur: u32 count, u32 segs, dann count * (u32 idx, u8 mat, u8 str, 2 pad).
  const buf = new ArrayBuffer(8 + idxs.length * 8);
  const u32 = new Uint32Array(buf);
  const u8 = new Uint8Array(buf);
  u32[0] = idxs.length;
  u32[1] = GRID_SEGS;
  for (let i = 0; i < idxs.length; i++) {
    const off = 8 + i * 8;
    u32[(off >> 2)] = idxs[i];
    u8[off + 4] = mats[i];
    u8[off + 5] = strs[i];
  }
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function importPaintGrid(b64) {
  _matGrid.fill(0);
  _strGrid.fill(0);
  _dirtyCount = 0;
  if (!b64) return;
  try {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const u32 = new Uint32Array(buf);
    const u8 = bytes;
    const count = u32[0];
    const segs = u32[1];
    if (segs !== GRID_SEGS) return;
    for (let i = 0; i < count; i++) {
      const off = 8 + i * 8;
      const idx = u32[(off >> 2)];
      const mat = u8[off + 4];
      const str = u8[off + 5];
      if (idx >= 0 && idx < _matGrid.length) {
        _matGrid[idx] = mat;
        _strGrid[idx] = str;
      }
    }
    _dirtyCount = count;
  } catch (e) {
    console.warn('[paintEdits] import failed', e);
  }
}

export function getPaintGridInfo() {
  return { GRID_SEGS, GRID_RANGE, CELL, dirtyCount: _dirtyCount };
}
