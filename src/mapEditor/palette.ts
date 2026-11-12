// Materialien und Objekt-Stempel fuer den 2D-Editor.
// Alle Grafiken prozedural ueber Canvas gemalt — KEINE Fremdbilder,
// KEIN Hotlinking. Lizenz: eigene Zeichnungen, CC0 (siehe CREDITS.md).
//
// Objekt-Konvention:
//   draw(ctx, state) zeichnet in ein 1x1-Kaestchen, Mittelpunkt = (0,0),
//   Ausdehnung ~ [-0.5..+0.5]. "Grosse" Stempel (Haeuser, Burgen) setzen
//   defaultSize = {x,y} > 1; der Renderer skaliert dann entsprechend.

export interface FloorMaterial {
    key: string;
    name: string;
    base: string;
    tint: string;
    pattern?: 'dots' | 'cracks' | 'planks' | 'ripple' | 'tuft' | 'noise' | 'none';
    shoreline?: string;  // Hex-Farbe fuer Uferkante (wenn gegen Erde/Gras angrenzend)
    isWater?: boolean;
}

export const FLOOR_MATERIALS: FloorMaterial[] = [
    { key: 'grass',     name: 'Gras',     base: '#4a6b2d', tint: '#5f8440', pattern: 'tuft' },
    { key: 'stone',     name: 'Stein',    base: '#7d7a72', tint: '#9e9b92', pattern: 'cracks' },
    { key: 'wood',      name: 'Holzboden',base: '#6b4a2a', tint: '#8a6238', pattern: 'planks' },
    { key: 'dirt',      name: 'Erde',     base: '#5a3c22', tint: '#704c30', pattern: 'dots' },
    { key: 'water',     name: 'Wasser',   base: '#2a4a6d', tint: '#3d6a94', pattern: 'ripple', isWater: true, shoreline: '#b59968' },
    { key: 'sand',      name: 'Sand',     base: '#c2a76d', tint: '#d4bd84', pattern: 'dots' },
    { key: 'lava',      name: 'Lava',     base: '#8a1a0a', tint: '#d94a18', pattern: 'cracks' },
    { key: 'dark',      name: 'Dunkel/Fels', base: '#1b1812', tint: '#2d2820', pattern: 'cracks' },
    { key: 'snow',      name: 'Schnee',   base: '#dfe5ec', tint: '#f3f6fa', pattern: 'noise' },
    { key: 'marble',    name: 'Marmor',   base: '#c7c1b3', tint: '#e5dfd0', pattern: 'cracks' },
    { key: 'cobble',    name: 'Pflastersteine', base: '#5a564f', tint: '#726d64', pattern: 'cracks' },
    { key: 'swamp',     name: 'Sumpf',    base: '#3b4524', tint: '#5a6a37', pattern: 'ripple' },
    { key: 'carpet',    name: 'Teppich',  base: '#722a1e', tint: '#9b3a2c', pattern: 'noise' },
    { key: 'tiles',     name: 'Fliesen',  base: '#4f5c6a', tint: '#6a7988', pattern: 'planks' },
];

// Katalog-Kategorien
export type Category =
    | 'natur'
    | 'moebel'
    | 'dungeon'
    | 'gebaeude'
    | 'wege'
    | 'bruecken'
    | 'lager'
    | 'wasser'
    | 'licht'
    | 'effekte'
    | 'eigene';

export const CATEGORY_LABEL: Record<Category, string> = {
    natur: 'Natur',
    moebel: 'Möbel & Innen',
    dungeon: 'Dungeon',
    gebaeude: 'Gebäude',
    wege: 'Straßen & Wege',
    bruecken: 'Brücken',
    lager: 'Zelte & Lager',
    wasser: 'Boote & Wasser',
    licht: 'Licht',
    effekte: 'Effekte',
    eigene: 'Meine Assets',
};

export interface StampDef {
    key: string;
    name: string;
    category: Category;
    tags?: string[];
    defaultSize?: { x: number; y: number };  // Grid-Felder (default {1,1})
    emitsLight?: { bright: number; dim: number; color?: string };
    draw: (ctx: CanvasRenderingContext2D) => void;
}

