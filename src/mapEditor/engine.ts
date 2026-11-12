// Reine Logik des 2D-Editors. KEIN React/DOM-Zugriff — daher auch leicht
// unter Node testbar (siehe engine.test.ts).
//
// Doc-Format (Runde 3d kompatibel zu Runde 2, siehe BE validateEditorDoc):
//   {
//     kind: '2d-editor',
//     width, height, tileSize,
//     floor: number[]  (width*height, Index in FLOOR_MATERIALS)
//     overlay?: number[]  (width*height, 0..255 Alpha fuer weichen zweiten Layer)
//     overlayMat?: number[] (width*height, Material-Index fuer Overlay)
//     walls: {id, a, b, kind: 'wall'|'door'|'window', style?: 'stone'|'wood'}[]
//     objects: {id, type, x, y, rot, scale?, sizeX?, sizeY?, flipX?, flipY?, layer?: 'below'|'above', assetUrl?}[]
//     paths?: {id, kind:'road'|'river'|'bridge-wood'|'bridge-stone', points:[[x,y],...], width, material}[]
//     labels: {id, x, y, text, size?}[]
//   }

export type WallKind = 'wall' | 'door' | 'window';
export type WallStyle = 'stone' | 'wood';
export type ObjectLayer = 'below' | 'above';
export type PathKind = 'road' | 'river' | 'bridge-wood' | 'bridge-stone';

export interface Wall {
    id: string;
    a: [number, number];
    b: [number, number];
    kind: WallKind;
    style?: WallStyle;
}

export interface StampObject {
    id: string;
    type: string;          // Key eines builtin-Stamps ODER 'asset:<assetId>' (gerendert via URL)
    x: number;
    y: number;
    rot: number;           // radians
    scale?: number;        // uniformer Skalierungsfaktor (0.3..6)
    sizeX?: number;        // Breite in Feldern (default 1 bei kleinen Stempeln, groesser bei Haeusern)
    sizeY?: number;        // Hoehe in Feldern
    flipX?: boolean;
    flipY?: boolean;
    layer?: ObjectLayer;   // default 'above'
    assetUrl?: string;     // Bild-URL fuer type='asset:*' (Firebase) — Server validiert nur Laenge
}

export interface MapPath {
    id: string;
    kind: PathKind;
    points: Array<[number, number]>; // Grid-Einheiten, floating point
    width: number;                   // Breite in Feldern (0.3..5)
    material: number;                // Index in FLOOR_MATERIALS (Fallback-Farbe)
}

export interface Label {
    id: string;
    x: number;
    y: number;
    text: string;
    size?: number;
}

export interface EditorDoc {
    kind: '2d-editor';
    width: number;
    height: number;
    tileSize: number; // 5ft per Feld
    floor: number[];
    overlay?: number[];     // Alpha 0..255 pro Zelle
    overlayMat?: number[];  // Material-Index pro Zelle
    walls: Wall[];
    objects: StampObject[];
    paths?: MapPath[];
    labels: Label[];
}

export function newDoc(width = 30, height = 20): EditorDoc {
    return {
        kind: '2d-editor',
        width,
        height,
        tileSize: 5,
        floor: Array.from({ length: width * height }, () => 0),
        overlay: Array.from({ length: width * height }, () => 0),
        overlayMat: Array.from({ length: width * height }, () => 0),
        walls: [],
        objects: [],
        paths: [],
        labels: [],
    };
}

