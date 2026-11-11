// Hand-digitized layout von docs/references/map-dorf.png (700x495 px).
// Alle Koordinaten unten in Karten-Pixeln (x: 0..700, y: 0..495).
// toWorld() rechnet sie in Three.js-Weltkoordinaten um.
//
// Konvention:
//   Karte  ->  Welt
//   x_px   ->  worldX = (x_px - 350) * PX_SCALE         [Osten = +X]
//   y_px   ->  worldZ = (y_px - 247.5) * PX_SCALE       [Sueden = +Z]
//
// 1 Pixel = 0.22 Weltunits -> Welt ca. 154 x 108 units.
// Das Dorf-Zentrum (Tempel um px ~290/285) liegt damit bei
// Weltkoordinate (~-13, 8).

export const PX_SCALE = 0.22;
export const MAP_PX_W = 700;
export const MAP_PX_H = 495;
export const WORLD_W = MAP_PX_W * PX_SCALE;        // ~154
export const WORLD_D = MAP_PX_H * PX_SCALE;        // ~109

export function toWorldX(px_x) {
  return (px_x - MAP_PX_W / 2) * PX_SCALE;
}
export function toWorldZ(px_y) {
  return (px_y - MAP_PX_H / 2) * PX_SCALE;
}
export function toWorld(px_x, px_y) {
  return { x: toWorldX(px_x), z: toWorldZ(px_y) };
}
export function polyToWorld(pts) {
  return pts.map((p) => ({ x: toWorldX(p[0]), z: toWorldZ(p[1]) }));
}

// -------------------------------------------------------------------------
// FLUSS — Polylinien in Pixelkoordinaten.
// Hauptfluss von Westen -> zieht ins Dorf, Gabelung, dann 2 Arme.
// -------------------------------------------------------------------------
export const RIVER_MAIN = [
  [   0, 275],
  [  55, 265],
  [ 110, 255],
  [ 160, 230],      // Nord-Schwenk (Holzbruecke liegt bei ~175/185)
  [ 190, 205],
  [ 215, 215],
  [ 245, 240],
  [ 285, 260],
  [ 335, 275],
  [ 395, 275],      // Gabelung
];

export const RIVER_NORTH = [
  [ 395, 275],
  [ 440, 260],
  [ 480, 245],
  [ 520, 215],
  [ 560, 180],
  [ 600, 140],
  [ 650,  95],
  [ 695,  55],
];

export const RIVER_SOUTH = [
  [ 395, 275],
  [ 410, 300],
  [ 425, 335],
  [ 445, 380],
  [ 460, 435],
  [ 470, 495],
];

// Etwas schmaler als vorher — passt besser zur neuen Haus-Groesse.
export const RIVER_WIDTH_PX = 16;

// -------------------------------------------------------------------------
// BRUECKEN
// -------------------------------------------------------------------------
export const BRIDGES = [
  // Holzbruecke oben links (schmale Bruecke ueber den Nord-Schwenk)
  { type: 'wood',  px: [177, 207], angleDeg:  60, length: 4.4, width: 1.8 },
  // Steinbruecke rechts, kurz nach der Gabelung ueber den Suedarm
  { type: 'stone', px: [415, 310], angleDeg: 115, length: 5.4, width: 2.2 },
];

// -------------------------------------------------------------------------
// WEGE — Polylinien. 'main' = breite Hauptstrasse, 'side' = Dorfweg.
// Breiten passend zu kleineren Haeusern reduziert.
// -------------------------------------------------------------------------
export const PATHS = [
  // Hauptstrasse Nord-Sued durchs Dorf (quert die Steinbruecke)
  {
    kind: 'main',
    width: 2.0,
    pts: [
      [  25, 490],
      [  60, 460],
      [ 110, 430],
      [ 150, 400],
      [ 170, 370],
      [ 200, 345],
      [ 240, 320],
      [ 285, 305],   // Platz am Tempel
      [ 340, 310],
      [ 390, 310],
      [ 415, 310],   // Steinbruecke
      [ 445, 300],
      [ 490, 280],
      [ 540, 250],
      [ 600, 210],
      [ 680, 155],
    ],
  },
  // Weg nach Norden zu den Feldern
  {
    kind: 'main',
    width: 1.6,
    pts: [
      [ 285, 305],
      [ 275, 270],
      [ 260, 230],
      [ 245, 180],
      [ 240, 135],
      [ 240,  85],
      [ 245,  40],
    ],
  },
  // Abzweig ueber die Holzbruecke zum Hof oben links + Obstwiese
  {
    kind: 'side',
    width: 1.2,
    pts: [
      [ 200, 345],
      [ 180, 300],
      [ 177, 230],
      [ 177, 207],
      [ 170, 175],
      [ 140, 135],
      [  95, 105],
      [  55,  80],
    ],
  },
  // Suedwest-Weg zur Burg
  {
    kind: 'main',
    width: 1.6,
    pts: [
      [ 170, 370],
      [ 155, 405],
      [ 150, 435],
    ],
  },
  // Dorf-Nebenweg nach Westen
  {
    kind: 'side',
    width: 1.1,
    pts: [
      [ 240, 320],
      [ 180, 335],
      [ 110, 340],
      [  55, 345],
      [   0, 350],
    ],
  },
  // Weg zur Obstwiese (vom Hof aus)
  {
    kind: 'side',
    width: 1.0,
    pts: [
      [  95, 105],
      [  60, 120],
      [  30, 150],
      [   0, 170],
    ],
  },
];

