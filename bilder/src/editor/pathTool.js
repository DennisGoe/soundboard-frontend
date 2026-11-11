// Generisches Pfad-Werkzeug. Phase 1 nutzt es fuer Zaeune, vorbereitet fuer
// Wege/Fluesse in Phase 2.
//
// State-Machine:
//   IDLE        -> keine aktive Zeichnung.
//   DRAWING     -> Benutzer setzt Punkte (Klick = neuer Punkt). Ghost-Preview
//                  der naechsten Linie folgt der Maus. Doppelklick/Enter = fertig,
//                  Esc = abbrechen.
//   EDITING     -> Pfad liegt in doc.paths; beim Klick auf Handle kann er
//                  bearbeitet werden (Drag verschiebt Punkt, Entf loescht Pfad).
//
// Der Tool-Typ bestimmt den Geometrie-Builder (Zaun-Stil). Signatur:
//   builder(points, style, sampleHeight) -> THREE.Group
//
// Minimale Abhaengigkeiten — nur editor-seitig (fuer three.js + Raycasting).

import * as THREE from 'three';
import { buildFence, tintFenceAsGhost } from '../world/fences.js';
import { sampleHeight } from '../scene/terrain.js';

// Styles die wir aktuell unterstuetzen.
export const FENCE_STYLES = [
  { id: 'wood',   label: 'Holzlatte',  icon: '🪵' },
  { id: 'wicker', label: 'Flechtzaun', icon: '🌾' },
  { id: 'stone',  label: 'Steinmauer', icon: '🧱' },
];

export class PathTool {
  constructor({ editor }) {
    this.editor = editor;
    // State
    this.mode = 'IDLE';        // 'IDLE' | 'DRAWING' | 'EDITING'
    this.style = 'wood';
    this.points = [];          // Anker-Punkte {x, z}
    // Dom-Elemente
    this._ghost = null;
    this._lineGhost = null;    // Punkt-fuer-Punkt Liniengeometrie (blau)
    this._handles = null;      // Gruppe aus Sphere-Meshes fuer Anker
    this._activePathEntry = null; // Doc-Eintrag im Edit-Modus (reference)
    this._activePathMesh = null;  // 3D-Mesh im Edit-Modus
    this._dragHandleIndex = -1;
  }

  // --- API ------------------------------------------------------------------

  isActive() { return this.mode !== 'IDLE'; }

  // Beginnt ein neues Zeichnen.
  beginDraw(style = 'wood') {
    this._endEditing();
    this._endDrawing();
    this.style = style;
    this.points = [];
    this.mode = 'DRAWING';
  }

  // Beendet draw. Baut final Fence + legt Doc-Eintrag an. Returns {id, pathEntry}.
  finishDraw() {
    if (this.mode !== 'DRAWING') return null;
    if (this.points.length < 2) { this._endDrawing(); return null; }
    const id = 'path_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
    const pathEntry = {
      id, type: 'fence', style: this.style,
      points: this.points.map((p) => ({ x: p.x, z: p.z })),
    };
    this._addToDocAndScene(pathEntry);
    this._endDrawing();
    return { id, pathEntry };
  }

  // Bricht aktuelles Zeichnen ab.
  cancelDraw() {
    if (this.mode !== 'DRAWING') return;
    this._endDrawing();
  }

  // Klick waehrend DRAWING: Punkt hinzufuegen.
  onCanvasClick(wx, wz) {
    if (this.mode !== 'DRAWING') return false;
    this.points.push({ x: wx, z: wz });
    this._updateGhost();
    this._updateHandles();
    return true;
  }

  // Mausbewegung (DRAWING): Ghost mit Hover-Point aktualisieren.
  onCanvasMove(wx, wz) {
    if (this.mode !== 'DRAWING') return;
    this._updateGhost([{ x: wx, z: wz }]);
  }

  // Klick auf einen bestehenden Pfad im EditGroup (um Edit-Mode zu starten).
  beginEditPath(pathMesh) {
    if (this._activePathEntry && this._activePathEntry.id === pathMesh.userData.pathId) return;
    const pathId = pathMesh.userData.pathId;
    const entry = this.editor.doc.paths?.find((p) => p.id === pathId);
    if (!entry) return;
    this._endDrawing();
    this.mode = 'EDITING';
    this._activePathEntry = entry;
    this._activePathMesh = pathMesh;
    this.points = entry.points.map((p) => ({ x: p.x, z: p.z }));
    this.style = entry.style;
    this._updateHandles();
  }

  _endEditing() {
    this.mode = 'IDLE';
    this._activePathEntry = null;
    this._activePathMesh = null;
    this._clearHandles();
  }