// Normalisiert ein moeglicherweise altes/kaputtes Doc. Kompatibel zu Runde-2-Docs.
export function normalizeDoc(raw: any): EditorDoc {
    if (!raw || typeof raw !== 'object') return newDoc();
    const w = Number.isInteger(raw.width) ? raw.width : 30;
    const h = Number.isInteger(raw.height) ? raw.height : 20;
    const expect = w * h;
    let floor: number[];
    if (Array.isArray(raw.floor) && raw.floor.length === expect) {
        floor = raw.floor.map((v: any) => (Number.isInteger(v) ? v : 0));
    } else {
        floor = Array.from({ length: expect }, () => 0);
    }
    let overlay: number[];
    if (Array.isArray(raw.overlay) && raw.overlay.length === expect) {
        overlay = raw.overlay.map((v: any) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))));
    } else overlay = Array.from({ length: expect }, () => 0);
    let overlayMat: number[];
    if (Array.isArray(raw.overlayMat) && raw.overlayMat.length === expect) {
        overlayMat = raw.overlayMat.map((v: any) => (Number.isInteger(v) ? v : 0));
    } else overlayMat = Array.from({ length: expect }, () => 0);
    const walls: Wall[] = Array.isArray(raw.walls)
        ? raw.walls
              .filter((w: any) => w && Array.isArray(w.a) && Array.isArray(w.b))
              .map((w: any, i: number): Wall => {
                  const kind: WallKind = w.kind === 'door' ? 'door'
                      : w.kind === 'window' ? 'window'
                      : 'wall';
                  const style: WallStyle | undefined = w.style === 'wood' || w.style === 'stone' ? w.style : undefined;
                  return {
                      id: String(w.id || `wall-${i}`),
                      a: [Math.round(w.a[0]), Math.round(w.a[1])],
                      b: [Math.round(w.b[0]), Math.round(w.b[1])],
                      kind,
                      style,
                  };
              })
        : [];
    const objects: StampObject[] = Array.isArray(raw.objects)
        ? raw.objects
              .filter((o: any) => o && typeof o.type === 'string')
              .map((o: any, i: number): StampObject => ({
                  id: String(o.id || `obj-${i}`),
                  type: o.type,
                  x: Number(o.x) || 0,
                  y: Number(o.y) || 0,
                  rot: Number(o.rot) || 0,
                  scale: typeof o.scale === 'number' ? o.scale : 1,
                  sizeX: typeof o.sizeX === 'number' ? o.sizeX : undefined,
                  sizeY: typeof o.sizeY === 'number' ? o.sizeY : undefined,
                  flipX: o.flipX === true ? true : undefined,
                  flipY: o.flipY === true ? true : undefined,
                  layer: o.layer === 'below' ? 'below' : (o.layer === 'above' ? 'above' : undefined),
                  assetUrl: typeof o.assetUrl === 'string' && o.assetUrl.length < 600 ? o.assetUrl : undefined,
              }))
        : [];
    const paths: MapPath[] = Array.isArray(raw.paths)
        ? raw.paths
              .filter((p: any) => p && Array.isArray(p.points) && p.points.length >= 2)
              .map((p: any, i: number): MapPath => ({
                  id: String(p.id || `path-${i}`),
                  kind: (['road', 'river', 'bridge-wood', 'bridge-stone'].includes(p.kind) ? p.kind : 'road'),
                  points: p.points
                      .filter((pt: any) => Array.isArray(pt) && pt.length === 2)
                      .map((pt: any) => [Number(pt[0]) || 0, Number(pt[1]) || 0] as [number, number]),
                  width: Math.max(0.3, Math.min(5, Number(p.width) || 1)),
                  material: Number.isInteger(p.material) ? p.material : 0,
              }))
        : [];
    const labels: Label[] = Array.isArray(raw.labels)
        ? raw.labels
              .filter((l: any) => l && typeof l.text === 'string')
              .map((l: any, i: number): Label => ({
                  id: String(l.id || `lbl-${i}`),
                  x: Number(l.x) || 0,
                  y: Number(l.y) || 0,
                  text: l.text,
                  size: typeof l.size === 'number' ? l.size : 14,
              }))
        : [];
    return {
        kind: '2d-editor',
        width: w,
        height: h,
        tileSize: Number.isFinite(raw.tileSize) ? raw.tileSize : 5,
        floor,
        overlay,
        overlayMat,
        walls,
        objects,
        paths,
        labels,
    };
}

// ---------- Treffer-Tests ----------

export function fieldAt(doc: EditorDoc, wx: number, wy: number): { col: number; row: number } | null {
    const col = Math.floor(wx);
    const row = Math.floor(wy);
    if (col < 0 || col >= doc.width || row < 0 || row >= doc.height) return null;
    return { col, row };
}

export function edgeAt(
    doc: EditorDoc,
    wx: number,
    wy: number,
    tol = 0.22
): { a: [number, number]; b: [number, number] } | null {
    const ry = Math.round(wy);
    const dy = Math.abs(wy - ry);
    const rx = Math.round(wx);
    const dx = Math.abs(wx - rx);
    if (dy < dx && dy <= tol) {
        const col = Math.floor(wx);
        if (col < 0 || col >= doc.width || ry < 0 || ry > doc.height) return null;
        return { a: [col, ry], b: [col + 1, ry] };
    }
    if (dx <= tol) {
        const row = Math.floor(wy);
        if (row < 0 || row >= doc.height || rx < 0 || rx > doc.width) return null;
        return { a: [rx, row], b: [rx, row + 1] };
    }
    return null;
}

// Nearest-corner fuer Wand-Linienzug.
export function nearestCorner(doc: EditorDoc, wx: number, wy: number): [number, number] | null {
    const cx = Math.max(0, Math.min(doc.width, Math.round(wx)));
    const cy = Math.max(0, Math.min(doc.height, Math.round(wy)));
    return [cx, cy];
}