// ---------- Helfer ----------
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, stroke?: string, strokeW = 0.04) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
    }
}
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, stroke?: string, strokeW = 0.04) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.strokeRect(x, y, w, h);
    }
}
function poly(ctx: CanvasRenderingContext2D, pts: number[][], color: string, stroke?: string, strokeW = 0.04) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeW;
        ctx.stroke();
    }
}
function triTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.9, cy + r);
    ctx.lineTo(cx - r * 0.9, cy + r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

// ---------- NATUR (30+) ----------
const NATUR: StampDef[] = [
    { key: 'tree', name: 'Laubbaum', category: 'natur', tags: ['baum','wald','natur','laub'],
      draw: (ctx) => {
        circle(ctx, -0.12, -0.08, 0.32, '#2d4a1e', '#15280d');
        circle(ctx, 0.15, -0.02, 0.28, '#3a5a26', '#15280d');
        circle(ctx, 0.0, 0.14, 0.3, '#365424', '#15280d');
        rect(ctx, -0.07, 0.3, 0.14, 0.18, '#3a2515', '#1a0e05');
    }},
    { key: 'tree-oak', name: 'Eiche', category: 'natur', tags: ['baum','eiche','wald'], defaultSize: {x:1.4, y:1.4},
      draw: (ctx) => {
        circle(ctx, -0.18, -0.12, 0.3, '#365d22', '#15280d');
        circle(ctx, 0.2, -0.1, 0.3, '#3f6a28', '#15280d');
        circle(ctx, 0.0, 0.1, 0.35, '#2d4a1e', '#15280d');
        circle(ctx, -0.05, -0.25, 0.22, '#4a7a30', '#15280d');
        rect(ctx, -0.1, 0.32, 0.2, 0.18, '#3a2515', '#1a0e05');
    }},
    { key: 'tree-pine', name: 'Nadelbaum', category: 'natur', tags: ['baum','tanne','wald','nadel'],
      draw: (ctx) => {
        triTree(ctx, 0, -0.1, 0.4, '#1f3a14');
        triTree(ctx, 0, -0.26, 0.28, '#2d4a1e');
        triTree(ctx, 0, -0.38, 0.18, '#365424');
        rect(ctx, -0.05, 0.3, 0.1, 0.18, '#3a2515');
    }},
    { key: 'tree-dead', name: 'Toter Baum', category: 'natur', tags: ['baum','tot','spuk'],
      draw: (ctx) => {
        ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 0.08; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(0, 0.4); ctx.lineTo(0, -0.3); ctx.stroke();
        ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(0, -0.1); ctx.lineTo(-0.2, -0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -0.2); ctx.lineTo(0.25, -0.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-0.25, -0.05); ctx.stroke();
    }},
    { key: 'tree-palm', name: 'Palme', category: 'natur', tags: ['baum','palme','insel','sand'],
      draw: (ctx) => {
        ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 0.08;
        ctx.beginPath(); ctx.moveTo(0, 0.4); ctx.quadraticCurveTo(0.05, 0.0, 0.0, -0.2); ctx.stroke();
        ctx.fillStyle = '#4a7a30';
        for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.translate(0, -0.2); ctx.rotate(i * Math.PI / 3);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.2, -0.1, 0.35, 0.05); ctx.quadraticCurveTo(0.2, 0.0, 0, 0); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    }},
    { key: 'tree-cherry', name: 'Kirschbaum', category: 'natur', tags: ['baum','kirsche','blueten'],
      draw: (ctx) => {
        circle(ctx, -0.12, -0.08, 0.3, '#d9a0b8', '#6a2a3a');
        circle(ctx, 0.15, -0.02, 0.28, '#e7b8ca', '#6a2a3a');
        circle(ctx, 0.0, 0.14, 0.28, '#d9a0b8', '#6a2a3a');
        rect(ctx, -0.06, 0.3, 0.12, 0.18, '#3a2515');
    }},
    { key: 'bush', name: 'Busch', category: 'natur', tags: ['busch','gestruepp','natur'],
      draw: (ctx) => {
        circle(ctx, -0.15, 0.05, 0.22, '#365424', '#15280d');
        circle(ctx, 0.1, -0.05, 0.22, '#3a5a26', '#15280d');
        circle(ctx, 0.0, 0.15, 0.2, '#2d4a1e', '#15280d');
    }},
    { key: 'bush-berry', name: 'Beerenbusch', category: 'natur', tags: ['busch','beere'],
      draw: (ctx) => {
        circle(ctx, -0.12, 0.05, 0.22, '#2d4a1e', '#15280d');
        circle(ctx, 0.12, -0.03, 0.2, '#365424', '#15280d');
        circle(ctx, -0.1, -0.05, 0.04, '#a02a2a');
        circle(ctx, 0.08, 0.05, 0.04, '#a02a2a');
        circle(ctx, 0.0, 0.1, 0.04, '#a02a2a');
    }},
    { key: 'rock', name: 'Fels', category: 'natur', tags: ['fels','stein','grau'],
      draw: (ctx) => {
        poly(ctx, [[-0.35,0.2],[-0.2,-0.3],[0.1,-0.35],[0.35,-0.05],[0.3,0.25],[-0.1,0.35]], '#787068', '#3d382f', 0.05);
        ctx.beginPath(); ctx.moveTo(-0.15,-0.2); ctx.lineTo(0.15,-0.1);
        ctx.strokeStyle = '#555049'; ctx.lineWidth = 0.04; ctx.stroke();
    }},
    { key: 'rock-small', name: 'Kleiner Fels', category: 'natur', tags: ['fels','stein'],
      draw: (ctx) => {
        poly(ctx, [[-0.2,0.1],[-0.1,-0.15],[0.08,-0.18],[0.2,-0.02],[0.15,0.15]], '#878079', '#3d382f', 0.04);
    }},
    { key: 'rock-boulder', name: 'Findling', category: 'natur', tags: ['fels','findling','gross'], defaultSize: {x:1.6, y:1.4},
      draw: (ctx) => {
        poly(ctx, [[-0.4,0.25],[-0.3,-0.3],[0.0,-0.4],[0.35,-0.2],[0.4,0.2],[0.0,0.35]], '#6c655c', '#2e2a24', 0.05);
        ctx.strokeStyle = '#55504a'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(-0.15,-0.1); ctx.lineTo(0.2,0.0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0.0,-0.25); ctx.lineTo(0.15,0.2); ctx.stroke();
    }},
    { key: 'rocks-cluster', name: 'Felsengruppe', category: 'natur', tags: ['fels','gruppe'], defaultSize: {x:1.3, y:1.2},
      draw: (ctx) => {
        poly(ctx, [[-0.3,0.2],[-0.2,-0.2],[-0.05,-0.2],[0.05,0.15]], '#787068', '#3d382f');
        poly(ctx, [[0.05,0.25],[0.1,-0.1],[0.3,-0.1],[0.35,0.2]], '#878079', '#3d382f');
    }},
    { key: 'flower-yellow', name: 'Blume (gelb)', category: 'natur', tags: ['blume','natur','deko'],
      draw: (ctx) => {
        for (let i=0;i<5;i++){
            const a = i*Math.PI*2/5;
            circle(ctx, Math.cos(a)*0.12, Math.sin(a)*0.12, 0.08, '#f6c044');
        }
        circle(ctx, 0,0,0.06,'#8a5a1a');
    }},
    { key: 'flower-red', name: 'Blume (rot)', category: 'natur', tags: ['blume','natur'],
      draw: (ctx) => {
        for (let i=0;i<5;i++){
            const a = i*Math.PI*2/5;
            circle(ctx, Math.cos(a)*0.12, Math.sin(a)*0.12, 0.08, '#c24a2a');
        }
        circle(ctx, 0,0,0.06,'#f6c044');
    }},
    { key: 'flower-blue', name: 'Blume (blau)', category: 'natur', tags: ['blume','natur'],
      draw: (ctx) => {
        for (let i=0;i<5;i++){
            const a = i*Math.PI*2/5;
            circle(ctx, Math.cos(a)*0.12, Math.sin(a)*0.12, 0.08, '#4a6b94');
        }
        circle(ctx, 0,0,0.06,'#f6c044');
    }},
    { key: 'mushroom', name: 'Pilz', category: 'natur', tags: ['pilz','wald','fliegenpilz'],
      draw: (ctx) => {
        rect(ctx,-0.06,0,0.12,0.25,'#e8dfc6','#2a1a0d',0.03);
        ctx.beginPath(); ctx.ellipse(0,0,0.2,0.14,0,0,Math.PI*2);
        ctx.fillStyle = '#a02a2a'; ctx.fill();
        ctx.strokeStyle = '#2a1a0d'; ctx.lineWidth = 0.03; ctx.stroke();
        circle(ctx,-0.08,-0.02,0.03,'#e8dfc6');
        circle(ctx,0.07,-0.03,0.03,'#e8dfc6');
    }},
    { key: 'grass-tuft', name: 'Grasbüschel', category: 'natur', tags: ['gras','deko'],
      draw: (ctx) => {
        ctx.strokeStyle = '#4a7a30'; ctx.lineWidth = 0.03; ctx.lineCap='round';
        for (let i=-2;i<=2;i++){
            ctx.beginPath(); ctx.moveTo(i*0.06,0.2); ctx.lineTo(i*0.06+0.04,-0.15); ctx.stroke();
        }
    }},
    { key: 'log', name: 'Baumstamm', category: 'natur', tags: ['holz','stamm','holzstamm'], defaultSize: {x:1.4, y:0.6},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.14,0.84,0.28,'#6b4525','#1a0e05');
        circle(ctx,-0.42,0,0.14,'#8a6238','#1a0e05');
        circle(ctx,0.42,0,0.14,'#8a6238','#1a0e05');
        circle(ctx,0.42,0,0.06,'#5a3818');
    }},
    { key: 'stump', name: 'Baumstumpf', category: 'natur', tags: ['holz','stumpf'],
      draw: (ctx) => {
        circle(ctx,0,0,0.22,'#6b4525','#1a0e05');
        circle(ctx,0,0,0.14,'#8a6238');
        ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 0.02;
        for(let i=0.06;i<0.18;i+=0.04){ ctx.beginPath(); ctx.arc(0,0,i,0,Math.PI*2); ctx.stroke(); }
    }},
    { key: 'hill', name: 'Huegel', category: 'natur', tags: ['huegel','gelaende'], defaultSize: {x:1.6, y:1.2},
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0.05,0.48,0.22,0,0,Math.PI*2);
        ctx.fillStyle = '#5a7a3a'; ctx.fill();
        ctx.strokeStyle = '#35521f'; ctx.lineWidth = 0.04; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0,-0.04,0.28,0.12,0,0,Math.PI*2);
        ctx.fillStyle = '#6a8f44'; ctx.fill();
    }},
    { key: 'cave-entrance', name: 'Höhleneingang', category: 'natur', tags: ['hoehle','eingang','dungeon'], defaultSize: {x:1.4, y:1.0},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.1,0.84,0.4,'#5a504a','#2a2520');
        ctx.beginPath(); ctx.moveTo(-0.3,0.3); ctx.quadraticCurveTo(0, -0.2, 0.3, 0.3); ctx.closePath();
        ctx.fillStyle = '#0a0806'; ctx.fill();
        ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 0.04; ctx.stroke();
    }},
    { key: 'reed', name: 'Schilf', category: 'natur', tags: ['schilf','wasser','ufer'],
      draw: (ctx) => {
        ctx.strokeStyle = '#5a7a30'; ctx.lineWidth = 0.025; ctx.lineCap='round';
        for (let i=-2;i<=2;i++){
            ctx.beginPath(); ctx.moveTo(i*0.07,0.3); ctx.quadraticCurveTo(i*0.07+0.02,0, i*0.07-0.03, -0.3); ctx.stroke();
        }
    }},
    { key: 'cactus', name: 'Kaktus', category: 'natur', tags: ['kaktus','wueste','sand'],
      draw: (ctx) => {
        rect(ctx,-0.08,-0.3,0.16,0.6,'#3a6a2a','#15280d',0.03);
        rect(ctx,-0.22,-0.05,0.14,0.18,'#3a6a2a','#15280d',0.03);
        rect(ctx,0.08,-0.15,0.14,0.2,'#3a6a2a','#15280d',0.03);
    }},
    { key: 'ice-crystal', name: 'Eiskristall', category: 'natur', tags: ['eis','kristall','schnee'],
      draw: (ctx) => {
        poly(ctx,[[0,-0.3],[0.15,-0.05],[0.2,0.2],[0,0.3],[-0.2,0.2],[-0.15,-0.05]],'#a9d9ef','#4a7a9a',0.04);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.1,-0.1); ctx.lineTo(0.08,0.15); ctx.stroke();
    }},
    { key: 'lily-pad', name: 'Seerosenblatt', category: 'natur', tags: ['seerose','wasser','teich'],
      draw: (ctx) => {
        ctx.beginPath(); ctx.arc(0,0,0.22,Math.PI*0.18, Math.PI*1.82);
        ctx.closePath();
        ctx.fillStyle = '#4a7a30'; ctx.fill();
        ctx.strokeStyle = '#2d4a1e'; ctx.lineWidth = 0.03; ctx.stroke();
        circle(ctx,0.1,-0.06,0.05,'#f0c8e0');
    }},
    { key: 'vine', name: 'Ranken', category: 'natur', tags: ['ranke','pflanze','gruen'],
      draw: (ctx) => {
        ctx.strokeStyle = '#2d4a1e'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.3,-0.3); ctx.bezierCurveTo(-0.1,0, 0.1, 0.1, 0.3,0.3); ctx.stroke();
        circle(ctx,-0.2,-0.1,0.06,'#4a7a30');
        circle(ctx,0.0,0.05,0.06,'#4a7a30');
        circle(ctx,0.2,0.2,0.06,'#4a7a30');
    }},
    { key: 'leaves', name: 'Herbstlaub', category: 'natur', tags: ['laub','herbst','blaetter'],
      draw: (ctx) => {
        circle(ctx,-0.12,-0.08,0.05,'#c05a1a');
        circle(ctx, 0.1,-0.05,0.05,'#f6c044');
        circle(ctx,-0.05,0.1,0.05,'#8a3a1a');
        circle(ctx,0.14,0.1,0.05,'#c05a1a');
        circle(ctx,0.0,-0.18,0.05,'#f6c044');
    }},
    { key: 'anthill', name: 'Ameisenhaufen', category: 'natur', tags: ['ameise','erde'],
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0.1,0.25,0.15,0,0,Math.PI*2);
        ctx.fillStyle = '#5a3c22'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0,0.05,0.18,0.1,0,0,Math.PI*2);
        ctx.fillStyle = '#704c30'; ctx.fill();
    }},
    { key: 'puddle', name: 'Pfütze', category: 'natur', tags: ['wasser','pfuetze','regen'],
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0,0.3,0.14,0,0,Math.PI*2);
        ctx.fillStyle = '#3d6a94'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(0,0,0.2,0.08,0,0,Math.PI*2);
        ctx.fillStyle = '#5a89b4'; ctx.fill();
    }},
    { key: 'crops', name: 'Getreidefeld', category: 'natur', tags: ['feld','getreide','acker'], defaultSize: {x:1,y:1},
      draw: (ctx) => {
        rect(ctx,-0.4,-0.4,0.8,0.8,'#8a7a3a','#4a3a1a');
        ctx.strokeStyle = '#c2a76d'; ctx.lineWidth = 0.02;
        for (let i=-3;i<=3;i++){
            ctx.beginPath(); ctx.moveTo(i*0.1, -0.35); ctx.lineTo(i*0.1, 0.35); ctx.stroke();
        }
    }},
];

