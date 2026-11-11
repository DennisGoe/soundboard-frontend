// Terrain-Pinsel (Terraforming + Painting).
// Modi:
//   TERRAIN: 'raise' | 'lower' | 'smooth' | 'level'
//   PAINT:   matId 1..8 (siehe paintEdits.js)
//
// Bedienung:
//   - Button "Pinsel aktiv" im Tab -> Werkzeug ist aktiv.
//   - Mausdown + Move = Pinsel. Jeder Mousedown startet einen neuen Stroke
//     (= eine Undo-Einheit). Mouseup commitiert den Stroke.
//   - Radius-Slider (0.5 .. 10), Strength-Slider (0.05 .. 1.0).
//   - Preview-Kreis auf Terrain folgt dem Cursor (Ringsegment aus Line-Loop).
//
// Objekte folgen: nach jedem Stroke werden alle Scene-Objekte mit
// userData.editable im bbox-Bereich neu auf sampleHeight() gesetzt.

import * as THREE from 'three';
import {
  applyBrush, setCellValues, getCellValues, strokeWorldBounds as strokeBoundsHeight,
  getGridInfo, beginStroke as beginHeightStroke, endStroke as endHeightStroke,
} from '../world/heightEdits.js';
import {
  applyPaintBrush, setPaintCells, getPaintCells, strokeWorldBounds as strokeBoundsPaint,
} from '../world/paintEdits.js';
import {
  sampleHeight, refreshTerrainHeights, refreshTerrainColors,
} from '../scene/terrain.js';

export const TERRAIN_MODES = [
  { id: 'raise',  label: 'Anheben',   icon: '⬆' },
  { id: 'lower',  label: 'Absenken',  icon: '⬇' },
  { id: 'smooth', label: 'Glätten',   icon: '〰' },
  { id: 'level',  label: 'Einebnen',  icon: '▭' },
];

export class TerrainTool {
  constructor({ editor }) {
    this.editor = editor;
    this.mode = 'raise';        // terrain mode
    this.paintMatId = 1;        // 1..8 for paint mode
    this.active = false;
    this.radius = 3.0;
    this.strength = 0.25;       // 0..1
    // 'terrain' | 'paint'
    this.kind = 'terrain';
    // Preview-Kreis (Ring auf Terrain)
    this._preview = null;
    // Stroke-Zustand
    this._currentStroke = null; // { touched: Set, prev: Map|Array ... }
    this._painting = false;
    // Level: Zielhoehe beim Klick
    this._levelY = 0;
    // Zeit-Throttle fuer Pinsel-Samples (ms). Verhindert, dass bei schnellen
    // Pointer-Moves innerhalb von ~1 Frame mehrere Samples auf derselben Stelle
    // uebereinander liegen und Nadeln produzieren.
    this._lastSampleAt = 0;
    this._minSampleMs = 30;
  }

  setActive(on) {
    this.active = !!on;
    this._updatePreview();
  }

  setMode(m) { this.mode = m; }
  setPaintMat(id) { this.paintMatId = id; }
  setRadius(r) { this.radius = Math.max(0.3, Math.min(20, r)); this._updatePreview(); }
  setStrength(s) { this.strength = Math.max(0.02, Math.min(1.0, s)); }
  setKind(k) { this.kind = k; this._updatePreview(); }

  isActive() { return this.active; }

  // ---------- Preview ----------------------------------------------------