// -------------------------------------------------------------------------
// HAEUSER — dichter Dorfkern (~50 Gebaeude).
// Scales DEUTLICH angehoben (ca. verdoppelt), damit die Grundflaeche der
// Dachflaeche auf der Karte entspricht (vorher wirkten die Haeuser winzig
// im Verhaeltnis zum riesigen Tempel).
// -------------------------------------------------------------------------
export const HOUSES = [
  // --- Zentrum: Tempel/Rathaus (dunkles Dach + Tuermchen) ---------------
  { id: 'temple',       px: [290, 285], rotDeg:  0,  scale: 3.6, model: 'temple' },

  // --- Umzaeunter Marktplatz suedlich davon ------------------------------
  { id: 'market',       px: [300, 335], rotDeg: 10,  scale: 2.6, model: 'market' },

  // --- Dorf-Cluster um den Tempel (dicht, mehrere Ringe) --------------
  { id: 'h_tavern',     px: [245, 290], rotDeg: 90,  scale: 4.2, model: 'tavern' },
  { id: 'h_blacksmith', px: [325, 260], rotDeg: 20,  scale: 3.8, model: 'blacksmith' },

  // Reihe suedwestlich vom Platz
  { id: 'h_01',         px: [260, 342], rotDeg:   0, scale: 3.6, model: 'homeA_red' },
  { id: 'h_02',         px: [232, 362], rotDeg:  40, scale: 3.6, model: 'homeB_blue' },
  { id: 'h_03',         px: [205, 382], rotDeg:   8, scale: 3.4, model: 'homeA_blue' },
  { id: 'h_04',         px: [178, 400], rotDeg:  55, scale: 3.4, model: 'homeB_yellow' },
  { id: 'h_05',         px: [152, 420], rotDeg: -14, scale: 3.2, model: 'homeA_red' },
  { id: 'h_06',         px: [122, 408], rotDeg:  18, scale: 3.2, model: 'homeB_red' },
  { id: 'h_07',         px: [ 92, 395], rotDeg: -20, scale: 3.2, model: 'homeA_red' },
  { id: 'h_08',         px: [200, 436], rotDeg:   8, scale: 3.2, model: 'homeB_blue' },
  { id: 'h_09',         px: [232, 424], rotDeg:  40, scale: 3.4, model: 'homeB_yellow' },
  { id: 'h_10',         px: [268, 404], rotDeg: -22, scale: 3.4, model: 'homeA_red' },
  { id: 'h_11',         px: [296, 384], rotDeg:  65, scale: 3.4, model: 'homeB_blue' },

  // Reihe nordwestlich (links oben vom Platz)
  { id: 'h_12',         px: [258, 248], rotDeg:   8, scale: 3.4, model: 'homeA_blue' },
  { id: 'h_13',         px: [220, 246], rotDeg:  18, scale: 3.4, model: 'homeB_red' },
  { id: 'h_14',         px: [196, 274], rotDeg:   0, scale: 3.2, model: 'homeA_red' },
  { id: 'h_15',         px: [168, 302], rotDeg:  25, scale: 3.2, model: 'homeB_yellow' },
  { id: 'h_16',         px: [136, 282], rotDeg:   8, scale: 3.2, model: 'homeA_red' },
  { id: 'h_17',         px: [100, 308], rotDeg:  35, scale: 3.2, model: 'homeB_blue' },
  { id: 'h_18',         px: [218, 218], rotDeg:   0, scale: 3.2, model: 'homeA_blue' },
  { id: 'h_19',         px: [184, 230], rotDeg: -10, scale: 3.2, model: 'homeB_yellow' },

  // Reihe nordoestlich (rechts oben vom Platz)
  { id: 'h_30',         px: [340, 290], rotDeg:  18, scale: 3.4, model: 'homeA_red' },
  { id: 'h_31',         px: [362, 258], rotDeg:  55, scale: 3.4, model: 'homeB_yellow' },
  { id: 'h_32',         px: [378, 228], rotDeg:  70, scale: 3.2, model: 'homeA_blue' },
  { id: 'h_33',         px: [332, 230], rotDeg:   0, scale: 3.2, model: 'homeB_red' },
  { id: 'h_34',         px: [358, 204], rotDeg:  18, scale: 3.2, model: 'homeA_red' },
  { id: 'h_35',         px: [300, 208], rotDeg:   0, scale: 3.2, model: 'homeB_blue' },

  // --- Haeuser ueber die Steinbruecke jenseits des Flusses (rechts) ----
  // Vom Fluss weggeschoben (vorher teilweise mitten im Wasser).
  { id: 'h_r1',         px: [452, 272], rotDeg: 110, scale: 3.6, model: 'homeA_blue' },
  { id: 'h_r2',         px: [486, 256], rotDeg:  95, scale: 3.4, model: 'homeB_red' },
  { id: 'h_r3',         px: [524, 232], rotDeg: 108, scale: 3.2, model: 'homeA_red' },
  { id: 'h_r4',         px: [562, 200], rotDeg: 115, scale: 3.2, model: 'homeB_yellow' },
  { id: 'h_r5',         px: [438, 352], rotDeg: 140, scale: 3.2, model: 'homeB_yellow' },
  { id: 'h_r6',         px: [474, 336], rotDeg: 148, scale: 3.2, model: 'homeA_red' },
  { id: 'h_r7',         px: [508, 316], rotDeg: 130, scale: 3.2, model: 'homeB_blue' },

  // --- Hof mit Obstwiese (oben links) ----------------------------------
  { id: 'farm_barn',    px: [100, 130], rotDeg:  10, scale: 4.0, model: 'homeA_red' },
  { id: 'farm_house',   px: [ 60,  85], rotDeg: -10, scale: 3.6, model: 'homeB_yellow' },
  { id: 'farm_stable',  px: [120, 170], rotDeg:  20, scale: 3.0, model: 'homeB_red' },

  // --- Muehle am Fluss (nach Norden rueber, nicht im Wasser) -----------
  { id: 'watermill',    px: [370, 268], rotDeg: 10,  scale: 4.0, model: 'watermill' },

  // --- Kleiner Zwischenhof suedlich (zwischen Dorf und Burg) ----------
  { id: 'h_south_1',    px: [178, 442], rotDeg:  10, scale: 3.2, model: 'homeA_red' },
  { id: 'h_south_2',    px: [214, 462], rotDeg:  30, scale: 3.2, model: 'homeB_blue' },

  // --- Haus ganz westlich am Dorfrand ---------------------------------
  { id: 'h_west_1',     px: [ 45, 365], rotDeg:   0, scale: 3.2, model: 'homeB_yellow' },
  { id: 'h_west_2',     px: [ 22, 394], rotDeg:  20, scale: 3.0, model: 'homeA_blue' },
  { id: 'h_west_3',     px: [ 72, 338], rotDeg:  -5, scale: 3.0, model: 'homeA_red' },
];