// ---------- MOEBEL & INNEN (25+) ----------
const MOEBEL: StampDef[] = [
    { key: 'table', name: 'Tisch', category: 'moebel', tags: ['tisch','moebel'],
      draw: (ctx) => {
        rect(ctx,-0.35,-0.22,0.7,0.44,'#7a4e26','#2a1a0d');
        ctx.strokeStyle = '#3a2512'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.3,0); ctx.lineTo(0.3,0); ctx.stroke();
    }},
    { key: 'table-round', name: 'Runder Tisch', category: 'moebel', tags: ['tisch','rund'],
      draw: (ctx) => {
        circle(ctx,0,0,0.3,'#7a4e26','#2a1a0d');
        circle(ctx,0,0,0.08,'#5a3818');
    }},
    { key: 'table-long', name: 'Langer Tisch', category: 'moebel', tags: ['tisch','lang','halle'], defaultSize: {x:2, y:0.8},
      draw: (ctx) => {
        rect(ctx,-0.46,-0.18,0.92,0.36,'#7a4e26','#2a1a0d');
        ctx.strokeStyle = '#3a2512'; ctx.lineWidth = 0.025;
        for(let x=-0.35;x<0.4;x+=0.1){ ctx.beginPath(); ctx.moveTo(x,-0.15); ctx.lineTo(x,0.15); ctx.stroke(); }
    }},
    { key: 'chair', name: 'Stuhl', category: 'moebel', tags: ['stuhl','moebel'],
      draw: (ctx) => {
        rect(ctx,-0.2,-0.2,0.4,0.4,'#6b4525','#231509');
        rect(ctx,-0.2,-0.3,0.4,0.08,'#4a2e15','#231509');
    }},
    { key: 'bench', name: 'Bank', category: 'moebel', tags: ['bank','moebel'], defaultSize: {x:1.4, y:0.6},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.1,0.84,0.18,'#6b4525','#231509');
        rect(ctx,-0.4,0.08,0.05,0.14,'#4a2e15');
        rect(ctx,0.35,0.08,0.05,0.14,'#4a2e15');
    }},
    { key: 'bed', name: 'Bett', category: 'moebel', tags: ['bett','schlafen'], defaultSize: {x:1, y:1.4},
      draw: (ctx) => {
        rect(ctx,-0.3,-0.5,0.6,1.0,'#6d2a2a','#2a0d0d');
        rect(ctx,-0.26,-0.46,0.52,0.2,'#e8d6a4','#2a0d0d');
    }},
    { key: 'bed-double', name: 'Doppelbett', category: 'moebel', tags: ['bett','doppelbett'], defaultSize: {x:1.6, y:1.6},
      draw: (ctx) => {
        rect(ctx,-0.5,-0.55,1.0,1.1,'#5a2a2a','#2a0d0d');
        rect(ctx,-0.46,-0.52,0.46,0.22,'#e8d6a4','#2a0d0d');
        rect(ctx,0.0,-0.52,0.46,0.22,'#e8d6a4','#2a0d0d');
    }},
    { key: 'chest', name: 'Truhe', category: 'moebel', tags: ['truhe','schatz','kiste'],
      draw: (ctx) => {
        rect(ctx,-0.3,-0.18,0.6,0.36,'#704a22','#2a1a0d');
        rect(ctx,-0.3,-0.03,0.6,0.05,'#2a1a0d');
        circle(ctx,0,0,0.05,'#e6c56a','#2a1a0d');
    }},
    { key: 'chest-gold', name: 'Schatztruhe', category: 'moebel', tags: ['truhe','gold','schatz'],
      draw: (ctx) => {
        rect(ctx,-0.3,-0.18,0.6,0.36,'#704a22','#2a1a0d');
        rect(ctx,-0.28,-0.12,0.56,0.04,'#e6c56a');
        circle(ctx,0,0.0,0.06,'#f8d870','#2a1a0d');
        rect(ctx,-0.2,0.18,0.06,0.06,'#f8d870');
        rect(ctx,0.14,0.18,0.06,0.06,'#f8d870');
        rect(ctx,0.0,0.21,0.06,0.06,'#f8d870');
    }},
    { key: 'barrel', name: 'Fass', category: 'moebel', tags: ['fass','bier'],
      draw: (ctx) => {
        circle(ctx,0,0,0.3,'#5a3818','#1f0f05');
        ctx.strokeStyle = '#2a1a0d'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.arc(0,0,0.3,Math.PI*0.2, Math.PI*0.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(0,0,0.3,Math.PI*1.2, Math.PI*1.8); ctx.stroke();
    }},
    { key: 'crate', name: 'Kiste', category: 'moebel', tags: ['kiste','vorrat'],
      draw: (ctx) => {
        rect(ctx,-0.26,-0.26,0.52,0.52,'#7a5520','#2a1a0d');
        ctx.strokeStyle = '#4a3010'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.26,-0.26); ctx.lineTo(0.26,0.26); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.26,0.26); ctx.lineTo(0.26,-0.26); ctx.stroke();
    }},
    { key: 'bookshelf', name: 'Bücherregal', category: 'moebel', tags: ['buch','regal','bibliothek'], defaultSize: {x:1.2, y:0.6},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.26,0.84,0.52,'#4a2e15','#1a0e05');
        const colors = ['#9b2a1e', '#2a4a6d', '#3d4a2a', '#6d5a2a', '#5a3a2a'];
        for (let i=0;i<5;i++){ rect(ctx,-0.38,-0.22+i*0.1,0.76,0.07,colors[i%colors.length],'#1a0e05',0.02); }
    }},
    { key: 'dresser', name: 'Kommode', category: 'moebel', tags: ['schrank','kommode'],
      draw: (ctx) => {
        rect(ctx,-0.32,-0.2,0.64,0.4,'#6b4525','#1a0e05');
        rect(ctx,-0.28,-0.16,0.56,0.14,'#8a6238','#1a0e05',0.02);
        rect(ctx,-0.28,0.02,0.56,0.14,'#8a6238','#1a0e05',0.02);
        circle(ctx,0,-0.09,0.025,'#e6c56a');
        circle(ctx,0,0.09,0.025,'#e6c56a');
    }},
    { key: 'wardrobe', name: 'Kleiderschrank', category: 'moebel', tags: ['schrank'], defaultSize: {x:1, y:0.6},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.26,0.84,0.52,'#5a3818','#1a0e05');
        ctx.strokeStyle = '#2a1a0d'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(0,-0.26); ctx.lineTo(0,0.26); ctx.stroke();
        circle(ctx,-0.06,0,0.02,'#e6c56a');
        circle(ctx,0.06,0,0.02,'#e6c56a');
    }},
    { key: 'desk', name: 'Schreibtisch', category: 'moebel', tags: ['schreibtisch','arbeit'], defaultSize: {x:1.2, y:0.8},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.22,0.84,0.44,'#6b4525','#2a1a0d');
        rect(ctx,-0.3,-0.14,0.2,0.1,'#e8dfc6','#2a1a0d',0.02);
        circle(ctx,0.2,-0.1,0.04,'#1a1510');
    }},
    { key: 'carpet', name: 'Teppich', category: 'moebel', tags: ['teppich','deko'], defaultSize: {x:2, y:1.4},
      draw: (ctx) => {
        rect(ctx,-0.46,-0.44,0.92,0.88,'#722a1e','#3a0d0d');
        rect(ctx,-0.42,-0.4,0.84,0.8,'#8a3a2c','#3a0d0d',0.02);
        rect(ctx,-0.35,-0.33,0.7,0.66,'#722a1e','#3a0d0d',0.02);
    }},
    { key: 'anvil', name: 'Amboss', category: 'moebel', tags: ['amboss','schmiede'],
      draw: (ctx) => {
        rect(ctx,-0.2,-0.05,0.4,0.15,'#2a2a28','#111');
        rect(ctx,-0.08,0.1,0.16,0.18,'#2a2a28','#111');
        rect(ctx,-0.3,-0.12,0.3,0.1,'#3a3a38','#111');
    }},
    { key: 'anvil-forge', name: 'Schmiede', category: 'moebel', tags: ['schmiede','forge'], defaultSize: {x:1.4, y:1},
      emitsLight: { bright: 10, dim: 20, color: '#d94a18' },
      draw: (ctx) => {
        rect(ctx,-0.4,-0.3,0.8,0.6,'#3a2a20','#1a1510');
        circle(ctx,0,-0.05,0.18,'#d94a18');
        circle(ctx,0,-0.05,0.1,'#f6c044');
        rect(ctx,-0.3,0.18,0.3,0.1,'#2a2a28');
    }},
    { key: 'oven', name: 'Ofen', category: 'moebel', tags: ['ofen','kueche'],
      emitsLight: { bright: 5, dim: 15, color: '#d94a18' },
      draw: (ctx) => {
        rect(ctx,-0.3,-0.3,0.6,0.6,'#5a4030','#1a1510');
        rect(ctx,-0.2,-0.05,0.4,0.2,'#1a0e05');
        circle(ctx,0,0.05,0.1,'#d94a18');
    }},
    { key: 'cauldron', name: 'Kessel', category: 'moebel', tags: ['kessel','kochen','hexe'],
      emitsLight: { bright: 5, dim: 10, color: '#6ea048' },
      draw: (ctx) => {
        circle(ctx,0,0.0,0.25,'#1a1a18','#060606',0.04);
        ctx.beginPath(); ctx.ellipse(0,-0.05,0.22,0.08,0,0,Math.PI*2);
        ctx.fillStyle = '#6ea048'; ctx.fill();
    }},
    { key: 'piano', name: 'Klavier', category: 'moebel', tags: ['klavier','musik'], defaultSize: {x:1.4, y:0.8},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.22,0.84,0.44,'#1a1510','#060606');
        rect(ctx,-0.38,-0.1,0.76,0.12,'#f0e8d0','#060606',0.02);
        ctx.strokeStyle = '#060606'; ctx.lineWidth = 0.01;
        for (let i=0;i<9;i++){ const x = -0.38+i*0.095; ctx.beginPath(); ctx.moveTo(x,-0.1); ctx.lineTo(x,0.02); ctx.stroke(); }
    }},
    { key: 'altar', name: 'Altar', category: 'moebel', tags: ['altar','tempel','religion'], defaultSize: {x:1.4, y:0.8},
      draw: (ctx) => {
        rect(ctx,-0.44,-0.22,0.88,0.44,'#c7c1b3','#55504a');
        rect(ctx,-0.4,-0.18,0.8,0.36,'#e5dfd0','#55504a',0.03);
        circle(ctx,0,0,0.1,'#e6c56a','#55504a');
    }},
    { key: 'throne', name: 'Thron', category: 'moebel', tags: ['thron','koenig'], defaultSize: {x:1, y:1.2},
      draw: (ctx) => {
        rect(ctx,-0.28,-0.5,0.56,0.6,'#9b7a2a','#2a1a0d');
        rect(ctx,-0.3,0.1,0.6,0.35,'#8a3a1a','#2a1a0d');
        circle(ctx,0,-0.35,0.1,'#e6c56a','#2a1a0d');
    }},
    { key: 'fountain', name: 'Brunnen', category: 'moebel', tags: ['brunnen','wasser','platz'], defaultSize: {x:1.4, y:1.4},
      draw: (ctx) => {
        circle(ctx,0,0,0.45,'#7d7a72','#2a2825');
        circle(ctx,0,0,0.35,'#3d6a94','#2a2825',0.03);
        circle(ctx,0,0,0.1,'#7d7a72','#2a2825');
        circle(ctx,0,0,0.04,'#c2d7e6');
    }},
    { key: 'well', name: 'Brunnen (Dorf)', category: 'moebel', tags: ['brunnen','dorf'],
      draw: (ctx) => {
        circle(ctx,0,0,0.3,'#55504a','#1a1510');
        circle(ctx,0,0,0.2,'#1a1812','#060606');
        ctx.strokeStyle = '#3a2512'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(-0.3,-0.3); ctx.lineTo(0.3,-0.3); ctx.stroke();
    }},
    { key: 'statue', name: 'Statue', category: 'dungeon', tags: ['statue','figur'],
      draw: (ctx) => {
        circle(ctx,0,0.15,0.22,'#a8a29a','#3a3730');
        circle(ctx,0,-0.08,0.11,'#a8a29a','#3a3730');
        rect(ctx,-0.26,0.3,0.52,0.1,'#55504a','#1a1812');
    }},
];