// Zerlegt eine Linie zwischen Ecken in Einheits-Kanten (axial, Manhattan).
// Jede Teilstrecke ist 1 Feld lang und liegt entweder horizontal oder vertikal.
export function cornerPathToEdges(from: [number, number], to: [number, number]): Array<[[number, number], [number, number]]> {
    const [ax, ay] = from;
    const [bx, by] = to;
    const edges: Array<[[number, number], [number, number]]> = [];
    // Zuerst horizontal, dann vertikal (L-Form).
    let cx = ax, cy = ay;
    while (cx !== bx) {
        const nx = cx + (bx > cx ? 1 : -1);
        const a: [number, number] = [Math.min(cx, nx), cy];
        const b: [number, number] = [Math.max(cx, nx), cy];
        edges.push([a, b]);
        cx = nx;
    }
    while (cy !== by) {
        const ny = cy + (by > cy ? 1 : -1);
        const a: [number, number] = [cx, Math.min(cy, ny)];
        const b: [number, number] = [cx, Math.max(cy, ny)];
        edges.push([a, b]);
        cy = ny;
    }
    return edges;
}

export function edgeKey(a: [number, number], b: [number, number]): string {
    const [a1, a2] = a;
    const [b1, b2] = b;
    if (a1 < b1 || (a1 === b1 && a2 < b2)) return `${a1},${a2}-${b1},${b2}`;
    return `${b1},${b2}-${a1},${a2}`;
}

// ---------- Flaechen ----------

export function floorIdx(doc: EditorDoc, col: number, row: number): number {
    return row * doc.width + col;
}

export function getFloor(doc: EditorDoc, col: number, row: number): number {
    return doc.floor[floorIdx(doc, col, row)];
}

export function setFloor(doc: EditorDoc, col: number, row: number, mat: number): void {
    doc.floor[floorIdx(doc, col, row)] = mat;
}

// Soft paint: Overlay-Alpha einer Zelle erhoehen + Material setzen.
export function paintOverlay(doc: EditorDoc, col: number, row: number, mat: number, deltaAlpha: number): void {
    if (col < 0 || col >= doc.width || row < 0 || row >= doc.height) return;
    if (!doc.overlay) doc.overlay = Array.from({ length: doc.width * doc.height }, () => 0);
    if (!doc.overlayMat) doc.overlayMat = Array.from({ length: doc.width * doc.height }, () => 0);
    const i = floorIdx(doc, col, row);
    if (doc.overlayMat[i] !== mat && doc.overlay[i] > 0) {
        // Anderes Material -> alpha nach 0 "verwaschen", damit ein Wechsel nicht abrupt wirkt.
        doc.overlay[i] = Math.max(0, doc.overlay[i] - deltaAlpha);
        if (doc.overlay[i] === 0) doc.overlayMat[i] = mat;
    } else {
        doc.overlayMat[i] = mat;
        doc.overlay[i] = Math.max(0, Math.min(255, doc.overlay[i] + deltaAlpha));
    }
}

export function clearOverlay(doc: EditorDoc, col: number, row: number): void {
    if (col < 0 || col >= doc.width || row < 0 || row >= doc.height) return;
    if (!doc.overlay) return;
    doc.overlay[floorIdx(doc, col, row)] = 0;
}

export function floodFill(
    doc: EditorDoc,
    startCol: number,
    startRow: number,
    newMat: number
): number[] {
    const out = doc.floor.slice();
    if (startCol < 0 || startCol >= doc.width || startRow < 0 || startRow >= doc.height) return out;
    const target = out[floorIdx(doc, startCol, startRow)];
    if (target === newMat) return out;
    const stack: Array<[number, number]> = [[startCol, startRow]];
    while (stack.length) {
        const [c, r] = stack.pop()!;
        if (c < 0 || c >= doc.width || r < 0 || r >= doc.height) continue;
        const i = r * doc.width + c;
        if (out[i] !== target) continue;
        out[i] = newMat;
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return out;
}

export function brushCells(
    doc: EditorDoc,
    col: number,
    row: number,
    radius: number
): Array<[number, number]> {
    const r = Math.max(0, Math.floor(radius));
    const out: Array<[number, number]> = [];
    for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
            if (dc * dc + dr * dr > r * r + 0.1) continue;
            const c = col + dc, rr = row + dr;
            if (c >= 0 && c < doc.width && rr >= 0 && rr < doc.height) out.push([c, rr]);
        }
    }
    return out;
}

// Pinsel-Falloff: 1.0 im Zentrum, 0.0 am Rand. Fuer weichen Terrain-Pinsel.
export function brushCellsFalloff(
    doc: EditorDoc,
    col: number,
    row: number,
    radius: number
): Array<[number, number, number]> {
    const r = Math.max(0, Math.floor(radius));
    const out: Array<[number, number, number]> = [];
    const R2 = Math.max(0.25, r * r + 0.5);
    for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
            const d2 = dc * dc + dr * dr;
            if (d2 > R2) continue;
            const c = col + dc, rr = row + dr;
            if (c < 0 || c >= doc.width || rr < 0 || rr >= doc.height) continue;
            const f = 1 - Math.sqrt(d2 / R2);
            out.push([c, rr, Math.max(0, Math.min(1, f))]);
        }
    }
    return out;
}