  _ensurePreview() {
    if (this._preview) return;
    const seg = 48;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array((seg + 1) * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffb867, transparent: true, opacity: 0.9, depthTest: false,
    });
    const line = new THREE.LineLoop(g, mat);
    line.name = 'terrainBrushPreview';
    line.renderOrder = 998;
    line.frustumCulled = false;
    this._preview = line;
  }

  _updatePreview() {
    this._ensurePreview();
    const ring = this._preview;
    if (!this.active) {
      if (ring.parent) ring.parent.remove(ring);
      return;
    }
    if (!ring.parent) this.editor.scene.add(ring);
    this._regenPreviewGeom(0, 0);
  }

  _regenPreviewGeom(cx, cz) {
    const ring = this._preview;
    if (!ring) return;
    const r = this.radius;
    const seg = 48;
    const pos = ring.geometry.attributes.position;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = sampleHeight(x, z) + 0.12;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  // ---------- Event-Interface --------------------------------------------

  onPointerMove(wx, wz) {
    if (!this.active) return;
    this._regenPreviewGeom(wx, wz);
    if (!this._painting) return;
    // Zeit-Throttle: schnelle Pointer-Moves nicht zu mehreren Samples am
    // gleichen Punkt beschleunigen — gleichbleibender weicher Pinsel-Takt.
    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (now - this._lastSampleAt < this._minSampleMs) return;
    this._lastSampleAt = now;
    this._stroke(wx, wz);
  }

  onPointerDown(wx, wz) {
    if (!this.active) return;
    this._painting = true;
    this._lastSampleAt = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    // Neuer Stroke.
    this._currentStroke = this.kind === 'terrain'
      ? { kind: 'terrain', touched: new Set(), prev: new Map() }
      : { kind: 'paint', touched: new Set(), prevMat: new Map(), prevStr: new Map() };
    if (this.kind === 'terrain') {
      beginHeightStroke();
    }
    if (this.mode === 'level' && this.kind === 'terrain') {
      this._levelY = sampleHeight(wx, wz);
    }
    this._stroke(wx, wz);
  }

  onPointerUp() {
    if (!this.active || !this._painting) return;
    this._painting = false;
    const stroke = this._currentStroke;
    this._currentStroke = null;
    // Strich-Startwerte im heightEdits-Modul freigeben (Cap gilt nur pro Strich).
    if (stroke && stroke.kind === 'terrain') endHeightStroke();
    if (!stroke) return;
    // Undo-Op pushen.
    if (stroke.kind === 'terrain' && stroke.touched.size > 0) {
      const indices = Array.from(stroke.touched);
      const before = new Float32Array(indices.length);
      const after = new Float32Array(indices.length);
      for (let i = 0; i < indices.length; i++) {
        before[i] = stroke.prev.get(indices[i]);
      }
      const cur = getCellValues(indices);
      for (let i = 0; i < cur.length; i++) after[i] = cur[i];
      this.editor._pushUndo({
        kind: 'terrainStroke',
        indices, before, after,
      });
      this.editor._markDirty();
    } else if (stroke.kind === 'paint' && stroke.touched.size > 0) {
      const indices = Array.from(stroke.touched);
      const beforeMat = new Uint8Array(indices.length);
      const beforeStr = new Uint8Array(indices.length);
      const afterMat = new Uint8Array(indices.length);
      const afterStr = new Uint8Array(indices.length);
      for (let i = 0; i < indices.length; i++) {
        beforeMat[i] = stroke.prevMat.get(indices[i]);
        beforeStr[i] = stroke.prevStr.get(indices[i]);
      }
      const cur = getPaintCells(indices);
      for (let i = 0; i < cur.mats.length; i++) { afterMat[i] = cur.mats[i]; afterStr[i] = cur.strs[i]; }
      this.editor._pushUndo({
        kind: 'paintStroke',
        indices,
        beforeMat, beforeStr, afterMat, afterStr,
      });
      this.editor._markDirty();
    }
  }

  _stroke(wx, wz) {
    const r = this.radius;
    const s = this.strength;
    if (this.kind === 'terrain') {
      const res = applyBrush(wx, wz, r, s, this.mode, this._levelY);
      // Nur ERSTE-Berührungen als prev merken (sonst ueberschreiben wir das urspruengliche before).
      const stroke = this._currentStroke;
      for (let k = 0; k < res.touched.length; k++) {
        const idx = res.touched[k];
        if (!stroke.touched.has(idx)) {
          stroke.touched.add(idx);
          stroke.prev.set(idx, res.prev[k]);
        }
      }
      // Terrain-Mesh im bbox updaten.
      const bbox = strokeBoundsHeight(wx, wz, r);
      refreshTerrainHeights(bbox);
      // Objekte, die im bbox liegen -> y neu setzen.
      this._refreshObjectsInBbox(bbox);
    } else {
      const res = applyPaintBrush(wx, wz, r, s, this.paintMatId);
      const stroke = this._currentStroke;
      for (let k = 0; k < res.touched.length; k++) {
        const idx = res.touched[k];
        if (!stroke.touched.has(idx)) {
          stroke.touched.add(idx);
          stroke.prevMat.set(idx, res.prevMat[k]);
          stroke.prevStr.set(idx, res.prevStr[k]);
        }
      }
      const bbox = strokeBoundsPaint(wx, wz, r);
      refreshTerrainColors(bbox);
    }
    this._regenPreviewGeom(wx, wz);
  }

  _refreshObjectsInBbox(bbox) {
    // Alle Editor-Objekte und standardHouse-Objekte sowie Pfade im bbox neu Y setzen.
    this.editor.scene.traverse((o) => {
      const e = o.userData && o.userData.editable;
      if (!e) return;
      const x = o.position.x, z = o.position.z;
      if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) return;
      // Pfade (Zaeune) rebuilden wir unten.
      if (e.isPath) return;
      // Hoehenoffset des Objekts (aus Shift-Drag) UND evtl. Legacy heightOffset
      // aufaddieren. Bruecken behalten y = yOffset (ihre Geometrie liegt um
      // RIVER_SURFACE), alles andere folgt sampleHeight.
      const yOff = (e.yOffset || 0) + (o.userData.heightOffset || 0);
      const base = e.isBridge ? 0 : sampleHeight(x, z);
      o.position.y = base + yOff;
    });
    // Zaeune (Pfade): voll rebuild falls Segmente im bbox.
    if (this.editor.pathTool && this.editor.doc.paths) {
      for (const p of this.editor.doc.paths) {
        let touches = false;
        for (const q of p.points) {
          if (q.x >= bbox.minX && q.x <= bbox.maxX && q.z >= bbox.minZ && q.z <= bbox.maxZ) {
            touches = true; break;
          }
        }
        if (!touches) continue;
        const mesh = this._findSceneObjectById(p.id);
        const parent = mesh ? mesh.parent : this.editor.editGroup;
        if (mesh && mesh.parent) mesh.parent.remove(mesh);
        const newMesh = this.editor.pathTool._buildPathMesh(p);
        if (newMesh) parent.add(newMesh);
      }
    }
  }

  _findSceneObjectById(id) {
    let found = null;
    this.editor.scene.traverse((o) => {
      if (found) return;
      if (o.userData && o.userData.editable && o.userData.editable.id === id) found = o;
    });
    return found;
  }

  // ---------- Undo/Redo -----------------------------------------------------

  applyTerrainStrokeOp(op, dir) {
    const vals = dir === 'undo' ? op.before : op.after;
    setCellValues(op.indices, vals);
    // Mesh updaten in bbox der betroffenen Zellen.
    const bbox = this._bboxFromIndices(op.indices);
    refreshTerrainHeights(bbox);
    this._refreshObjectsInBbox(bbox);
  }

  applyPaintStrokeOp(op, dir) {
    const mats = dir === 'undo' ? op.beforeMat : op.afterMat;
    const strs = dir === 'undo' ? op.beforeStr : op.afterStr;
    setPaintCells(op.indices, mats, strs);
    const bbox = this._bboxFromIndices(op.indices);
    refreshTerrainColors(bbox);
  }

  _bboxFromIndices(indices) {
    const info = getGridInfo();
    const { GRID_SEGS, GRID_RANGE, CELL } = info;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const idx of indices) {
      const j = Math.floor(idx / (GRID_SEGS + 1));
      const i = idx - j * (GRID_SEGS + 1);
      const x = i * CELL - GRID_RANGE * 0.5;
      const z = j * CELL - GRID_RANGE * 0.5;
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }
    // Rand erweitern.
    return {
      minX: minX - CELL, maxX: maxX + CELL,
      minZ: minZ - CELL, maxZ: maxZ + CELL,
    };
  }
}
