// Reine Logik des 2D-Editors. KEIN React/DOM-Zugriff — daher auch leicht
// unter Node testbar (siehe engine.test.ts).
//
// Dokument-Format (wird so in Map.doc gespeichert und vom BE grob validiert,
// siehe BE/src/routes/maps.js validateEditorDoc):
//   {
//     kind: '2d-editor',
//     width, height, tileSize,
//     floor: number[]  (width*height Eintraege, Index in FLOOR_MATERIALS)
//     walls: {id, a:[col,row], b:[col,row], kind:'wall'|'door'}[]
//     objects: {id, type, x, y, rot, scale?}[]       (x,y in Grid-Einheiten)
//     labels: {id, x, y, text, size?}[]
//   }
//
// Koordinaten: Felder (col 0..width-1, row 0..height-1). Wand-Endpunkte sind
// Ecken (col 0..width, row 0..height). Das entspricht dem klassischen
// Battlemap-Konzept — Waende liegen auf Feldkanten.

export interface Wall {
    id: string;
    a: [number, number]; // Ecke (col, row)
    b: [number, number]; // Ecke (col, row), nur horizontal oder vertikal benachbart
    kind: 'wall' | 'door';
}

export interface StampObject {
    id: string;
    type: string;
    x: number; // Grid-Einheit (float), 0..width
    y: number;
    rot: number; // Radians
    scale?: number;
}

export interface Label {
    id: string;
    x: number;
    y: number;
    text: string;
    size?: number; // px bei zoom 1 (default 14)
}

export interface EditorDoc {
    kind: '2d-editor';
    width: number;
    height: number;
    tileSize: number; // nur Meta (Fuss pro Feld, default 5)
    floor: number[];
    walls: Wall[];
    objects: StampObject[];
    labels: Label[];
}

export function newDoc(width = 30, height = 20): EditorDoc {
    return {
        kind: '2d-editor',
        width,
        height,
        tileSize: 5,
        floor: Array.from({ length: width * height }, () => 0),
        walls: [],
        objects: [],
        labels: [],
    };
}