// ---------- DUNGEON (20+) ----------
const DUNGEON: StampDef[] = [
    { key: 'pillar', name: 'Säule', category: 'dungeon', tags: ['saeule','stein'],
      draw: (ctx) => {
        rect(ctx,-0.26,-0.26,0.52,0.52,'#7d7a72','#1a1812');
        circle(ctx,0,0,0.2,'#a8a29a','#1a1812');
    }},
    { key: 'pillar-broken', name: 'Zerbr. Säule', category: 'dungeon', tags: ['saeule','ruine'],
      draw: (ctx) => {
        rect(ctx,-0.24,-0.1,0.48,0.3,'#7d7a72','#1a1812');
        poly(ctx,[[-0.24,-0.1],[-0.08,-0.3],[0.12,-0.25],[0.24,-0.1]], '#9a948b','#1a1812');
    }},
    { key: 'portcullis', name: 'Fallgatter', category: 'dungeon', tags: ['tor','fallgatter'], defaultSize: {x:1.4, y:0.3},
      draw: (ctx) => {
        rect(ctx,-0.45,-0.12,0.9,0.24,'#3a3730','#111');
        ctx.strokeStyle = '#1a1810'; ctx.lineWidth = 0.03;
        for (let i=-4;i<=4;i++){ ctx.beginPath(); ctx.moveTo(i*0.1,-0.12); ctx.lineTo(i*0.1,0.12); ctx.stroke(); }
    }},
    { key: 'sarcophagus', name: 'Sarkophag', category: 'dungeon', tags: ['sarg','grab','untot'], defaultSize: {x:1, y:1.6},
      draw: (ctx) => {
        rect(ctx,-0.3,-0.58,0.6,1.16,'#8a7a5a','#2a2520');
        poly(ctx,[[-0.26,-0.54],[-0.1,-0.58],[0.1,-0.58],[0.26,-0.54],[0.26,0.0],[-0.26,0.0]], '#c7b893','#2a2520');
        circle(ctx,0,-0.25,0.12,'#c7b893','#2a2520');
    }},
    { key: 'trap-spikes', name: 'Stachelfalle', category: 'dungeon', tags: ['falle','stacheln'],
      draw: (ctx) => {
        rect(ctx,-0.4,-0.4,0.8,0.8,'#2a2520','#111');
        for (let r=0;r<3;r++) for (let c=0;c<3;c++){
            poly(ctx,[[-0.3+c*0.3,-0.3+r*0.3],[-0.2+c*0.3,-0.35+r*0.3],[-0.1+c*0.3,-0.3+r*0.3]], '#d0cbbe', '#2a2520');
        }
    }},
    { key: 'trap-pit', name: 'Grube', category: 'dungeon', tags: ['falle','grube','loch'],
      draw: (ctx) => {
        rect(ctx,-0.4,-0.4,0.8,0.8,'#2a2520','#111');
        circle(ctx,0,0,0.3,'#0a0806','#1a1510',0.04);
    }},
    { key: 'coin-pile', name: 'Münzhaufen', category: 'dungeon', tags: ['gold','muenze','schatz'],
      draw: (ctx) => {
        for (let i=0;i<8;i++){
            const a = i*Math.PI/4;
            circle(ctx,Math.cos(a)*0.15,Math.sin(a)*0.1,0.08,'#f6c044','#8a5a1a',0.02);
        }
        circle(ctx,0,0,0.1,'#f8d870','#8a5a1a',0.02);
    }},
    { key: 'gem-red', name: 'Edelstein (rot)', category: 'dungeon', tags: ['edelstein','rubin'],
      draw: (ctx) => {
        poly(ctx,[[0,-0.2],[0.18,0],[0,0.2],[-0.18,0]], '#c21e2a','#5a0a0a',0.04);
        poly(ctx,[[0,-0.2],[-0.08,-0.05],[0.08,-0.05]], '#f0b0b0','#5a0a0a',0.02);
    }},
    { key: 'gem-blue', name: 'Edelstein (blau)', category: 'dungeon', tags: ['edelstein','saphir'],
      draw: (ctx) => {
        poly(ctx,[[0,-0.2],[0.18,0],[0,0.2],[-0.18,0]], '#2a5a9a','#0a1a40',0.04);
        poly(ctx,[[0,-0.2],[-0.08,-0.05],[0.08,-0.05]], '#a0c0e8','#0a1a40',0.02);
    }},
    { key: 'gem-green', name: 'Edelstein (grün)', category: 'dungeon', tags: ['edelstein','smaragd'],
      draw: (ctx) => {
        poly(ctx,[[0,-0.2],[0.18,0],[0,0.2],[-0.18,0]], '#1a7a3a','#0a3a1a',0.04);
        poly(ctx,[[0,-0.2],[-0.08,-0.05],[0.08,-0.05]], '#a0e8b8','#0a3a1a',0.02);
    }},
    { key: 'skull', name: 'Schädel', category: 'dungeon', tags: ['schaedel','tod','knochen'],
      draw: (ctx) => {
        circle(ctx,0,-0.03,0.22,'#e8dfc6','#1a1510');
        rect(ctx,-0.08,0.15,0.16,0.08,'#e8dfc6','#1a1510');
        circle(ctx,-0.08,-0.05,0.05,'#1a1510');
        circle(ctx,0.08,-0.05,0.05,'#1a1510');
    }},
    { key: 'bones', name: 'Knochen', category: 'dungeon', tags: ['knochen','gerippe'], defaultSize: {x:1.2, y:0.6},
      draw: (ctx) => {
        ctx.strokeStyle = '#e8dfc6'; ctx.lineWidth = 0.07; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(-0.35,-0.05); ctx.lineTo(0.35,0.05); ctx.stroke();
        circle(ctx,-0.35,-0.05,0.07,'#e8dfc6','#1a1510',0.02);
        circle(ctx,-0.3,0,0.07,'#e8dfc6','#1a1510',0.02);
        circle(ctx,0.35,0.05,0.07,'#e8dfc6','#1a1510',0.02);
        circle(ctx,0.3,0.1,0.07,'#e8dfc6','#1a1510',0.02);
    }},
    { key: 'spiderweb', name: 'Spinnweben', category: 'dungeon', tags: ['spinne','web','ecke'],
      draw: (ctx) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.015;
        for (let i=0;i<8;i++){
            const a = i*Math.PI/4;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*0.3, Math.sin(a)*0.3); ctx.stroke();
        }
        for (let r=0.08;r<=0.28;r+=0.08){
            ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
        }
    }},
    { key: 'portal', name: 'Portal', category: 'dungeon', tags: ['portal','magie'], defaultSize: {x:1.2, y:1.4},
      emitsLight: { bright: 10, dim: 20, color: '#6a40c2' },
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0,0.4,0.6,0,0,Math.PI*2);
        ctx.fillStyle = '#2a1a3a'; ctx.fill();
        ctx.strokeStyle = '#6a40c2'; ctx.lineWidth = 0.08; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0,0,0.3,0.5,0,0,Math.PI*2);
        ctx.fillStyle = '#6a40c2'; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    }},
    { key: 'rune-circle', name: 'Runenkreis', category: 'dungeon', tags: ['rune','magie','kreis'], defaultSize: {x:1.4, y:1.4},
      draw: (ctx) => {
        ctx.strokeStyle = '#6a40c2'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.arc(0,0,0.42,0,Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0,0,0.32,0,Math.PI*2); ctx.stroke();
        for (let i=0;i<8;i++){
            const a = i*Math.PI/4;
            ctx.save(); ctx.translate(Math.cos(a)*0.37, Math.sin(a)*0.37); ctx.rotate(a);
            ctx.strokeStyle = '#8a60e2'; ctx.lineWidth = 0.03;
            ctx.beginPath(); ctx.moveTo(-0.04,0); ctx.lineTo(0.04,0); ctx.moveTo(0,-0.04); ctx.lineTo(0,0.04); ctx.stroke();
            ctx.restore();
        }
    }},
    { key: 'stairs-up', name: 'Treppe hoch', category: 'dungeon', tags: ['treppe','hoch'], defaultSize: {x:1, y:1},
      draw: (ctx) => {
        rect(ctx,-0.4,-0.4,0.8,0.8,'#6a6a68','#232320');
        ctx.strokeStyle = '#2a2a28'; ctx.lineWidth = 0.05;
        for (let i=-3;i<=3;i++){ ctx.beginPath(); ctx.moveTo(-0.4, i*0.1); ctx.lineTo(0.4, i*0.1); ctx.stroke(); }
    }},
    { key: 'stairs-down', name: 'Treppe runter', category: 'dungeon', tags: ['treppe','runter'],
      draw: (ctx) => {
        rect(ctx,-0.4,-0.4,0.8,0.8,'#2a2820','#060606');
        ctx.strokeStyle = '#555049'; ctx.lineWidth = 0.05;
        for (let i=-3;i<=3;i++){ ctx.beginPath(); ctx.moveTo(-0.4+Math.abs(i)*0.04, i*0.1); ctx.lineTo(0.4-Math.abs(i)*0.04, i*0.1); ctx.stroke(); }
    }},
    { key: 'lever', name: 'Hebel', category: 'dungeon', tags: ['hebel','mechanik'],
      draw: (ctx) => {
        rect(ctx,-0.1,0.1,0.2,0.2,'#5a504a','#1a1510');
        ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 0.05; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(0,0.1); ctx.lineTo(0.12,-0.2); ctx.stroke();
        circle(ctx,0.12,-0.2,0.05,'#e6c56a');
    }},
    { key: 'door-stamp', name: 'Tür-Stempel', category: 'dungeon', tags: ['tuer'],
      draw: (ctx) => {
        rect(ctx,-0.35,-0.12,0.7,0.24,'#7a4a22','#1f0f05');
        circle(ctx,0.22,0,0.04,'#e6c56a');
    }},
    { key: 'anvil-dungeon', name: 'Rostiger Amboss', category: 'dungeon', tags: ['amboss','rost'],
      draw: (ctx) => {
        rect(ctx,-0.2,-0.05,0.4,0.15,'#3a2a20','#111');
        rect(ctx,-0.08,0.1,0.16,0.18,'#3a2a20','#111');
    }},
    { key: 'crystals', name: 'Kristalle', category: 'dungeon', tags: ['kristall','mine'],
      emitsLight: { bright: 5, dim: 10, color: '#6a9ac2' },
      draw: (ctx) => {
        poly(ctx,[[-0.15,0.2],[-0.1,-0.25],[0.0,-0.1],[0.1,0.15]], '#6ac2e2','#2a4a6d');
        poly(ctx,[[0.0,0.2],[0.1,-0.1],[0.2,-0.3],[0.25,0.15]], '#8ad2ec','#2a4a6d');
    }},
    { key: 'book-open', name: 'Aufgeschl. Buch', category: 'dungeon', tags: ['buch','zauber'],
      draw: (ctx) => {
        poly(ctx,[[-0.3,-0.18],[0,-0.22],[0,0.22],[-0.3,0.18]], '#d8ceb0','#2a1a0d');
        poly(ctx,[[0,-0.22],[0.3,-0.18],[0.3,0.18],[0,0.22]], '#d8ceb0','#2a1a0d');
        ctx.strokeStyle = '#2a1a0d'; ctx.lineWidth = 0.02;
        for (let i=-2;i<=2;i++){ ctx.beginPath(); ctx.moveTo(-0.25, i*0.06); ctx.lineTo(-0.05, i*0.06); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0.05,i*0.06); ctx.lineTo(0.25,i*0.06); ctx.stroke(); }
    }},
    { key: 'potion-red', name: 'Trank (rot)', category: 'dungeon', tags: ['trank','potion','rot'],
      draw: (ctx) => {
        rect(ctx,-0.06,-0.3,0.12,0.1,'#5a504a');
        ctx.beginPath(); ctx.ellipse(0,0,0.14,0.18,0,0,Math.PI*2);
        ctx.fillStyle = '#c21e2a'; ctx.fill();
        ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 0.03; ctx.stroke();
    }},
    { key: 'potion-blue', name: 'Trank (blau)', category: 'dungeon', tags: ['trank','blau'],
      draw: (ctx) => {
        rect(ctx,-0.06,-0.3,0.12,0.1,'#5a504a');
        ctx.beginPath(); ctx.ellipse(0,0,0.14,0.18,0,0,Math.PI*2);
        ctx.fillStyle = '#2a5a9a'; ctx.fill();
        ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 0.03; ctx.stroke();
    }},
];

