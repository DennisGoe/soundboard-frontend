// Materialien und Objekt-Stempel fuer den 2D-Editor.
// Alle Farben prozedural als Canvas gemalt — KEIN Hotlinking auf Fremdbilder.
// Reihenfolge im Array = Index im floor[]-Array des Docs.

export interface FloorMaterial {
    key: string;
    name: string;
    base: string;    // Hex, Hauptfarbe
    tint: string;    // leichte Variante fuer Punkte/Muster
    pattern?: 'dots' | 'cracks' | 'planks' | 'ripple' | 'none';
}

export const FLOOR_MATERIALS: FloorMaterial[] = [
    { key: 'grass', name: 'Gras', base: '#4a6b2d', tint: '#5f8440', pattern: 'dots' },
    { key: 'stone', name: 'Stein', base: '#7d7a72', tint: '#9e9b92', pattern: 'cracks' },
    { key: 'wood', name: 'Holzboden', base: '#6b4a2a', tint: '#8a6238', pattern: 'planks' },
    { key: 'dirt', name: 'Erde', base: '#5a3c22', tint: '#704c30', pattern: 'dots' },
    { key: 'water', name: 'Wasser', base: '#2a4a6d', tint: '#3d6a94', pattern: 'ripple' },
    { key: 'sand', name: 'Sand', base: '#c2a76d', tint: '#d4bd84', pattern: 'dots' },
    { key: 'lava', name: 'Lava', base: '#8a1a0a', tint: '#d94a18', pattern: 'cracks' },
    { key: 'dark', name: 'Dunkel/Fels', base: '#1b1812', tint: '#2d2820', pattern: 'cracks' },
];

export interface StampDef {
    key: string;
    name: string;
    // Draw sich selbst in ein 1x1-Feld, Mittelpunkt (0,0), Groesse ~1 Einheit.
    // ctx hat den Scale bereits (1 Einheit = tilePx).
    draw: (ctx: CanvasRenderingContext2D) => void;
}

// Kleine Helfer, damit die Stempel knapp bleiben.
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, stroke?: string) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.04;
        ctx.stroke();
    }
}
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, stroke?: string) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.04;
        ctx.strokeRect(x, y, w, h);
    }
}

