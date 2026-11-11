// Canvas-Renderer fuer ein EditorDoc. Reiner Zeichen-Code, keine Interaktion.
// Zoom/Pan uebergibt der Caller als Transform. Die Editor- und Spielbrett-UI
// bauen beide auf dieser einen Funktion auf.

import { EditorDoc, Wall } from './engine';
import { FLOOR_MATERIALS, OBJECT_STAMPS, StampDef } from './palette';

export interface Transform {
    x: number;     // Pan in px
    y: number;
    scale: number; // 1 = tilePx Pixel pro Feld
    tilePx: number; // Basisgroesse eines Feldes in px bei scale=1 (z.B. 32)
}

export interface RenderOptions {
    showGrid?: boolean;
    showEdges?: boolean; // Markierung aller Wand-Kandidaten (fuer Debug)
    hoverCells?: Array<[number, number]>;
    hoverEdge?: { a: [number, number]; b: [number, number] } | null;
    selectedObjectId?: string | null;
    selectedLabelId?: string | null;
    paper?: boolean; // Pergamenthintergrund rings um die Karte
}

// Baut einen Index: StampKey -> Draw-Funktion. Haeufig gerufen -> cachen.
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

    // Hintergrund (Pergament-Look)
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#120a05');
    bg.addColorStop(1, '#1b120a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Boden
    for (let r = 0; r < doc.height; r++) {
        for (let c = 0; c < doc.width; c++) {
            const mi = doc.floor[r * doc.width + c] || 0;
            const mat = FLOOR_MATERIALS[mi] || FLOOR_MATERIALS[0];
            const x = px(c), y = py(r);
            ctx.fillStyle = mat.base;
            ctx.fillRect(x, y, unit + 0.5, unit + 0.5);
            // Mini-Muster, nur wenn Zoom gross genug — sonst Performance killt.
            if (unit >= 14 && mat.pattern) drawPattern(ctx, mat.pattern, mat.tint, x, y, unit, c + r * 13);
        }
    }

    // Grid
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

    // Hover-Zellen (Pinsel-Preview)
    if (opts.hoverCells && opts.hoverCells.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(230, 197, 106, 0.3)';
        for (const [c, r] of opts.hoverCells) {
            ctx.fillRect(px(c), py(r), unit, unit);
        }
        ctx.strokeStyle = 'rgba(230, 197, 106, 0.8)';
        ctx.lineWidth = 2;
        for (const [c, r] of opts.hoverCells) {
            ctx.strokeRect(px(c) + 1, py(r) + 1, unit - 2, unit - 2);
        }
        ctx.restore();
    }

    // Waende
    ctx.save();
    for (const w of doc.walls) {
        drawWall(ctx, w, px, py, unit);
    }
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

    // Objekte
    for (const o of doc.objects) {
        const stamp = STAMP_INDEX[o.type];
        if (!stamp) continue;
        ctx.save();
        ctx.translate(px(o.x), py(o.y));
        ctx.rotate(o.rot || 0);
        const s = (o.scale || 1) * unit;
        ctx.scale(s, s);
        try {
            stamp.draw(ctx);
        } catch (e) {
            // defensive: kaputte Stempel killen den ganzen Render sonst
        }
        ctx.restore();
        if (opts.selectedObjectId === o.id) {
            ctx.save();
            ctx.strokeStyle = '#e6c56a';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(px(o.x) - unit * 0.42, py(o.y) - unit * 0.42, unit * 0.84, unit * 0.84);
            ctx.restore();
        }
    }

    // Labels
    for (const l of doc.labels) {
        ctx.save();
        const fs = (l.size || 14) * t.scale;
        ctx.font = `bold ${fs}px "Cinzel", "Georgia", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        // Umriss fuer Lesbarkeit
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

    // Rahmen um die Karte
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(px(0) + 0.5, py(0) + 0.5, doc.width * unit, doc.height * unit);
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
        // Tuer: schmaler Streifen + Markierung
        ctx.strokeStyle = '#8a6238';
        ctx.lineWidth = Math.max(2, unit * 0.22);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Rahmen
        ctx.strokeStyle = '#2a1a0d';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Klinke-Markierung in der Mitte
        ctx.fillStyle = '#e6c56a';
        ctx.beginPath();
        ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, Math.max(2, unit * 0.06), 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.strokeStyle = '#1b1812';
        ctx.lineWidth = Math.max(2, unit * 0.18);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
}

function drawPattern(
    ctx: CanvasRenderingContext2D,
    pattern: 'dots' | 'cracks' | 'planks' | 'ripple' | 'none',
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
            // 3 kleine Punkte, Position pseudo-random aus seed
            for (let i = 0; i < 3; i++) {
                const r = (seed * 9301 + i * 49297) % 233280;
                const rx = x + ((r * 7) % 100) / 100 * unit;
                const ry = y + ((r * 13) % 100) / 100 * unit;
                ctx.beginPath();
                ctx.arc(rx, ry, Math.max(1, unit * 0.04), 0, Math.PI * 2);
                ctx.fill();
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
    }
    ctx.restore();
}

// Hilfsfunktion: Client-Koordinate -> Welt-Koordinate (Feldeinheiten)
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