// -------------------------------------------------------------------------
// FELDER (gepfluegt) oben Mitte/rechts.
// -------------------------------------------------------------------------
export const FIELDS = [
  { px: [240,  60], w: 110, h: 110, furrowDeg:  12 },
  { px: [360,  55], w: 100, h: 100, furrowDeg: -10 },
  { px: [465,  70], w:  90, h:  90, furrowDeg:  18 },
  { px: [330, 160], w: 140, h:  70, furrowDeg:   0 },
];

// -------------------------------------------------------------------------
// OBSTWIESE (Streuobst) links oben — Rasterposition fuer Obstbaeume.
// -------------------------------------------------------------------------
export const ORCHARD = {
  px: [55, 155], w: 110, h: 110, rows: 5, cols: 5,
};

// -------------------------------------------------------------------------
// WALDGRUPPEN — Zentrum + Radius; Verteilung + Baumart erfolgt in
// scatterNature. 'leafy'-Flag kennzeichnet Gruppen, die ueberwiegend
// aus Laubbaeumen bestehen sollen (passt zur Karte).
// -------------------------------------------------------------------------
export const FOREST_PATCHES = [
  // rechter Waldring (Laubbaeume dominieren, Tannen am Rand)
  { px: [600, 350], r: 150, density: 1.1, leafy: 0.75 },
  { px: [660, 220], r: 120, density: 1.0, leafy: 0.70 },
  { px: [670, 420], r:  90, density: 1.0, leafy: 0.75 },
  // oberer Wald (Nordhang -> Tannen dominieren)
  { px: [460, 180], r:  80, density: 0.9, leafy: 0.45 },
  { px: [560,  70], r: 120, density: 0.9, leafy: 0.35 },
  // links unten (Mischwald)
  { px: [ 70, 460], r: 100, density: 0.9, leafy: 0.60 },
  { px: [ 45, 290], r:  60, density: 0.7, leafy: 0.65 },
  // nordwestliche Baumgruppen (Laubbaeume rund ums Dorf)
  { px: [195,  55], r:  70, density: 0.7, leafy: 0.85 },
  // kleiner Hain zwischen Dorf und Burg (Laub)
  { px: [100, 410], r:  45, density: 0.6, leafy: 0.85 },
  // ergaenzende Baum-Cluster im unteren Bereich der Karte
  { px: [310, 465], r:  45, density: 0.5, leafy: 0.80 },
  { px: [395, 430], r:  55, density: 0.6, leafy: 0.70 },
];

