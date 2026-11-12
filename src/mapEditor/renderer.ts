// Canvas-Renderer fuer ein EditorDoc. Reiner Zeichen-Code.
// Reihenfolge: Hintergrund -> Floor -> Shoreline -> Overlay (soft terrain)
//              -> Paths -> Grid -> Objekt-Layer 'below' -> Walls -> Obj 'above'
//              -> Labels -> Rahmen.

import { EditorDoc, Wall, StampObject, MapPath } from './engine';
import { FLOOR_MATERIALS, OBJECT_STAMPS, StampDef } from './palette';

export interface Transform {
    x: number;
    y: number;
    scale: number;
    tilePx: number;
}

export interface RenderOptions {
    showGrid?: boolean;
    hoverCells?: Array<[number, number]>;
    hoverEdge?: { a: [number, number]; b: [number, number] } | null;
    hoverPath?: Array<[number, number]> | null;    // Vorschau beim Pfad-Tool
    selectedObjectIds?: Set<string>;                // Mehrfachauswahl
    selectedLabelId?: string | null;
    selectedPathId?: string | null;
    wallChainStart?: [number, number] | null;       // Linienzug-Start
    selectRect?: { x0:number;y0:number;x1:number;y1:number } | null;
    objectImageCache?: Map<string, HTMLImageElement>; // fuer type='asset:*'
}

const STAMP_INDEX: Record<string, StampDef> = (() => {
    const o: Record<string, StampDef> = {};
    for (const s of OBJECT_STAMPS) o[s.key] = s;
    return o;
})();