  // Ist ein Handle unter dem Klick? Wenn ja, Index zurueckgeben.
  pickHandleAt(worldX, worldZ, pickRadius = 1.0) {
    if (!this._handles) return -1;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const d = Math.hypot(p.x - worldX, p.z - worldZ);
      if (d < pickRadius) return i;
    }
    return -1;
  }

  // Wird vom Editor aufgerufen, wenn ein Handle (im Edit-Mode) gedraggt wird.
  dragHandle(index, wx, wz) {
    if (index < 0 || index >= this.points.length) return;
    this.points[index] = { x: wx, z: wz };
    // Rebuild Mesh preview inkrementell.
    if (this._activePathEntry) {
      this._activePathEntry.points[index] = { x: wx, z: wz };
    }
    this._updateHandles();
    if (this._activePathMesh) {
      this._rebuildActivePathMesh();
    }
  }

  // Loescht ein Handle (Punkt) aus dem aktiven Pfad.
  deleteHandle(index) {
    if (this.mode !== 'EDITING') return;
    if (this.points.length <= 2) return;
    this.points.splice(index, 1);
    this._activePathEntry.points.splice(index, 1);
    this._updateHandles();
    this._rebuildActivePathMesh();
  }

  // Loescht den aktiven Pfad ganz.
  deleteActivePath() {
    if (this.mode !== 'EDITING') return null;
    const id = this._activePathEntry.id;
    this.editor.doc.paths = (this.editor.doc.paths || []).filter((p) => p.id !== id);
    if (this._activePathMesh && this._activePathMesh.parent) {
      this._activePathMesh.parent.remove(this._activePathMesh);
    }
    this._endEditing();
    return id;
  }

  // --- Interna -------------------------------------------------------------

  _endDrawing() {
    this.mode = 'IDLE';
    this.points = [];
    this._clearGhost();
    this._clearHandles();
  }

  _clearGhost() {
    if (this._ghost && this._ghost.parent) this._ghost.parent.remove(this._ghost);
    this._ghost = null;
    if (this._lineGhost && this._lineGhost.parent) this._lineGhost.parent.remove(this._lineGhost);
    this._lineGhost = null;
  }

  _updateGhost(hoverPts = []) {
    this._clearGhost();
    const pts = this.points.concat(hoverPts);
    if (pts.length < 2) {
      // Punkt-Linien-Preview (ein Punkt): einfach Handle anzeigen
      return;
    }
    // Ghost-Fence bauen (billig: wir benutzen den aktuellen Style).
    const ghost = buildFence(pts, this.style, sampleHeight);
    tintFenceAsGhost(ghost, true);
    ghost.renderOrder = 998;
    this.editor.scene.add(ghost);
    this._ghost = ghost;
    // Zusaetzliche Punkt-fuer-Punkt-Linie zur Orientierung.
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      positions[i * 3 + 0] = pts[i].x;
      positions[i * 3 + 1] = sampleHeight(pts[i].x, pts[i].z) + 0.9;
      positions[i * 3 + 2] = pts[i].z;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
      color: 0x66ff8e, transparent: true, opacity: 0.8, depthTest: false,
    }));
    line.renderOrder = 999;
    this.editor.scene.add(line);
    this._lineGhost = line;
  }

  _clearHandles() {
    if (this._handles && this._handles.parent) this._handles.parent.remove(this._handles);
    this._handles = null;
  }

  _updateHandles() {
    this._clearHandles();
    if (this.points.length === 0) return;
    const g = new THREE.Group();
    g.name = 'pathHandles';
    g.renderOrder = 1000;
    const geo = new THREE.SphereGeometry(0.18, 10, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd166, depthTest: false, transparent: true, opacity: 0.95,
    });
    for (const p of this.points) {
      const s = new THREE.Mesh(geo, mat);
      s.position.set(p.x, sampleHeight(p.x, p.z) + 0.9, p.z);
      s.renderOrder = 1000;
      g.add(s);
    }
    this.editor.scene.add(g);
    this._handles = g;
  }

  // --- Doc + Scene-Integration --------------------------------------------

  _addToDocAndScene(pathEntry) {
    if (!this.editor.doc.paths) this.editor.doc.paths = [];
    this.editor.doc.paths.push(pathEntry);
    const mesh = this._buildPathMesh(pathEntry);
    if (mesh) {
      this.editor.editGroup.add(mesh);
    }
    this.editor._markDirty();
    // Push Undo
    this.editor._pushUndo({ kind: 'pathCreate', id: pathEntry.id, snapshot: { ...pathEntry } });
  }

  _buildPathMesh(pathEntry) {
    const g = buildFence(pathEntry.points, pathEntry.style, sampleHeight);
    g.userData.editable = {
      id: pathEntry.id,
      type: 'path.fence.' + pathEntry.style,
      scale: 1,
      standardHouseId: null,
      procId: pathEntry.id,
      isPath: true,
    };
    g.userData.pathId = pathEntry.id;
    g.name = 'editable:path.fence.' + pathEntry.style + ':' + pathEntry.id;
    return g;
  }

  _rebuildActivePathMesh() {
    if (!this._activePathMesh || !this._activePathEntry) return;
    const parent = this._activePathMesh.parent;
    parent.remove(this._activePathMesh);
    const newMesh = this._buildPathMesh(this._activePathEntry);
    parent.add(newMesh);
    this._activePathMesh = newMesh;
  }

  // Bei Scene-Rebuild (z.B. nach reload) alle Pfade aus doc.paths materialisieren.
  materializeAllFromDoc() {
    if (!this.editor.doc.paths) return;
    for (const p of this.editor.doc.paths) {
      const mesh = this._buildPathMesh(p);
      if (mesh) this.editor.editGroup.add(mesh);
    }
  }
}