// ---------- GEBAEUDE (15+) Top-Down -----------
const GEBAEUDE: StampDef[] = [
    { key: 'house-small', name: 'Kleines Haus', category: 'gebaeude', tags: ['haus','dorf','klein'], defaultSize: {x: 2.5, y: 2.5},
      draw: (ctx) => {
        rect(ctx,-0.45,-0.45,0.9,0.9,'#8a3a1a','#2a1008');
        rect(ctx,-0.42,-0.42,0.84,0.84,'#a9502a','#2a1008',0.02);
        // Dachkamm
        ctx.strokeStyle = '#4a1a08'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.42,0); ctx.lineTo(0.42,0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,-0.42); ctx.lineTo(0,0.42); ctx.stroke();
        // Schornstein
        rect(ctx,0.25,-0.4,0.1,0.1,'#55504a','#1a1510',0.02);
    }},
    { key: 'house-medium', name: 'Haus (Mittel)', category: 'gebaeude', tags: ['haus','dorf'], defaultSize: {x: 3, y: 3},
      draw: (ctx) => {
        rect(ctx,-0.46,-0.46,0.92,0.92,'#7a4e26','#2a1a0d');
        rect(ctx,-0.42,-0.42,0.84,0.84,'#a9502a','#2a1008',0.02);
        // Dach-Grat
        poly(ctx,[[-0.42,-0.42],[0.42,-0.42],[0.42,0.42],[-0.42,0.42]], undefined as any, '#4a1a08', 0.03);
        ctx.strokeStyle = '#4a1a08'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(-0.42,-0.42); ctx.lineTo(0.42,0.42); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.42,0.42); ctx.lineTo(0.42,-0.42); ctx.stroke();
        rect(ctx,0.26,-0.4,0.12,0.12,'#55504a','#1a1510');
    }},
    { key: 'house-large', name: 'Großes Haus', category: 'gebaeude', tags: ['haus','gross','manor'], defaultSize: {x: 4, y: 4},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.48,0.96,0.96,'#5a3818','#1a0e05');
        rect(ctx,-0.44,-0.44,0.88,0.88,'#8a4a22','#2a1008',0.02);
        // Innenhof
        rect(ctx,-0.15,-0.15,0.3,0.3,'#4a7a30','#2a1a0d',0.02);
        ctx.strokeStyle = '#2a1008'; ctx.lineWidth = 0.03;
        for (let i=0;i<2;i++){
            ctx.beginPath(); ctx.moveTo(-0.44, -0.2+i*0.4); ctx.lineTo(0.44, -0.2+i*0.4); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-0.2+i*0.4,-0.44); ctx.lineTo(-0.2+i*0.4,0.44); ctx.stroke();
        }
    }},
    { key: 'hut', name: 'Hütte', category: 'gebaeude', tags: ['huette','jagd'], defaultSize: {x: 2, y: 2},
      draw: (ctx) => {
        circle(ctx,0,0,0.42,'#8a6238','#2a1a0d');
        circle(ctx,0,0,0.3,'#a9752a','#2a1a0d',0.02);
        rect(ctx,-0.08,0.15,0.16,0.3,'#1a0e05');
    }},
    { key: 'cottage', name: 'Bauernhaus', category: 'gebaeude', tags: ['bauer','hof'], defaultSize: {x: 3, y: 2.5},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.4,0.96,0.8,'#6b4525','#2a1a0d');
        rect(ctx,-0.44,-0.36,0.88,0.72,'#9b6a3a','#2a1a0d',0.02);
        // Stroh-Dach-Markierung
        ctx.strokeStyle = '#4a3010'; ctx.lineWidth = 0.02;
        for (let i=-3;i<=3;i++){ ctx.beginPath(); ctx.moveTo(i*0.12,-0.36); ctx.lineTo(i*0.12,0.36); ctx.stroke(); }
    }},
    { key: 'tower', name: 'Turm', category: 'gebaeude', tags: ['turm','burg'], defaultSize: {x: 2, y: 2},
      draw: (ctx) => {
        circle(ctx,0,0,0.42,'#55504a','#111');
        circle(ctx,0,0,0.3,'#7d7a72','#111',0.03);
        // Zinnen-Markierung
        ctx.strokeStyle = '#2a2520'; ctx.lineWidth = 0.025;
        for (let i=0;i<8;i++){
            const a = i*Math.PI/4;
            const x1 = Math.cos(a)*0.3, y1 = Math.sin(a)*0.3;
            const x2 = Math.cos(a)*0.42, y2 = Math.sin(a)*0.42;
            ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        }
    }},
    { key: 'castle', name: 'Burg', category: 'gebaeude', tags: ['burg','festung'], defaultSize: {x: 5, y: 4},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.44,0.96,0.88,'#55504a','#111');
        rect(ctx,-0.44,-0.4,0.88,0.8,'#7d7a72','#111',0.03);
        // Vier Ecktuerme
        for (const [cx,cy] of [[-0.42,-0.38],[0.42,-0.38],[-0.42,0.38],[0.42,0.38]]){
            circle(ctx,cx,cy,0.12,'#55504a','#111',0.025);
            circle(ctx,cx,cy,0.08,'#8a877f','#111',0.02);
        }
        // Tor
        rect(ctx,-0.08,0.3,0.16,0.14,'#1a1510');
    }},
    { key: 'chapel', name: 'Kapelle', category: 'gebaeude', tags: ['kapelle','tempel','kirche'], defaultSize: {x: 2.5, y: 3.5},
      draw: (ctx) => {
        rect(ctx,-0.44,-0.46,0.88,0.92,'#c7c1b3','#55504a');
        rect(ctx,-0.4,-0.42,0.8,0.84,'#e5dfd0','#55504a',0.02);
        // Kreuz
        ctx.strokeStyle = '#55504a'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(0,-0.35); ctx.lineTo(0,-0.18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.07,-0.28); ctx.lineTo(0.07,-0.28); ctx.stroke();
        // Portal
        rect(ctx,-0.08,0.3,0.16,0.14,'#4a2e15');
    }},
    { key: 'temple', name: 'Tempel', category: 'gebaeude', tags: ['tempel','gross','saeulen'], defaultSize: {x: 4, y: 3.5},
      draw: (ctx) => {
        rect(ctx,-0.46,-0.44,0.92,0.88,'#d0cbbe','#55504a');
        // Saeulen
        for (let i=-4;i<=4;i++){
            circle(ctx, i*0.1, -0.38, 0.045, '#e5dfd0', '#55504a', 0.015);
            circle(ctx, i*0.1,  0.38, 0.045, '#e5dfd0', '#55504a', 0.015);
        }
        // Mittlerer Raum
        rect(ctx,-0.3,-0.26,0.6,0.52,'#f0ebd8','#55504a',0.02);
    }},
    { key: 'market-stall', name: 'Marktstand', category: 'gebaeude', tags: ['markt','stand','handel'], defaultSize: {x: 1.5, y: 1},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.3,0.84,0.1,'#c24a2a','#2a1a0d');
        rect(ctx,-0.42,-0.2,0.84,0.4,'#8a6238','#2a1a0d',0.02);
        rect(ctx,-0.38,-0.16,0.76,0.3,'#6b4525','#2a1a0d',0.02);
        // Streifen im Dach
        ctx.strokeStyle = '#f0e0b0'; ctx.lineWidth = 0.02;
        for (let x=-0.4;x<=0.4;x+=0.1){ ctx.beginPath(); ctx.moveTo(x,-0.3); ctx.lineTo(x,-0.2); ctx.stroke(); }
    }},
    { key: 'windmill', name: 'Windmühle', category: 'gebaeude', tags: ['muehle','wind'], defaultSize: {x: 2.5, y: 2.5},
      draw: (ctx) => {
        circle(ctx,0,0,0.42,'#8a6238','#2a1a0d');
        circle(ctx,0,0,0.35,'#a9752a','#2a1a0d',0.02);
        // Fluegel
        ctx.strokeStyle = '#2a1a0d'; ctx.lineWidth = 0.025;
        for (let i=0;i<4;i++){
            const a = i*Math.PI/2 + 0.3;
            ctx.save(); ctx.translate(0,0); ctx.rotate(a);
            rect(ctx,0,-0.03,0.42,0.06,'#f0e0b0','#2a1a0d',0.015);
            ctx.restore();
        }
        circle(ctx,0,0,0.05,'#4a3010');
    }},
    { key: 'smithy', name: 'Schmiede', category: 'gebaeude', tags: ['schmiede','handwerk'], defaultSize: {x: 2.5, y: 2},
      emitsLight: { bright: 10, dim: 15, color: '#d94a18' },
      draw: (ctx) => {
        rect(ctx,-0.46,-0.4,0.92,0.8,'#3a2a20','#1a1510');
        rect(ctx,-0.42,-0.36,0.84,0.72,'#55504a','#1a1510',0.02);
        // Esse
        circle(ctx, 0.2, 0, 0.14, '#d94a18');
        circle(ctx, 0.2, 0, 0.08, '#f6c044');
        // Amboss
        rect(ctx,-0.3,-0.05,0.2,0.1,'#2a2a28','#111',0.02);
    }},
    { key: 'inn', name: 'Gasthaus', category: 'gebaeude', tags: ['inn','gasthaus','herberge'], defaultSize: {x: 3.5, y: 3},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.44,0.96,0.88,'#6b4525','#1a0e05');
        rect(ctx,-0.44,-0.4,0.88,0.8,'#a9502a','#2a1008',0.02);
        // Wirtshausschild
        rect(ctx,-0.12,-0.44,0.24,0.1,'#1a0e05');
        rect(ctx,-0.1,-0.42,0.2,0.08,'#f6c044','#1a0e05',0.015);
        // Innenhof
        rect(ctx,-0.2,-0.1,0.4,0.3,'#4a3010','#1a0e05',0.02);
    }},
    { key: 'ruin', name: 'Ruine', category: 'gebaeude', tags: ['ruine','verfall'], defaultSize: {x: 2.5, y: 2},
      draw: (ctx) => {
        rect(ctx,-0.46,-0.4,0.92,0.8,'#55504a','#111');
        // "zerbrochene" Wand-Reste
        poly(ctx,[[-0.46,-0.4],[-0.2,-0.4],[-0.3,-0.2],[-0.46,-0.1]], '#7d7a72','#111');
        poly(ctx,[[0.46,-0.4],[0.2,-0.4],[0.3,-0.1],[0.46,0.0]], '#7d7a72','#111');
        poly(ctx,[[-0.46,0.4],[-0.2,0.4],[-0.3,0.2],[-0.46,0.1]], '#7d7a72','#111');
    }},
    { key: 'bakery', name: 'Bäckerei', category: 'gebaeude', tags: ['baecker','ofen'], defaultSize: {x: 2.5, y: 2.5},
      emitsLight: { bright: 5, dim: 10, color: '#f6c044' },
      draw: (ctx) => {
        rect(ctx,-0.46,-0.44,0.92,0.88,'#6b4525','#1a0e05');
        rect(ctx,-0.42,-0.4,0.84,0.8,'#c2a76d','#2a1a0d',0.02);
        // Fenster
        rect(ctx,-0.3,-0.3,0.2,0.14,'#f6c044','#1a0e05',0.02);
        rect(ctx,0.1,-0.3,0.2,0.14,'#f6c044','#1a0e05',0.02);
    }},
    { key: 'graveyard', name: 'Friedhof-Tor', category: 'gebaeude', tags: ['friedhof','tor','grab'], defaultSize: {x: 2, y: 1.2},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.3,0.84,0.6,'#55504a','#111');
        rect(ctx,-0.38,-0.26,0.76,0.52,'#2a2520','#111',0.02);
        // Grabstein-Reihen
        for (const x of [-0.25, 0.0, 0.25]){ for (const y of [-0.08, 0.1]){
            rect(ctx, x-0.05, y-0.08, 0.1, 0.12, '#8a877f', '#2a2520', 0.015);
            ctx.beginPath(); ctx.arc(x, y-0.08, 0.05, Math.PI, 0); ctx.fillStyle = '#8a877f'; ctx.fill();
        }}
    }},
];