// Normalisiert ein moeglicherweise altes/kaputtes Doc so, dass Renderer +
// Editor damit umgehen koennen. Verwendet, wenn wir ein Doc aus dem BE lesen.
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
    const walls: Wall[] = Array.isArray(raw.walls)
        ? raw.walls
              .filter((w: any) => w && Array.isArray(w.a) && Array.isArray(w.b))
              .map((w: any, i: number) => ({
                  id: String(w.id || `wall-${i}`),
                  a: [Math.round(w.a[0]), Math.round(w.a[1])],
                  b: [Math.round(w.b[0]), Math.round(w.b[1])],
                  kind: w.kind === 'door' ? 'door' : 'wall',
              }))
        : [];
    const objects: StampObject[] = Array.isArray(raw.objects)
        ? raw.objects
              .filter((o: any) => o && typeof o.type === 'string')
              .map((o: any, i: number) => ({
                  id: String(o.id || `obj-${i}`),
                  type: o.type,
                  x: Number(o.x) || 0,
                  y: Number(o.y) || 0,
                  rot: Number(o.rot) || 0,
                  scale: typeof o.scale === 'number' ? o.scale : 1,
              }))
        : [];
    const labels: Label[] = Array.isArray(raw.labels)
        ? raw.labels
              .filter((l: any) => l && typeof l.text === 'string')
              .map((l: any, i: number) => ({
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
        walls,
        objects,
        labels,
    };
}

// ---------- Treffer-Tests ----------

// Welches Feld liegt unter World-Koordinate (wx, wy)?  Null wenn ausserhalb.
// wx, wy = Feldeinheiten (0..width, 0..height).
export function fieldAt(doc: EditorDoc, wx: number, wy: number): { col: number; row: number } | null {
    const col = Math.floor(wx);
    const row = Math.floor(wy);
    if (col < 0 || col >= doc.width || row < 0 || row >= doc.height) return null;
    return { col, row };
}

// Welche Kante liegt in der Naehe von (wx, wy)? Toleranz in Feldeinheiten.
// Gibt {a,b} mit Ecken zurueck, oder null.
export function edgeAt(
    doc: EditorDoc,
    wx: number,
    wy: number,
    tol = 0.22
): { a: [number, number]; b: [number, number] } | null {
    // Horizontale Kanten: y ~ Integer
    const ry = Math.round(wy);
    const dy = Math.abs(wy - ry);
    const rx = Math.round(wx);
    const dx = Math.abs(wx - rx);

    // Entscheide: naeher an horizontaler oder vertikaler Kante?
    if (dy < dx && dy <= tol) {
        // horizontale Kante zwischen (col, ry) und (col+1, ry)
        const col = Math.floor(wx);
        if (col < 0 || col >= doc.width || ry < 0 || ry > doc.height) return null;
        return { a: [col, ry], b: [col + 1, ry] };
    }
    if (dx <= tol) {
        // vertikale Kante
        const row = Math.floor(wy);
        if (row < 0 || row >= doc.height || rx < 0 || rx > doc.width) return null;
        return { a: [rx, row], b: [rx, row + 1] };
    }
    return null;
}

export function edgeKey(a: [number, number], b: [number, number]): string {
    // Kanten sind ungeordnet -> normalisieren.
    const [a1, a2] = a;
    const [b1, b2] = b;
    if (a1 < b1 || (a1 === b1 && a2 < b2)) return `${a1},${a2}-${b1},${b2}`;
    return `${b1},${b2}-${a1},${a2}`;
}

// ---------- Flaechenfuellen ----------

export function floorIdx(doc: EditorDoc, col: number, row: number): number {
    return row * doc.width + col;
}

export function getFloor(doc: EditorDoc, col: number, row: number): number {
    return doc.floor[floorIdx(doc, col, row)];
}

export function setFloor(doc: EditorDoc, col: number, row: number, mat: number): void {
    doc.floor[floorIdx(doc, col, row)] = mat;
}

// Flood-fill (4-connected) auf dem floor-Array. Erzeugt NICHT das neue Doc —
// mutiert eine Kopie. floorAfter = aufrufer uebergibt frisches Array.
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

// Pinsel: liefert die Zellen-Koordinaten in einem Radius (in Feldern) um
// das Zentrum (col, row). radius=0 -> genau eine Zelle.
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

// ---------- Undo-Stack ----------

export interface UndoEntry {
    // minimaler Snapshot. Fuer < 30k Zellen voellig ok.
    doc: EditorDoc;
}

export class UndoStack {
    undo: UndoEntry[] = [];
    redo: UndoEntry[] = [];
    limit: number;

    constructor(limit = 50) {
        this.limit = limit;
    }

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

    clear(): void {
        this.undo = [];
        this.redo = [];
    }
}

export function clone(doc: EditorDoc): EditorDoc {
    return {
        kind: '2d-editor',
        width: doc.width,
        height: doc.height,
        tileSize: doc.tileSize,
        floor: doc.floor.slice(),
        walls: doc.walls.map((w) => ({ ...w, a: [w.a[0], w.a[1]], b: [w.b[0], w.b[1]] })),
        objects: doc.objects.map((o) => ({ ...o })),
        labels: doc.labels.map((l) => ({ ...l })),
    };
}

// Trefferabfrage fuer Objekte: einfache runde Hitbox mit Radius 0.4.
export function objectAt(doc: EditorDoc, wx: number, wy: number): StampObject | null {
    let best: StampObject | null = null;
    let bestD = 0.4 * 0.4;
    for (let i = doc.objects.length - 1; i >= 0; i--) {
        const o = doc.objects[i];
        const dx = o.x - wx, dy = o.y - wy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = o; }
    }
    return best;
}

export function labelAt(doc: EditorDoc, wx: number, wy: number): Label | null {
    // einfache Hitbox 0.6 Felder
    for (let i = doc.labels.length - 1; i >= 0; i--) {
        const l = doc.labels[i];
        if (Math.abs(l.x - wx) < 0.6 && Math.abs(l.y - wy) < 0.3) return l;
    }
    return null;
}

export function randomId(prefix = 'id'): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