export const OBJECT_STAMPS: StampDef[] = [
    {
        key: 'tree', name: 'Baum',
        draw: (ctx) => {
            // Krone (3 Kreise), Stamm klein unten
            circle(ctx, -0.1, -0.1, 0.35, '#2d4a1e', '#15280d');
            circle(ctx, 0.15, -0.05, 0.3, '#3a5a26', '#15280d');
            circle(ctx, 0.0, 0.1, 0.32, '#365424', '#15280d');
            rect(ctx, -0.07, 0.25, 0.14, 0.18, '#3a2515', '#1a0e05');
        },
    },
    {
        key: 'rock', name: 'Fels',
        draw: (ctx) => {
            ctx.beginPath();
            ctx.moveTo(-0.35, 0.2);
            ctx.lineTo(-0.2, -0.3);
            ctx.lineTo(0.1, -0.35);
            ctx.lineTo(0.35, -0.05);
            ctx.lineTo(0.3, 0.25);
            ctx.lineTo(-0.1, 0.35);
            ctx.closePath();
            ctx.fillStyle = '#787068';
            ctx.strokeStyle = '#3d382f';
            ctx.lineWidth = 0.05;
            ctx.fill();
            ctx.stroke();
            // Hoehenlinie
            ctx.beginPath();
            ctx.moveTo(-0.15, -0.2);
            ctx.lineTo(0.15, -0.1);
            ctx.strokeStyle = '#555049';
            ctx.lineWidth = 0.04;
            ctx.stroke();
        },
    },
    {
        key: 'table', name: 'Tisch',
        draw: (ctx) => {
            rect(ctx, -0.35, -0.22, 0.7, 0.44, '#7a4e26', '#2a1a0d');
            // Maserung
            ctx.strokeStyle = '#3a2512';
            ctx.lineWidth = 0.03;
            ctx.beginPath();
            ctx.moveTo(-0.3, 0); ctx.lineTo(0.3, 0);
            ctx.stroke();
        },
    },
    {
        key: 'chair', name: 'Stuhl',
        draw: (ctx) => {
            rect(ctx, -0.2, -0.2, 0.4, 0.4, '#6b4525', '#231509');
            rect(ctx, -0.2, -0.3, 0.4, 0.08, '#4a2e15', '#231509'); // Rueckenlehne
        },
    },
    {
        key: 'chest', name: 'Truhe',
        draw: (ctx) => {
            rect(ctx, -0.3, -0.18, 0.6, 0.36, '#704a22', '#2a1a0d');
            // Beschlag
            rect(ctx, -0.3, -0.03, 0.6, 0.05, '#2a1a0d');
            circle(ctx, 0, 0, 0.05, '#e6c56a', '#2a1a0d');
        },
    },
    {
        key: 'barrel', name: 'Fass',
        draw: (ctx) => {
            circle(ctx, 0, 0, 0.3, '#5a3818', '#1f0f05');
            ctx.strokeStyle = '#2a1a0d';
            ctx.lineWidth = 0.04;
            ctx.beginPath();
            ctx.arc(0, 0, 0.3, Math.PI * 0.2, Math.PI * 0.8);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 0.3, Math.PI * 1.2, Math.PI * 1.8);
            ctx.stroke();
        },
    },
    {
        key: 'bed', name: 'Bett',
        draw: (ctx) => {
            rect(ctx, -0.3, -0.4, 0.6, 0.8, '#6d2a2a', '#2a0d0d');
            rect(ctx, -0.26, -0.36, 0.52, 0.2, '#e8d6a4', '#2a0d0d'); // Kopfkissen
        },
    },
    {
        key: 'stairs', name: 'Treppe',
        draw: (ctx) => {
            rect(ctx, -0.4, -0.3, 0.8, 0.6, '#6a6a68', '#232320');
            ctx.strokeStyle = '#2a2a28';
            ctx.lineWidth = 0.05;
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(-0.4, i * 0.1);
                ctx.lineTo(0.4, i * 0.1);
                ctx.stroke();
            }
        },
    },
    {
        key: 'firepit', name: 'Feuerstelle',
        draw: (ctx) => {
            circle(ctx, 0, 0, 0.35, '#2a1a0d', '#000');
            circle(ctx, 0, 0.05, 0.22, '#d94a18');
            circle(ctx, 0, 0.1, 0.13, '#f6c044');
            // ein paar Steine
            ctx.fillStyle = '#5e5852';
            ctx.beginPath(); ctx.arc(-0.33, 0, 0.08, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(0.33, 0, 0.08, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(0, -0.33, 0.08, 0, Math.PI * 2); ctx.fill();
        },
    },
    {
        key: 'door', name: 'Tuer-Stempel',
        draw: (ctx) => {
            rect(ctx, -0.35, -0.12, 0.7, 0.24, '#7a4a22', '#1f0f05');
            circle(ctx, 0.22, 0, 0.04, '#e6c56a');
        },
    },
    {
        key: 'skull', name: 'Schaedel',
        draw: (ctx) => {
            circle(ctx, 0, -0.03, 0.22, '#e8dfc6', '#1a1510');
            rect(ctx, -0.08, 0.15, 0.16, 0.08, '#e8dfc6', '#1a1510');
            circle(ctx, -0.08, -0.05, 0.05, '#1a1510');
            circle(ctx, 0.08, -0.05, 0.05, '#1a1510');
        },
    },
    {
        key: 'bookshelf', name: 'Buecherregal',
        draw: (ctx) => {
            rect(ctx, -0.35, -0.3, 0.7, 0.6, '#4a2e15', '#1a0e05');
            // Buecher
            const colors = ['#9b2a1e', '#2a4a6d', '#3d4a2a', '#6d5a2a', '#5a3a2a'];
            for (let i = 0; i < 5; i++) {
                rect(ctx, -0.3, -0.26 + i * 0.12, 0.6, 0.08, colors[i % colors.length], '#1a0e05');
            }
        },
    },
];

export function floorIndex(key: string): number {
    const idx = FLOOR_MATERIALS.findIndex((m) => m.key === key);
    return idx < 0 ? 0 : idx;
}

export function stampByKey(key: string): StampDef | null {
    return OBJECT_STAMPS.find((s) => s.key === key) || null;
}
