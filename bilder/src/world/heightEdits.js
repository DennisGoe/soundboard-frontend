// Terraforming: dichte Hoehen-Delta-Grid, die von sampleHeight() konsultiert
// wird. Pinsel-Operationen (Raise/Lower/Smooth/Level) addieren auf die Grid.
// Fuer Export/Persist werden nur die non-zero Cells als sparse {i:delta} gepackt.
//
// Koordinaten:
//   - Grid ist axial-aligned im Welt-XZ-Raum.
//   - Zentriert um (0,0), Ausdehnung GRID_RANGE (±GRID_RANGE/2).
//   - Zelle (ix, iz), ix/iz in [0, GRID_SEGS].
//   - world (x, z) -> uvf = (x + GRID_RANGE/2) / GRID_RANGE * GRID_SEGS
//
// Sampling: bilinear interp der Nachbarzellen -> glatte Heber.
//
// Performance: Lookup in Hot-Path (sampleHeight). Shortcut: wenn _dirtyCount==0,
// zurueckkehren ohne Interp.

const GRID_SEGS = 192;            // 192x192 = ~37k Cells (kompakt, gut interpolierbar)
const GRID_RANGE = 220;           // deckt WORLD_W(~154) + Puffer ab
const CELL = GRID_RANGE / GRID_SEGS;

const _grid = new Float32Array((GRID_SEGS + 1) * (GRID_SEGS + 1));
let _dirtyCount = 0;

// Pro-Stroke Zustand: Startwert jeder beruehrten Zelle (fuer Cap pro Strich).
// Wird vom terrainTool via beginStroke()/endStroke() verwaltet.
let _strokeStart = null;   // Map<idx, startVal> oder null

function idxAt(ix, iz) { return iz * (GRID_SEGS + 1) + ix; }

/**
 * Startet einen neuen Pinselstrich. Danach wird fuer jede beruehrte Zelle der
 * Ausgangswert (vor diesem Strich) gespeichert, damit das Delta pro Strich
 * gedeckelt werden kann — das verhindert einen spitzen Turm bei lang gezogenem
 * Strich ueber dieselbe Stelle.
 */
export function beginStroke() {
  _strokeStart = new Map();
}
/** Beendet den aktuellen Strich (gibt Zustand frei). */
export function endStroke() {
  _strokeStart = null;
}

// Welt (x, z) -> (ix_float, iz_float) im Grid-Koordinatensystem.
function worldToGrid(x, z) {
  const u = (x + GRID_RANGE * 0.5) / CELL;
  const v = (z + GRID_RANGE * 0.5) / CELL;
  return { u, v };
}

/**
 * Hoehen-Delta an (x, z) via bilinear interp. 0 wenn keine Edits.
 */
export function sampleHeightDelta(x, z) {
  if (_dirtyCount === 0) return 0;
  const { u, v } = worldToGrid(x, z);
  if (u < 0 || u >= GRID_SEGS || v < 0 || v >= GRID_SEGS) return 0;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = i0 + 1, j1 = j0 + 1;
  const fu = u - i0, fv = v - j0;
  const a = _grid[idxAt(i0, j0)];
  const b = _grid[idxAt(i1, j0)];
  const c = _grid[idxAt(i0, j1)];
  const d = _grid[idxAt(i1, j1)];
  return (
    a * (1 - fu) * (1 - fv) +
    b * fu * (1 - fv) +
    c * (1 - fu) * fv +
    d * fu * fv
  );
}

/**
 * Weiche Pinselkante: Gauss-aehnliches smoothstep² ueber den ganzen Radius.
 * Zentrum 1, Rand 0, sanft verlaufend.
 */
function kernel(t) {
  const u = 1 - Math.max(0, Math.min(1, t));
  const s = u * u * (3 - 2 * u);   // smoothstep
  return s * s;                     // nochmal quadriert -> noch weicher am Zentrum
}

// Skalierung der Zugabe pro Pinsel-Sample. Kleiner = sanfter.
// Ergebnis: typischer kurzer Strich (5-10 Samples) bei strength=0.25 gibt eine
// sanfte Beule, nicht einen Pfosten.
const PER_SAMPLE_SCALE = 0.20;

// Maximale Hoehenaenderung PRO Strich und Zelle, gekoppelt an die Pinselstaerke
// UND -groesse (grosser Pinsel darf mehr Terrain bewegen). Verhindert Nadeln
// bei lang gezogenen/kreisenden Stroke-Paths.
function strokeCap(strength, radius) {
  const rBoost = Math.min(2.0, 0.6 + radius * 0.15);
  return strength * rBoost;
}

/**
 * Pinselstrich anwenden. Operation 'raise'|'lower'|'smooth'|'level'.
 * Gibt {touched: [indices], prev: [vorherige Werte]} zurueck fuer Undo.
 *
 * WICHTIG: Fuer einen sanften, runden Huegel muss terrainTool beginStroke()
 * vor der Strich-Sequenz und endStroke() danach aufrufen. Dann wird pro Zelle
 * der Startwert gemerkt und das Delta pro Strich auf strokeCap() begrenzt.
 */