// -------------------------------------------------------------------------
// BURG (Burghuegel + Palisade + Bergfried) — unten links.
// -------------------------------------------------------------------------
export const CASTLE = {
  px: [150, 435],
  moundRadius: 22,
  moundHeight: 2.4,
  palisadeRadius: 18,
  keep: {
    size: 1.8,
    height: 5.2,
    roofHeight: 3.2,
  },
  gateDeg: 45,
};

// -------------------------------------------------------------------------
// Utility: Distanz Punkt -> Polyliniensegment (in Pixelkoordinaten).
// -------------------------------------------------------------------------
function distToSegPx(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
export function distanceToPolyWorld(wx, wz, pts) {
  let dMin = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = toWorldX(a[0]), az = toWorldZ(a[1]);
    const bx = toWorldX(b[0]), bz = toWorldZ(b[1]);
    const d = distToSegPx(wx, wz, ax, az, bx, bz);
    if (d < dMin) dMin = d;
  }
  return dMin;
}

export function distanceToPaths(wx, wz) {
  let dMin = Infinity;
  for (const p of PATHS) {
    const d = distanceToPolyWorld(wx, wz, p.pts) - p.width * 0.5;
    if (d < dMin) dMin = d;
  }
  return Math.max(0, dMin);
}

export function distanceToRivers(wx, wz) {
  let dMin = Infinity;
  for (const poly of [RIVER_MAIN, RIVER_NORTH, RIVER_SOUTH]) {
    const d = distanceToPolyWorld(wx, wz, poly);
    if (d < dMin) dMin = d;
  }
  return dMin;
}

export function distanceToCastle(wx, wz) {
  const cx = toWorldX(CASTLE.px[0]);
  const cz = toWorldZ(CASTLE.px[1]);
  return Math.hypot(wx - cx, wz - cz);
}

export function orchardPositions() {
  const o = ORCHARD;
  const cx = o.px[0], cy = o.px[1];
  const stepX = o.w / (o.cols - 1);
  const stepY = o.h / (o.rows - 1);
  const pts = [];
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const jx = (Math.sin(r * 3.1 + c * 1.3) + Math.cos(c * 2.2 - r)) * 4;
      const jy = (Math.sin(r * 1.7 - c * 2.4) + Math.cos(c * 1.1 + r * 3.0)) * 4;
      const px = cx - o.w / 2 + c * stepX + jx;
      const py = cy - o.h / 2 + r * stepY + jy;
      pts.push({ x: toWorldX(px), z: toWorldZ(py) });
    }
  }
  return pts;
}

export function fieldRectsWorld() {
  return FIELDS.map((f) => ({
    cx: toWorldX(f.px[0]),
    cz: toWorldZ(f.px[1]),
    w: f.w * PX_SCALE,
    d: f.h * PX_SCALE,
    furrowDeg: f.furrowDeg,
  }));
}

export function isInField(wx, wz) {
  const rects = fieldRectsWorld();
  for (const r of rects) {
    if (Math.abs(wx - r.cx) < r.w / 2 && Math.abs(wz - r.cz) < r.d / 2) return true;
  }
  return false;
}

export function castleWorld() {
  return {
    cx: toWorldX(CASTLE.px[0]),
    cz: toWorldZ(CASTLE.px[1]),
    moundR: CASTLE.moundRadius * PX_SCALE,
    palR: CASTLE.palisadeRadius * PX_SCALE,
    height: CASTLE.moundHeight,
    keep: CASTLE.keep,
    gateDeg: CASTLE.gateDeg,
  };
}