// ---------- WEGE (nur Stempel, "Pfad-Tool" ist separates Feature) ----------
const WEGE: StampDef[] = [
    { key: 'road-tile', name: 'Weg-Kachel', category: 'wege', tags: ['weg','erde'],
      draw: (ctx) => {
        rect(ctx,-0.5,-0.5,1.0,1.0,'#8a7a55','#4a3a1a');
        ctx.fillStyle = '#5a4a28';
        for (let i=0;i<5;i++){ circle(ctx,(i-2)*0.1 + 0.03*Math.sin(i), 0.1*Math.cos(i), 0.03, '#5a4a28'); }
    }},
    { key: 'cobble-tile', name: 'Pflaster-Kachel', category: 'wege', tags: ['pflaster','stein'],
      draw: (ctx) => {
        rect(ctx,-0.5,-0.5,1.0,1.0,'#5a564f','#2a2520');
        ctx.fillStyle = '#726d64'; ctx.strokeStyle = '#2a2520'; ctx.lineWidth = 0.02;
        for (let r=0;r<3;r++) for (let c=0;c<3;c++){
            ctx.beginPath(); ctx.arc(-0.33+c*0.33, -0.33+r*0.33, 0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
    }},
    { key: 'road-sign', name: 'Wegweiser', category: 'wege', tags: ['schild','weg'],
      draw: (ctx) => {
        ctx.strokeStyle = '#3a2512'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(0,0.3); ctx.lineTo(0,-0.1); ctx.stroke();
        poly(ctx,[[-0.25,-0.15],[0.15,-0.15],[0.25,-0.05],[0.15,0.05],[-0.25,0.05]], '#9b6a3a','#2a1a0d');
    }},
    { key: 'milestone', name: 'Meilenstein', category: 'wege', tags: ['stein','weg'],
      draw: (ctx) => {
        rect(ctx,-0.15,-0.2,0.3,0.4,'#8a877f','#2a2520');
        ctx.beginPath(); ctx.arc(0,-0.2,0.15,Math.PI,0); ctx.fillStyle = '#9a978f'; ctx.fill();
        ctx.strokeStyle = '#2a2520'; ctx.lineWidth = 0.02;
        ctx.beginPath(); ctx.moveTo(-0.08,0); ctx.lineTo(0.08,0); ctx.stroke();
    }},
    { key: 'cart', name: 'Karren', category: 'wege', tags: ['karren','wagen'], defaultSize: {x: 1.4, y: 0.8},
      draw: (ctx) => {
        rect(ctx,-0.42,-0.15,0.84,0.3,'#6b4525','#1a0e05');
        circle(ctx,-0.3,0.2,0.1,'#2a1a0d','#060606');
        circle(ctx,0.3,0.2,0.1,'#2a1a0d','#060606');
        circle(ctx,-0.3,0.2,0.04,'#8a6238');
        circle(ctx,0.3,0.2,0.04,'#8a6238');
    }},
];

// ---------- BRUECKEN ----------
const BRUECKEN: StampDef[] = [
    { key: 'bridge-wood', name: 'Holzbrücke', category: 'bruecken', tags: ['bruecke','holz'], defaultSize: {x: 2, y: 1},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.4,0.96,0.8,'#6b4525','#1a0e05');
        ctx.strokeStyle = '#4a3010'; ctx.lineWidth = 0.02;
        for (let i=-4;i<=4;i++){ ctx.beginPath(); ctx.moveTo(i*0.1,-0.4); ctx.lineTo(i*0.1,0.4); ctx.stroke(); }
        // Gelaender
        rect(ctx,-0.48,-0.42,0.96,0.04,'#3a2512');
        rect(ctx,-0.48, 0.38,0.96,0.04,'#3a2512');
    }},
    { key: 'bridge-stone', name: 'Steinbrücke', category: 'bruecken', tags: ['bruecke','stein'], defaultSize: {x: 2.5, y: 1},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.4,0.96,0.8,'#8a877f','#2a2520');
        rect(ctx,-0.46,-0.38,0.92,0.76,'#a8a29a','#2a2520',0.02);
        ctx.strokeStyle = '#55504a'; ctx.lineWidth = 0.02;
        for (let i=-3;i<=3;i++){ ctx.beginPath(); ctx.moveTo(i*0.14,-0.38); ctx.lineTo(i*0.14,0.38); ctx.stroke(); }
    }},
    { key: 'bridge-rope', name: 'Seilbrücke', category: 'bruecken', tags: ['bruecke','seil'], defaultSize: {x: 2, y: 1},
      draw: (ctx) => {
        ctx.strokeStyle = '#8a6238'; ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(-0.48,-0.3); ctx.quadraticCurveTo(0,-0.1, 0.48,-0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.48,0.3); ctx.quadraticCurveTo(0,0.5, 0.48,0.3); ctx.stroke();
        // Planken
        ctx.fillStyle = '#6b4525';
        for (let i=-4;i<=4;i++){ rect(ctx, i*0.1-0.04, -0.08, 0.08, 0.2, '#6b4525','#2a1a0d',0.015); }
    }},
];