export function applyBrush(x, z, radius, strength, mode, levelHeight = 0) {
  const { u, v } = worldToGrid(x, z);
  const rCells = radius / CELL;
  const i0 = Math.max(0, Math.floor(u - rCells));
  const i1 = Math.min(GRID_SEGS, Math.ceil(u + rCells));
  const j0 = Math.max(0, Math.floor(v - rCells));
  const j1 = Math.min(GRID_SEGS, Math.ceil(v + rCells));

  const touched = [];
  const prev = [];
  const cap = strokeCap(strength, radius);
  const scale = PER_SAMPLE_SCALE;

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
      const old = _grid[idx];
      // Strich-Startwert fuer diese Zelle merken (nur beim ersten Touch im Strich).
      let startVal = old;
      if (_strokeStart) {
        if (_strokeStart.has(idx)) startVal = _strokeStart.get(idx);
        else _strokeStart.set(idx, old);
      }
      let val = old;
      if (mode === 'raise') {
        val = old + strength * k * scale;
        if (_strokeStart) {
          // Pro Strich maximal +cap gegenueber Startwert erlauben.
          const localMax = startVal + cap * k;   // Rand-Zellen weniger als Zentrum
          if (val > localMax) val = localMax;
        }
      } else if (mode === 'lower') {
        val = old - strength * k * scale;
        if (_strokeStart) {
          const localMin = startVal - cap * k;
          if (val < localMin) val = localMin;
        }
      } else if (mode === 'smooth') {
        let sum = 0, cnt = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || ii > GRID_SEGS || jj < 0 || jj > GRID_SEGS) continue;
            sum += _grid[idxAt(ii, jj)];
            cnt++;
          }
        }
        const avg = sum / Math.max(1, cnt);
        val = old + (avg - old) * strength * k * (scale * 2);
      } else if (mode === 'level') {
        val = old + (levelHeight - old) * strength * k * (scale * 2);
      }
      touched.push(idx);
      prev.push(old);
      _grid[idx] = val;
    }
  }
  if (touched.length > 0) _dirtyCount += touched.length;
  return { touched, prev };
}

/**
 * Undo/Redo-Helfer: setzt eine Liste von Zellen zurueck auf bestimmte Werte.
 */
export function setCellValues(indices, values) {
  for (let k = 0; k < indices.length; k++) {
    const idx = indices[k];
    _grid[idx] = values[k];
  }
}

/**
 * Gibt die aktuellen Werte an den gegebenen Indices zurueck.
 */
export function getCellValues(indices) {
  const out = new Float32Array(indices.length);
  for (let k = 0; k < indices.length; k++) out[k] = _grid[indices[k]];
  return out;
}

/**
 * Liefert BoundingBox der betroffenen Welt-Koordinaten eines Strokes.
 */
export function strokeWorldBounds(x, z, radius) {
  return {
    minX: x - radius - CELL, maxX: x + radius + CELL,
    minZ: z - radius - CELL, maxZ: z + radius + CELL,
  };
}

/**
 * Reset komplettes Grid (bei doc-Reset / Reload mit leerem Doc).
 */
export function resetHeightGrid() {
  _grid.fill(0);
  _dirtyCount = 0;
}

/**
 * Serialisiere non-zero Deltas als sparse { indices, values } Base64-Blocks.
 * Format: 2 Uint32 (count, grid_segs), dann count * (u32 idx + f32 value).
 */
export function exportHeightGrid() {
  const indices = [];
  const values = [];
  for (let k = 0; k < _grid.length; k++) {
    const v = _grid[k];
    if (Math.abs(v) > 1e-6) {
      indices.push(k);
      values.push(v);
    }
  }
  if (indices.length === 0) return null;
  const buf = new ArrayBuffer(8 + indices.length * 8);
  const u32 = new Uint32Array(buf);
  const f32 = new Float32Array(buf);
  u32[0] = indices.length;
  u32[1] = GRID_SEGS;
  for (let i = 0; i < indices.length; i++) {
    u32[2 + i * 2] = indices[i];
    f32[2 + i * 2 + 1] = values[i];
  }
  // Base64
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * Dekodiere + lade.
 */
export function importHeightGrid(b64) {
  _grid.fill(0);
  _dirtyCount = 0;
  if (!b64) return;
  try {
    const bin = atob(b64);
    const buf = new ArrayBuffer(bin.length);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    const count = u32[0];
    const segs = u32[1];
    if (segs !== GRID_SEGS) {
      console.warn('[heightEdits] grid segs mismatch', segs, 'vs', GRID_SEGS);
      return;
    }
    for (let i = 0; i < count; i++) {
      const idx = u32[2 + i * 2];
      const val = f32[2 + i * 2 + 1];
      if (idx >= 0 && idx < _grid.length) _grid[idx] = val;
    }
    _dirtyCount = count;
  } catch (e) {
    console.warn('[heightEdits] importHeightGrid failed', e);
  }
}

export function getGridInfo() {
  return { GRID_SEGS, GRID_RANGE, CELL, dirtyCount: _dirtyCount };
}