export function render(
    ctx: CanvasRenderingContext2D,
    doc: EditorDoc,
    t: Transform,
    opts: RenderOptions = {}
): void {
    const canvas = ctx.canvas;
    const px = (v: number) => t.x + v * t.tilePx * t.scale;
    const py = (v: number) => t.y + v * t.tilePx * t.scale;
    const unit = t.tilePx * t.scale;
    const sel = opts.selectedObjectIds || new Set<string>();

    // --- Hintergrund ---
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#120a05');
    bg.addColorStop(1, '#1b120a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // --- Boden ---
    for (let r = 0; r < doc.height; r++) {
        for (let c = 0; c < doc.width; c++) {
            const mi = doc.floor[r * doc.width + c] || 0;
            const mat = FLOOR_MATERIALS[mi] || FLOOR_MATERIALS[0];
            const x = px(c), y = py(r);
            ctx.fillStyle = mat.base;
            ctx.fillRect(x, y, unit + 0.5, unit + 0.5);
            if (unit >= 14 && mat.pattern) drawPattern(ctx, mat.pattern, mat.tint, x, y, unit, c + r * 13);
        }
    }

    // --- Shoreline (Wasser-Material grenzt an Nicht-Wasser -> sandiger Rand) ---
    if (unit >= 10) drawShorelines(ctx, doc, px, py, unit);

    // --- Overlay (weich gemalter zweiter Layer) ---
    if (doc.overlay && doc.overlayMat && unit >= 10) {
        for (let r = 0; r < doc.height; r++) {
            for (let c = 0; c < doc.width; c++) {
                const i = r * doc.width + c;
                const a = doc.overlay[i] | 0;
                if (a <= 0) continue;
                const mat = FLOOR_MATERIALS[doc.overlayMat[i]] || FLOOR_MATERIALS[0];
                ctx.save();
                ctx.globalAlpha = Math.min(1, a / 255);
                ctx.fillStyle = mat.base;
                ctx.fillRect(px(c), py(r), unit + 0.5, unit + 0.5);
                if (unit >= 14 && mat.pattern) drawPattern(ctx, mat.pattern, mat.tint, px(c), py(r), unit, c + r * 17);
                ctx.restore();
            }
        }
    }

    // --- Pfade (Strassen, Fluesse, Bruecken) ---
    if (doc.paths && doc.paths.length > 0) {
        for (const p of doc.paths) drawPath(ctx, p, px, py, unit, opts.selectedPathId === p.id);
    }
    // Live-Vorschau des Pfad-Tools
    if (opts.hoverPath && opts.hoverPath.length >= 2) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(230, 197, 106, 0.8)';
        ctx.lineWidth = Math.max(2, unit * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        opts.hoverPath.forEach(([x, y], i) => i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)));
        ctx.stroke();
        ctx.restore();
    }

    // --- Grid ---
    if (opts.showGrid !== false) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 0; c <= doc.width; c++) {
            ctx.moveTo(px(c) + 0.5, py(0));
            ctx.lineTo(px(c) + 0.5, py(doc.height));
        }
        for (let r = 0; r <= doc.height; r++) {
            ctx.moveTo(px(0), py(r) + 0.5);
            ctx.lineTo(px(doc.width), py(r) + 0.5);
        }
        ctx.stroke();
        ctx.restore();
    }

    // --- Hover-Cells (Pinsel-Preview) ---
    if (opts.hoverCells && opts.hoverCells.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(230, 197, 106, 0.25)';
        for (const [c, r] of opts.hoverCells) ctx.fillRect(px(c), py(r), unit, unit);
        ctx.strokeStyle = 'rgba(230, 197, 106, 0.7)';
        ctx.lineWidth = 2;
        for (const [c, r] of opts.hoverCells) ctx.strokeRect(px(c) + 1, py(r) + 1, unit - 2, unit - 2);
        ctx.restore();
    }

    // --- Objekt-Layer 'below' (vor Waenden) ---
    for (const o of doc.objects) {
        const layer = o.layer || 'above';
        if (layer !== 'below') continue;
        drawObject(ctx, o, px, py, unit, sel.has(o.id), opts.objectImageCache);
    }

    // --- Waende ---
    ctx.save();
    for (const w of doc.walls) drawWall(ctx, w, px, py, unit);
    ctx.restore();

    // Hover-Kante
    if (opts.hoverEdge) {
        ctx.save();
        ctx.strokeStyle = 'rgba(230, 197, 106, 0.9)';
        ctx.lineWidth = Math.max(2, unit * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px(opts.hoverEdge.a[0]), py(opts.hoverEdge.a[1]));
        ctx.lineTo(px(opts.hoverEdge.b[0]), py(opts.hoverEdge.b[1]));
        ctx.stroke();
        ctx.restore();
    }
    // Linienzug-Start-Punkt
    if (opts.wallChainStart) {
        ctx.save();
        ctx.fillStyle = '#e6c56a';
        ctx.beginPath();
        ctx.arc(px(opts.wallChainStart[0]), py(opts.wallChainStart[1]), Math.max(3, unit * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // --- Objekt-Layer 'above' (default) ---
    for (const o of doc.objects) {
        const layer = o.layer || 'above';
        if (layer !== 'above') continue;
        drawObject(ctx, o, px, py, unit, sel.has(o.id), opts.objectImageCache);
    }

    // --- Labels ---
    for (const l of doc.labels) {
        ctx.save();
        const fs = (l.size || 14) * t.scale;
        ctx.font = `bold ${fs}px "Cinzel", "Georgia", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3 * t.scale;
        ctx.strokeText(l.text, px(l.x), py(l.y));
        ctx.fillStyle = '#f1dca2';
        ctx.fillText(l.text, px(l.x), py(l.y));
        ctx.restore();
        if (opts.selectedLabelId === l.id) {
            const w = ctx.measureText(l.text).width;
            ctx.save();
            ctx.strokeStyle = '#e6c56a';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(px(l.x) - w / 2 - 4, py(l.y) - 10 * t.scale - 4, w + 8, 20 * t.scale + 8);
            ctx.restore();
        }
    }

    // --- Rechteck-Auswahl ---
    if (opts.selectRect) {
        const { x0, y0, x1, y1 } = opts.selectRect;
        ctx.save();
        ctx.strokeStyle = '#e6c56a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        const rx = Math.min(px(x0), px(x1));
        const ry = Math.min(py(y0), py(y1));
        const rw = Math.abs(px(x1) - px(x0));
        const rh = Math.abs(py(y1) - py(y0));
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = 'rgba(230, 197, 106, 0.08)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
    }

    // --- Rahmen ---
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(px(0) + 0.5, py(0) + 0.5, doc.width * unit, doc.height * unit);
    ctx.restore();
}

function drawObject(
    ctx: CanvasRenderingContext2D,
    o: StampObject,
    px: (v: number) => number,
    py: (v: number) => number,
    unit: number,
    selected: boolean,
    imageCache?: Map<string, HTMLImageElement>
): void {
    const sx = (o.sizeX || 1) * (o.scale || 1);
    const sy = (o.sizeY || 1) * (o.scale || 1);
    ctx.save();
    ctx.translate(px(o.x), py(o.y));
    ctx.rotate(o.rot || 0);
    const flipX = o.flipX ? -1 : 1;
    const flipY = o.flipY ? -1 : 1;
    const su = unit * 1.25;
    ctx.scale(sx * flipX * su, sy * flipY * su);
    try {
        if (o.type.startsWith('asset:') && o.assetUrl && imageCache) {
            const img = imageCache.get(o.assetUrl);
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, -0.5, -0.5, 1, 1);
            } else {
                // Fallback-Rahmen bis Bild geladen
                ctx.strokeStyle = '#8a6238';
                ctx.lineWidth = 0.03;
                ctx.strokeRect(-0.45, -0.45, 0.9, 0.9);
                ctx.fillStyle = '#e6c56a';
                ctx.font = '0.1px sans-serif';
                ctx.fillText('…', -0.05, 0.04);
            }
        } else {
            const stamp = STAMP_INDEX[o.type];
            if (stamp) stamp.draw(ctx);
        }
    } catch {}
    ctx.restore();
    if (selected) {
        ctx.save();
        ctx.strokeStyle = '#e6c56a';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        const w = unit * 1.04 * sx;
        const h = unit * 1.04 * sy;
        ctx.strokeRect(px(o.x) - w / 2, py(o.y) - h / 2, w, h);
        ctx.restore();
    }
}

function drawPath(
    ctx: CanvasRenderingContext2D,
    p: MapPath,
    px: (v: number) => number,
    py: (v: number) => number,
    unit: number,
    selected: boolean
): void {
    if (p.points.length < 2) return;
    const mat = FLOOR_MATERIALS[p.material] || FLOOR_MATERIALS[0];
    ctx.save();
    // Unterrand (dunkler Schatten) fuer Tiefe
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(2, unit * p.width + 2);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    p.points.forEach(([x, y], i) => i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)));
    ctx.stroke();

    // Hauptfarbe
    if (p.kind === 'river') {
        ctx.strokeStyle = '#2a4a6d';
    } else if (p.kind === 'bridge-wood') {
        ctx.strokeStyle = '#6b4525';
    } else if (p.kind === 'bridge-stone') {
        ctx.strokeStyle = '#8a877f';
    } else {
        ctx.strokeStyle = mat.base;
    }
    ctx.lineWidth = Math.max(1, unit * p.width);
    ctx.beginPath();
    p.points.forEach(([x, y], i) => i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)));
    ctx.stroke();

    // Textur: Flussmitte heller, Weg Flecken
    if (p.kind === 'river') {
        ctx.strokeStyle = 'rgba(100,150,200,0.4)';
        ctx.lineWidth = Math.max(1, unit * p.width * 0.4);
        ctx.beginPath();
        p.points.forEach(([x, y], i) => i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)));
        ctx.stroke();
    } else if (p.kind === 'road') {
        ctx.strokeStyle = mat.tint;
        ctx.lineWidth = Math.max(1, unit * p.width * 0.5);
        ctx.setLineDash([unit * 0.4, unit * 0.3]);
        ctx.beginPath();
        p.points.forEach(([x, y], i) => i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)));
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (p.kind === 'bridge-wood' || p.kind === 'bridge-stone') {
        // Planken quer zum Pfad
        ctx.strokeStyle = p.kind === 'bridge-wood' ? '#3a2515' : '#55504a';
        ctx.lineWidth = Math.max(1, unit * 0.04);
        for (let k = 0; k < p.points.length - 1; k++) {
            const [x1, y1] = p.points[k];
            const [x2, y2] = p.points[k + 1];
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) continue;
            const nx = -dy / len, ny = dx / len;
            const step = 0.25;
            for (let t = 0; t <= len; t += step) {
                const cx = x1 + (dx / len) * t;
                const cy = y1 + (dy / len) * t;
                ctx.beginPath();
                ctx.moveTo(px(cx - nx * p.width / 2), py(cy - ny * p.width / 2));
                ctx.lineTo(px(cx + nx * p.width / 2), py(cy + ny * p.width / 2));
                ctx.stroke();
            }
        }
    }
    if (selected) {
        ctx.strokeStyle = '#e6c56a';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        p.points.forEach(([x, y], i) => i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)));
        ctx.stroke();
        ctx.setLineDash([]);
        for (const [x, y] of p.points) {
            ctx.beginPath();
            ctx.arc(px(x), py(y), Math.max(3, unit * 0.1), 0, Math.PI * 2);
            ctx.fillStyle = '#e6c56a';
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawShorelines(
    ctx: CanvasRenderingContext2D,
    doc: EditorDoc,
    px: (v: number) => number,
    py: (v: number) => number,
    unit: number
): void {
    // Wenn Wasser-Material an ein Nicht-Wasser-Material grenzt: an der
    // Grenze einen schmalen sandfarbenen Streifen auf der Wasser-Seite ziehen.
    const isWater = (c: number, r: number) => {
        if (c < 0 || c >= doc.width || r < 0 || r >= doc.height) return false;
        const mi = doc.floor[r * doc.width + c] || 0;
        return !!FLOOR_MATERIALS[mi]?.isWater;
    };
    ctx.save();
    ctx.lineWidth = Math.max(2, unit * 0.1);
    for (let r = 0; r < doc.height; r++) {
        for (let c = 0; c < doc.width; c++) {
            if (!isWater(c, r)) continue;
            const shore = FLOOR_MATERIALS[doc.floor[r * doc.width + c]].shoreline || '#b59968';
            ctx.strokeStyle = shore;
            // Oben
            if (!isWater(c, r - 1)) {
                ctx.beginPath(); ctx.moveTo(px(c), py(r)); ctx.lineTo(px(c + 1), py(r)); ctx.stroke();
            }
            if (!isWater(c, r + 1)) {
                ctx.beginPath(); ctx.moveTo(px(c), py(r + 1)); ctx.lineTo(px(c + 1), py(r + 1)); ctx.stroke();
            }
            if (!isWater(c - 1, r)) {
                ctx.beginPath(); ctx.moveTo(px(c), py(r)); ctx.lineTo(px(c), py(r + 1)); ctx.stroke();
            }
            if (!isWater(c + 1, r)) {
                ctx.beginPath(); ctx.moveTo(px(c + 1), py(r)); ctx.lineTo(px(c + 1), py(r + 1)); ctx.stroke();
            }
        }
    }
    ctx.restore();
}

function drawWall(
    ctx: CanvasRenderingContext2D,
    w: Wall,
    px: (v: number) => number,
    py: (v: number) => number,
    unit: number
): void {
    const x1 = px(w.a[0]), y1 = py(w.a[1]);
    const x2 = px(w.b[0]), y2 = py(w.b[1]);
    if (w.kind === 'door') {
        ctx.strokeStyle = '#8a6238';
        ctx.lineWidth = Math.max(2, unit * 0.22);
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = '#2a1a0d';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#e6c56a';
        ctx.beginPath(); ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, Math.max(2, unit * 0.06), 0, Math.PI * 2); ctx.fill();
    } else if (w.kind === 'window') {
        // Hintergrund (Wand-Rest)
        ctx.strokeStyle = '#1b1812';
        ctx.lineWidth = Math.max(2, unit * 0.18);
        ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        // Fensterscheibe
        ctx.strokeStyle = '#a9d9ef';
        ctx.lineWidth = Math.max(2, unit * 0.1);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        ctx.beginPath();
        ctx.moveTo(mx - dx * 0.3, my - dy * 0.3);
        ctx.lineTo(mx + dx * 0.3, my + dy * 0.3);
        ctx.stroke();
    } else {
        const style = w.style || 'stone';
        ctx.strokeStyle = style === 'wood' ? '#3a2515' : '#1b1812';
        ctx.lineWidth = Math.max(2, unit * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (style === 'wood' && unit > 20) {
            // Maserung
            ctx.strokeStyle = '#6b4525';
            ctx.lineWidth = Math.max(1, unit * 0.04);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
    }
}

function drawPattern(
    ctx: CanvasRenderingContext2D,
    pattern: 'dots' | 'cracks' | 'planks' | 'ripple' | 'tuft' | 'noise' | 'none',
    tint: string,
    x: number,
    y: number,
    unit: number,
    seed: number
): void {
    ctx.save();
    ctx.fillStyle = tint;
    ctx.strokeStyle = tint;
    switch (pattern) {
        case 'dots': {
            for (let i = 0; i < 3; i++) {
                const r = (seed * 9301 + i * 49297) % 233280;
                const rx = x + ((r * 7) % 100) / 100 * unit;
                const ry = y + ((r * 13) % 100) / 100 * unit;
                ctx.beginPath(); ctx.arc(rx, ry, Math.max(1, unit * 0.04), 0, Math.PI * 2); ctx.fill();
            }
            break;
        }
        case 'cracks': {
            ctx.lineWidth = 1;
            ctx.beginPath();
            const r = (seed * 1103515245) % 97;
            ctx.moveTo(x + unit * 0.2, y + unit * (0.2 + (r % 10) / 50));
            ctx.lineTo(x + unit * 0.8, y + unit * (0.6 + (r % 7) / 70));
            ctx.stroke();
            break;
        }
        case 'planks': {
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y + unit / 3);
            ctx.lineTo(x + unit, y + unit / 3);
            ctx.moveTo(x, y + (2 * unit) / 3);
            ctx.lineTo(x + unit, y + (2 * unit) / 3);
            ctx.stroke();
            break;
        }
        case 'ripple': {
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + unit * 0.1, y + unit * 0.3);
            ctx.quadraticCurveTo(x + unit * 0.5, y + unit * 0.22, x + unit * 0.9, y + unit * 0.3);
            ctx.moveTo(x + unit * 0.1, y + unit * 0.6);
            ctx.quadraticCurveTo(x + unit * 0.5, y + unit * 0.52, x + unit * 0.9, y + unit * 0.6);
            ctx.stroke();
            break;
        }
        case 'tuft': {
            // kleine Grasbuendel: 2 Striche pro Seed
            ctx.strokeStyle = tint;
            ctx.lineWidth = 1.2;
            for (let i = 0; i < 2; i++) {
                const r = (seed * 1664525 + i * 1013904223) >>> 0;
                const rx = x + ((r % 100) / 100) * unit;
                const ry = y + (((r >> 7) % 100) / 100) * unit;
                ctx.beginPath();
                ctx.moveTo(rx, ry + 2);
                ctx.lineTo(rx + 1, ry - 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(rx + 2, ry + 2);
                ctx.lineTo(rx + 2, ry - 1);
                ctx.stroke();
            }
            break;
        }
        case 'noise': {
            // feine Punkte im Material
            ctx.fillStyle = tint;
            for (let i = 0; i < 5; i++) {
                const r = (seed * 2246822519 + i * 374761393) >>> 0;
                const rx = x + ((r % 100) / 100) * unit;
                const ry = y + (((r >> 5) % 100) / 100) * unit;
                ctx.fillRect(rx, ry, 1, 1);
            }
            break;
        }
    }
    ctx.restore();
}

export function clientToWorld(
    canvas: HTMLCanvasElement,
    t: Transform,
    clientX: number,
    clientY: number
): { wx: number; wy: number } {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    return {
        wx: (cx - t.x) / (t.tilePx * t.scale),
        wy: (cy - t.y) / (t.tilePx * t.scale),
    };
}