// ---------- LAGER ----------
const LAGER: StampDef[] = [
    { key: 'tent', name: 'Zelt', category: 'lager', tags: ['zelt','lager'],
      draw: (ctx) => {
        poly(ctx,[[-0.35,0.3],[0,-0.3],[0.35,0.3]], '#8a3a1a','#2a1008');
        rect(ctx,-0.05,0.0,0.1,0.3,'#1a0e05');
    }},
    { key: 'tent-large', name: 'Großes Zelt', category: 'lager', tags: ['zelt','gross','pavillon'], defaultSize: {x: 2, y: 2},
      draw: (ctx) => {
        poly(ctx,[[-0.44,0.4],[-0.3,-0.4],[0.3,-0.4],[0.44,0.4]], '#6b4525','#2a1a0d');
        poly(ctx,[[-0.44,0.4],[0,-0.3],[0.44,0.4]], '#8a6238','#2a1a0d');
        rect(ctx,-0.08,0.1,0.16,0.3,'#1a0e05');
        circle(ctx,0,-0.3,0.04,'#e6c56a');
    }},
    { key: 'campfire', name: 'Lagerfeuer', category: 'lager', tags: ['feuer','lager'],
      emitsLight: { bright: 20, dim: 40, color: '#f6c044' },
      draw: (ctx) => {
        circle(ctx,0,0,0.3,'#1a0e05','#000');
        ctx.fillStyle = '#5e5852';
        for (let i=0;i<4;i++){ const a=i*Math.PI/2+0.3; ctx.beginPath(); ctx.arc(Math.cos(a)*0.28,Math.sin(a)*0.28,0.06,0,Math.PI*2); ctx.fill(); }
        // Flammen
        poly(ctx,[[-0.1,0.1],[-0.05,-0.15],[0.0,0.0],[0.08,-0.2],[0.12,0.1]], '#d94a18');
        poly(ctx,[[-0.05,0.05],[0.0,-0.1],[0.05,0.05]], '#f6c044');
    }},
    { key: 'pile-of-wood', name: 'Holzstapel', category: 'lager', tags: ['holz','stapel'],
      draw: (ctx) => {
        for (let i=0;i<3;i++){ rect(ctx,-0.3,-0.2+i*0.14,0.6,0.1,'#8a6238','#2a1a0d',0.02); }
        // Enden
        for (let i=0;i<3;i++){ circle(ctx,-0.3,-0.15+i*0.14,0.05,'#4a3010'); circle(ctx,0.3,-0.15+i*0.14,0.05,'#4a3010'); }
    }},
    { key: 'sleeping-roll', name: 'Schlafsack', category: 'lager', tags: ['schlaf','roll'],
      draw: (ctx) => {
        rect(ctx,-0.3,-0.14,0.6,0.28,'#4a6b2d','#15280d');
        circle(ctx,-0.26,0,0.08,'#2d4a1e','#15280d',0.02);
    }},
    { key: 'backpack', name: 'Rucksack', category: 'lager', tags: ['rucksack','lager'],
      draw: (ctx) => {
        rect(ctx,-0.2,-0.22,0.4,0.44,'#5a3818','#1a0e05');
        rect(ctx,-0.2,-0.22,0.4,0.1,'#4a3010','#1a0e05',0.02);
        circle(ctx,0,0.0,0.05,'#e6c56a');
    }},
    { key: 'horse', name: 'Pferd', category: 'lager', tags: ['pferd','reittier'], defaultSize: {x: 1, y: 1.2},
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0.1,0.3,0.18,0,0,Math.PI*2);
        ctx.fillStyle = '#5a3818'; ctx.fill();
        ctx.strokeStyle = '#1a0e05'; ctx.lineWidth = 0.03; ctx.stroke();
        circle(ctx,0.0,-0.3,0.14,'#5a3818','#1a0e05',0.03);
        rect(ctx,-0.03,-0.22,0.06,0.15,'#5a3818');
        // Mähne
        poly(ctx,[[-0.08,-0.4],[0.0,-0.25],[0.08,-0.4],[0.0,-0.35]], '#1a0e05');
    }},
];