// ---------- Undo-Stack ----------

export interface UndoEntry { doc: EditorDoc; }

export class UndoStack {
    undo: UndoEntry[] = [];
    redo: UndoEntry[] = [];
    limit: number;
    constructor(limit = 50) { this.limit = limit; }
    push(doc: EditorDoc): void {
        this.undo.push({ doc: clone(doc) });
        if (this.undo.length > this.limit) this.undo.shift();
        this.redo = [];
    }
    canUndo(): boolean { return this.undo.length > 0; }
    canRedo(): boolean { return this.redo.length > 0; }
    doUndo(current: EditorDoc): EditorDoc | null {
        if (this.undo.length === 0) return null;
        this.redo.push({ doc: clone(current) });
        const entry = this.undo.pop()!;
        return entry.doc;
    }
    doRedo(current: EditorDoc): EditorDoc | null {
        if (this.redo.length === 0) return null;
        this.undo.push({ doc: clone(current) });
        const entry = this.redo.pop()!;
        return entry.doc;
    }
    clear(): void { this.undo = []; this.redo = []; }
}

export function clone(doc: EditorDoc): EditorDoc {
    return {
        kind: '2d-editor',
        width: doc.width,
        height: doc.height,
        tileSize: doc.tileSize,
        floor: doc.floor.slice(),
        overlay: doc.overlay ? doc.overlay.slice() : undefined,
        overlayMat: doc.overlayMat ? doc.overlayMat.slice() : undefined,
        walls: doc.walls.map((w) => ({ ...w, a: [w.a[0], w.a[1]], b: [w.b[0], w.b[1]] })),
        objects: doc.objects.map((o) => ({ ...o })),
        paths: doc.paths ? doc.paths.map((p) => ({ ...p, points: p.points.map((pt) => [pt[0], pt[1]] as [number, number]) })) : [],
        labels: doc.labels.map((l) => ({ ...l })),
    };
}

// Objekt-Hitbox beruecksichtigt sizeX/sizeY: Grosse Objekte (z.B. Haeuser 3x3)
// bekommen eine entsprechend groesser Trefferflaeche.
export function objectAt(doc: EditorDoc, wx: number, wy: number): StampObject | null {
    let best: StampObject | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = doc.objects.length - 1; i >= 0; i--) {
        const o = doc.objects[i];
        const sx = (o.sizeX || 1) * (o.scale || 1);
        const sy = (o.sizeY || 1) * (o.scale || 1);
        const dx = (o.x - wx) / sx;
        const dy = (o.y - wy) / sy;
        const d = dx * dx + dy * dy;
        if (d < 0.35 && d < bestD) { bestD = d; best = o; }
    }
    return best;
}

export function objectsInRect(
    doc: EditorDoc,
    x0: number, y0: number, x1: number, y1: number
): StampObject[] {
    const lx = Math.min(x0, x1), rx = Math.max(x0, x1);
    const ly = Math.min(y0, y1), ry = Math.max(y0, y1);
    return doc.objects.filter((o) => o.x >= lx && o.x <= rx && o.y >= ly && o.y <= ry);
}

export function labelAt(doc: EditorDoc, wx: number, wy: number): Label | null {
    for (let i = doc.labels.length - 1; i >= 0; i--) {
        const l = doc.labels[i];
        if (Math.abs(l.x - wx) < 0.6 && Math.abs(l.y - wy) < 0.3) return l;
    }
    return null;
}

// Pfad-Hitbox (distance von (wx,wy) zum naechsten Segment < width/2 + tol)
export function pathAt(doc: EditorDoc, wx: number, wy: number, tol = 0.1): MapPath | null {
    const paths = doc.paths || [];
    for (let i = paths.length - 1; i >= 0; i--) {
        const p = paths[i];
        const halfW = p.width / 2 + tol;
        for (let k = 0; k < p.points.length - 1; k++) {
            const [x1, y1] = p.points[k];
            const [x2, y2] = p.points[k + 1];
            const dx = x2 - x1, dy = y2 - y1;
            const len2 = dx * dx + dy * dy;
            if (len2 === 0) continue;
            const t = Math.max(0, Math.min(1, ((wx - x1) * dx + (wy - y1) * dy) / len2));
            const px = x1 + t * dx;
            const py = y1 + t * dy;
            const d2 = (wx - px) * (wx - px) + (wy - py) * (wy - py);
            if (d2 <= halfW * halfW) return p;
        }
    }
    return null;
}

export function randomId(prefix = 'id'): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