// ---------- WASSER ----------
const WASSER: StampDef[] = [
    { key: 'boat-row', name: 'Ruderboot', category: 'wasser', tags: ['boot','ruder'], defaultSize: {x: 1.6, y: 0.8},
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0,0.42,0.16,0,0,Math.PI*2);
        ctx.fillStyle = '#5a3818'; ctx.fill();
        ctx.strokeStyle = '#1a0e05'; ctx.lineWidth = 0.03; ctx.stroke();
        rect(ctx,-0.05,-0.08,0.1,0.16,'#4a3010');
        // Ruder
        ctx.strokeStyle = '#8a6238'; ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(-0.1,0); ctx.lineTo(-0.35,0.15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( 0.1,0); ctx.lineTo( 0.35,0.15); ctx.stroke();
    }},
    { key: 'boat-sail', name: 'Segelboot', category: 'wasser', tags: ['boot','segel'], defaultSize: {x: 2, y: 1.4},
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(0,0.15,0.42,0.16,0,0,Math.PI*2);
        ctx.fillStyle = '#5a3818'; ctx.fill();
        ctx.strokeStyle = '#1a0e05'; ctx.lineWidth = 0.03; ctx.stroke();
        // Mast + Segel
        rect(ctx,-0.03,-0.4,0.06,0.5,'#1a0e05');
        poly(ctx,[[-0.03,-0.4],[-0.3,0.0],[-0.03,0.0]], '#e8dfc6', '#2a1a0d');
        poly(ctx,[[0.03,-0.4],[0.3,0.0],[0.03,0.0]], '#e8dfc6', '#2a1a0d');
    }},
    { key: 'dock', name: 'Steg', category: 'wasser', tags: ['steg','holz'], defaultSize: {x: 2, y: 1},
      draw: (ctx) => {
        rect(ctx,-0.48,-0.4,0.96,0.8,'#6b4525','#1a0e05');
        ctx.strokeStyle = '#4a3010'; ctx.lineWidth = 0.02;
        for (let i=-4;i<=4;i++){ ctx.beginPath(); ctx.moveTo(i*0.1,-0.4); ctx.lineTo(i*0.1,0.4); ctx.stroke(); }
        // Pfaehle
        circle(ctx,-0.42,-0.3,0.04,'#3a2512');
        circle(ctx, 0.42,-0.3,0.04,'#3a2512');
        circle(ctx,-0.42, 0.3,0.04,'#3a2512');
        circle(ctx, 0.42, 0.3,0.04,'#3a2512');
    }},
    { key: 'fish', name: 'Fisch', category: 'wasser', tags: ['fisch'],
      draw: (ctx) => {
        ctx.beginPath(); ctx.ellipse(-0.05,0,0.2,0.08,0,0,Math.PI*2);
        ctx.fillStyle = '#4a7a9a'; ctx.fill();
        ctx.strokeStyle = '#1a3a5a'; ctx.lineWidth = 0.02; ctx.stroke();
        poly(ctx,[[0.14,0],[0.25,-0.08],[0.25,0.08]], '#4a7a9a','#1a3a5a',0.02);
        circle(ctx,-0.12,-0.02,0.015,'#060606');
    }},
    { key: 'anchor', name: 'Anker', category: 'wasser', tags: ['anker'],
      draw: (ctx) => {
        ctx.strokeStyle = '#1a1510'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(0,-0.3); ctx.lineTo(0,0.1); ctx.stroke();
        circle(ctx,0,-0.3,0.08,'#1a1510','#060606',0.02);
        ctx.beginPath(); ctx.arc(0,0.1,0.18,Math.PI*0.3,Math.PI*0.7); ctx.stroke();
        ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.moveTo(-0.08,-0.15); ctx.lineTo(0.08,-0.15); ctx.stroke();
    }},
];

// ---------- LICHT ----------
const LICHT: StampDef[] = [
    { key: 'torch', name: 'Fackel', category: 'licht', tags: ['fackel','feuer','licht'],
      emitsLight: { bright: 20, dim: 20, color: '#f6c044' },
      draw: (ctx) => {
        rect(ctx,-0.04,-0.05,0.08,0.4,'#5a3818','#1a0e05');
        circle(ctx,0,-0.15,0.1,'#d94a18');
        circle(ctx,0,-0.18,0.05,'#f6c044');
    }},
    { key: 'lantern', name: 'Laterne', category: 'licht', tags: ['laterne','licht'],
      emitsLight: { bright: 30, dim: 30, color: '#f6c044' },
      draw: (ctx) => {
        rect(ctx,-0.03,-0.3,0.06,0.1,'#1a1510');
        rect(ctx,-0.12,-0.2,0.24,0.28,'#1a1510','#060606');
        rect(ctx,-0.09,-0.17,0.18,0.22,'#f6c044');
        rect(ctx,-0.1,0.08,0.2,0.04,'#1a1510');
    }},
    { key: 'candelabra', name: 'Kandelaber', category: 'licht', tags: ['kerze','leuchter'],
      emitsLight: { bright: 10, dim: 15, color: '#f6c044' },
      draw: (ctx) => {
        rect(ctx,-0.02,0.0,0.04,0.3,'#e6c56a','#2a1a0d');
        rect(ctx,-0.12,0.3,0.24,0.05,'#e6c56a','#2a1a0d');
        for (const dx of [-0.12,0,0.12]){
            rect(ctx, dx-0.015, -0.1, 0.03, 0.1, '#e8dfc6','#2a1a0d',0.01);
            circle(ctx, dx, -0.12, 0.03, '#f6c044');
        }
    }},
    { key: 'brazier', name: 'Feuerschale', category: 'licht', tags: ['feuerschale','licht'],
      emitsLight: { bright: 20, dim: 30, color: '#f6c044' },
      draw: (ctx) => {
        circle(ctx,0,0.0,0.22,'#2a2520','#060606');
        ctx.beginPath(); ctx.ellipse(0,-0.03,0.18,0.08,0,0,Math.PI*2);
        ctx.fillStyle = '#d94a18'; ctx.fill();
        circle(ctx,0,-0.04,0.05,'#f6c044');
        rect(ctx,-0.03,0.2,0.06,0.2,'#2a2520');
    }},
];

// ---------- EFFEKTE ----------
const EFFEKTE: StampDef[] = [
    { key: 'blood', name: 'Blut', category: 'effekte', tags: ['blut','effekt'],
      draw: (ctx) => {
        ctx.fillStyle = '#8a1a0a';
        ctx.beginPath(); ctx.ellipse(0,0,0.25,0.15,0.3,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0.1,0.1,0.06,0.04,0,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-0.1,-0.08,0.04,0.04,0,0,Math.PI*2); ctx.fill();
    }},
    { key: 'smoke', name: 'Rauch', category: 'effekte', tags: ['rauch','nebel'],
      draw: (ctx) => {
        circle(ctx,-0.1,0.05,0.15,'rgba(150,150,150,0.7)');
        circle(ctx,0.1,-0.05,0.17,'rgba(180,180,180,0.65)');
        circle(ctx,0.0,0.14,0.12,'rgba(130,130,130,0.6)');
    }},
    { key: 'fire', name: 'Feuer', category: 'effekte', tags: ['feuer','flamme'],
      emitsLight: { bright: 10, dim: 20, color: '#d94a18' },
      draw: (ctx) => {
        poly(ctx,[[-0.14,0.2],[-0.1,-0.1],[0.0,0.1],[0.08,-0.2],[0.14,0.2]], '#d94a18');
        poly(ctx,[[-0.07,0.1],[0.0,-0.1],[0.07,0.1]], '#f6c044');
    }},
    { key: 'magic-rune', name: 'Rune', category: 'effekte', tags: ['rune','magie'],
      draw: (ctx) => {
        ctx.strokeStyle = '#6a40c2'; ctx.lineWidth = 0.04;
        ctx.beginPath(); ctx.arc(0,0,0.22,0,Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.1,-0.1); ctx.lineTo(0.1,0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.1,0.1); ctx.lineTo(0.1,-0.1); ctx.stroke();
    }},
    { key: 'arrow', name: 'Pfeil', category: 'effekte', tags: ['pfeil','marker'],
      draw: (ctx) => {
        ctx.strokeStyle = '#e6c56a'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(-0.3,0); ctx.lineTo(0.2,0); ctx.stroke();
        poly(ctx,[[0.3,0],[0.15,-0.1],[0.15,0.1]], '#e6c56a');
    }},
    { key: 'marker-x', name: 'Markierung X', category: 'effekte', tags: ['marker','ziel'],
      draw: (ctx) => {
        ctx.strokeStyle = '#c21e2a'; ctx.lineWidth = 0.08; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(-0.2,-0.2); ctx.lineTo(0.2,0.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-0.2,0.2); ctx.lineTo(0.2,-0.2); ctx.stroke();
    }},
];

// Vereinige alles
export const OBJECT_STAMPS: StampDef[] = [
    ...NATUR, ...MOEBEL, ...DUNGEON, ...GEBAEUDE, ...WEGE, ...BRUECKEN, ...LAGER, ...WASSER, ...LICHT, ...EFFEKTE,
];

export function floorIndex(key: string): number {
    const idx = FLOOR_MATERIALS.findIndex((m) => m.key === key);
    return idx < 0 ? 0 : idx;
}

export function stampByKey(key: string): StampDef | null {
    return OBJECT_STAMPS.find((s) => s.key === key) || null;
}

export function stampsByCategory(c: Category): StampDef[] {
    return OBJECT_STAMPS.filter((s) => s.category === c);
}

export function searchStamps(q: string): StampDef[] {
    const t = q.trim().toLowerCase();
    if (!t) return OBJECT_STAMPS;
    return OBJECT_STAMPS.filter((s) =>
        s.name.toLowerCase().includes(t) ||
        s.key.includes(t) ||
        (s.tags || []).some((tg) => tg.includes(t))
    );
}
