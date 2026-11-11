// Grosses Terrain fuer die Kartenwelt — sanfte Huegel, eingetieftes Flussbett
// mit Boeschung, erhoehter Burghuegel, geglaettete Wege/Platz/Felder.
// Haeuser, Props, Tannen und Gras lesen die Hoehe aus sampleHeight(x, z).

import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import {
  WORLD_W, WORLD_D,
  distanceToPaths, distanceToRivers,
  isInField, castleWorld,
} from './mapLayout.js';
import { sampleHeightDelta } from '../world/heightEdits.js';
import { samplePaint } from '../world/paintEdits.js';

// Terrain-Mesh wird nach createTerrain() hier gehalten — fuer Live-Updates
// aus terrainTool/paintTool (Runde C).
let _terrainMesh = null;
let _baseColorAttr = null;   // Basis-vertex colors (vor Painting), gleicher Buffer
let _baseHeightAttr = null;  // Basis-y der Vertices (vor Terraforming)
// Zuordnung world-(x,z) -> Terrain-Vertex-Index. Fuer schnellen Zugriff bei
// Pinsel-Updates. Da das Terrain ein axial-aligned Grid ist, koennen wir
// per Formel rueckwaerts rechnen.
let _tInfo = null;  // { sx, sz, segsX, segsZ }

/** Liefert das aktuelle Terrain-Mesh (nach createTerrain). */
export function getTerrainMesh() { return _terrainMesh; }
/** Gibt Infos zum Terrain-Grid zurueck. */
export function getTerrainInfo() { return _tInfo; }
export function getBaseColorAttr() { return _baseColorAttr; }
export function getBaseHeightAttr() { return _baseHeightAttr; }

// Konstanten fuer das Flussbett.
const RIVER_HALF_WIDTH = 2.4;      // flacher Bereich ("Wasser")
const RIVER_BANK_WIDTH = 1.6;      // Boeschung ausserhalb
export const RIVER_BED_DEPTH = 1.1; // wie tief wird das Bett gesenkt

// Hoehenanteile: Burghuegel, Grundwellen, Flussbett, Wege, Felder.
function noise2(x, z) {
  // Deutlich flacher — vorher waren die periodischen Sinus-Wellen in der
  // Draufsicht als diagonale Streifen sichtbar. Jetzt nur noch dezentes
  // Welligen, mit asymmetrischen Frequenzen die keine klaren Perioden bilden.
  return (
    Math.sin(x * 0.073 + z * 0.091 + 0.7) * 0.30 +
    Math.sin(x * 0.157 - z * 0.129 - 1.9) * 0.16 +
    Math.sin(x * 0.311 + z * 0.223 + 3.3) * 0.08
  );
}
function smoothstep(a, b, t) {
  const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

// Kastle-Huegel: ein weicher Kegel + leichte Breiterung.
function castleHill(x, z) {
  const c = castleWorld();
  const d = Math.hypot(x - c.cx, z - c.cz);
  // 0..1 falloff ueber moundR * 1.6
  const t = smoothstep(c.moundR * 1.6, 0, d);
  return c.height * t;
}

// Ohne Edits — reines "Basis-Terrain" (brauchen wir fuer Fluss-Guard beim Pinsel).
export function sampleBaseHeight(x, z) {
  return _sampleHeightCore(x, z);
}

function _sampleHeightCore(x, z) {
  // Grundwellen
  let base = noise2(x, z) * 1.2;

  // Dorfkern + Platz flach
  const distCenter = Math.hypot(x + 2.9, z - 1.8);  // am Tempel etwas versetzt
  const centerMask = smoothstep(4.0, 11.0, distCenter);
  base *= centerMask;

  // Wege / Hauptstrassen flach
  const pathD = distanceToPaths(x, z);
  const pathFlat = smoothstep(0.0, 2.4, pathD);
  base *= pathFlat;

  // Felder absolut flach
  if (isInField(x, z)) base *= 0.15;

  // Burghuegel addieren
  base += castleHill(x, z);

  // Aeusserer Huegel-Ring: Terrain steigt ab einer Entfernung an, damit
  // die Berge nahtlos uebergehen (keine sichtbare Kante am Horizont).
  // Startet bei 60% der Karte, steigt sanft an.
  const distFromCenter = Math.max(Math.abs(x), Math.abs(z));
  const outerStart = Math.max(WORLD_W, WORLD_D) * 0.30;   // ab hier beginnt es
  const outerPeak  = Math.max(WORLD_W, WORLD_D) * 0.60;   // Vollhoehe erreicht
  const outerT = smoothstep(outerStart, outerPeak, distFromCenter);
  base += outerT * 6.0;

  // Flussbett ausgraben. Innerhalb der Wasserbreite wird die Hoehe hart auf
  // RIVER_BED_Y gesetzt (nicht nur subtrahiert), damit das Wasser GARANTIERT
  // ueber dem Grund liegt. In der Boeschungszone sanfter Uebergang.
  const rd = distanceToRivers(x, z);
  const RIVER_BED_Y = -1.0;
  if (rd < RIVER_HALF_WIDTH) {
    // Hartes Bett, leichtes Unregelmaessiges-Rauschen fuer Steine im Grund
    const bedNoise = Math.sin(x * 1.3 + z * 0.7) * 0.08;
    base = RIVER_BED_Y + bedNoise;
  } else if (rd < RIVER_HALF_WIDTH + RIVER_BANK_WIDTH) {
    // Smoothe Boeschung: von Wasser-Niveau runter auf unberuehrtes base.
    const t = smoothstep(RIVER_HALF_WIDTH + RIVER_BANK_WIDTH, RIVER_HALF_WIDTH, rd);
    base = THREE.MathUtils.lerp(base, RIVER_BED_Y, t);
  }
  return base;
}

/**
 * sampleHeight = Basis + User-Edits (Terraforming).
 * Fluss wird NICHT angehoben/gesenkt — das harte Bett bleibt dominant.
 */
export function sampleHeight(x, z) {
  const base = _sampleHeightCore(x, z);
  // Nicht im Flussbett erhoehen (dort ist base = -1.0 + noise -> hart).
  const rd = distanceToRivers(x, z);
  if (rd < RIVER_HALF_WIDTH) return base;
  // In der Boeschungszone Edits abschwaechen (sonst Treppenstufen am Ufer).
  let d = sampleHeightDelta(x, z);
  if (rd < RIVER_HALF_WIDTH + RIVER_BANK_WIDTH) {
    const bankMix = smoothstep(RIVER_HALF_WIDTH, RIVER_HALF_WIDTH + RIVER_BANK_WIDTH, rd);
    d *= bankMix;
  }
  return base + d;
}

// -------- Mesh --------------------------------------------------------------

export function createTerrain({ size = null, segs = 320 } = {}) {
  // size hier = XZ-Ausdehnung. Standard orientiert sich an der Karte.
  // Deutlich groesser als die Spielflaeche (WORLD_W+80), damit das
  // ansteigende aeussere Terrain nahtlos in die Berg-Ringe uebergeht
  // und keine sichtbare Kante zwischen Karte und Bergen klafft.
  const sx = size ?? WORLD_W + 100;
  const sz = size ?? WORLD_D + 100;
  const geo = new THREE.PlaneGeometry(sx, sz, segs, Math.round(segs * sz / sx));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);

  const grassBase    = new THREE.Color(PALETTE.grass);
  const grassDark    = new THREE.Color(PALETTE.grassDark);
  const grassLit     = new THREE.Color(PALETTE.grassLit);
  const dirt         = new THREE.Color(PALETTE.dirt);
  const dirtLight    = new THREE.Color(PALETTE.dirtLight);
  const forestFloor  = new THREE.Color(PALETTE.forestFloor);
  const cobble       = new THREE.Color(PALETTE.cobble);
  const tmp = new THREE.Color();

  const cc = castleWorld();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = sampleHeight(x, z);
    pos.setY(i, y);

    // Sehr ruhiger Grasvariations-Ton. Statt mehreren Sinus-Termen (die
    // sichtbare diagonale Streifen erzeugen) nehmen wir fbm-artiges Rauschen
    // mit asymmetrischen Frequenzen, die keine erkennbaren Perioden bilden.
    const nMix =
        Math.sin(x * 0.137 + z * 0.083 + 1.1) * 0.35
      + Math.sin(x * 0.051 - z * 0.071 - 2.3) * 0.25
      + Math.sin(x * 0.293 + z * 0.213 + 4.7) * 0.15;
    tmp.copy(grassBase);
    if (nMix > 0.15) tmp.lerp(grassLit, Math.min(1, (nMix - 0.15) * 0.35));
    else if (nMix < -0.2) tmp.lerp(grassDark, Math.min(1, (-nMix - 0.2) * 0.4));

    // KEIN zufaelliger Erd-Fleckenshader mehr — Erde NUR auf Wegen/Feldern/
    // Burghang/Flussufer. Das macht die grosse Flaeche viel ruhiger.

    // Felder: dunkle Erde mit heller Furchen-Komponente.
    if (isInField(x, z)) {
      tmp.copy(dirt);
      const f = Math.sin(x * 2.2 + z * 1.3) * 0.5 + 0.5;
      tmp.lerp(dirtLight, f * 0.35);
    }

    // Ab Waldbereich: dunkler Waldboden statt helles Gras (dezenter).
    const distCenter = Math.hypot(x, z);
    const forestMask = smoothstep(18.0, 32.0, distCenter);
    tmp.lerp(forestFloor, forestMask * 0.4);

    // Flussnaehe -> dunkler, feuchter Erdrand.
    const rd = distanceToRivers(x, z);
    if (rd < RIVER_HALF_WIDTH + RIVER_BANK_WIDTH + 1.0) {
      const bank = smoothstep(RIVER_HALF_WIDTH + RIVER_BANK_WIDTH + 1.0,
                              RIVER_HALF_WIDTH, rd);
      tmp.lerp(dirt, bank * 0.75);
    }

    // Erdweg-Splat entlang der Pfade.
    const pathD = distanceToPaths(x, z);
    const pathT = smoothstep(1.6, 0.1, pathD);
    if (pathT > 0.01) {
      tmp.lerp(cobble, pathT * 0.35);
      tmp.lerp(dirt,   pathT * 0.55);
    }

    // Burghuegel: dunklere Erde nahe der Palisade.
    const dcc = Math.hypot(x - cc.cx, z - cc.cz);
    if (dcc < cc.moundR * 1.3) {
      const t = smoothstep(cc.moundR * 1.3, cc.moundR * 0.4, dcc);
      tmp.lerp(dirt, t * 0.5);
    }

    col[i * 3 + 0] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';

  // Referenzen fuer Terraforming/Painting halten.
  _terrainMesh = mesh;
  // Basis-Y (unveraendertes Terrain) als Kopie halten.
  // (pos ist weiter oben schon gebunden — hier nicht neu deklarieren!)
  const baseY = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) baseY[i] = pos.getY(i);
  _baseHeightAttr = baseY;
  // Basis-Farben als Kopie halten.
  _baseColorAttr = new Float32Array(col);
  const segsZ = Math.round(segs * sz / sx);
  _tInfo = { sx, sz, segsX: segs, segsZ };
  return mesh;
}

/**
 * Welt-(x, z) -> naechstgelegener Vertex-Index im Terrain-Grid.
 * Terrain-Plane hat segsX+1 Vertices in x, segsZ+1 in z.
 * x=0 ist Mittelpunkt; von -sx/2 bis +sx/2.
 */
export function terrainVertexIndexAt(x, z) {
  if (!_tInfo || !_terrainMesh) return -1;
  const { sx, sz, segsX, segsZ } = _tInfo;
  const u = (x / sx + 0.5) * segsX;    // 0..segsX
  const v = (z / sz + 0.5) * segsZ;    // 0..segsZ
  const i = Math.round(u);
  const j = Math.round(v);
  if (i < 0 || i > segsX || j < 0 || j > segsZ) return -1;
  // PlaneGeometry nach rotateX(-PI/2): row-major ueber (segsZ+1) Zeilen.
  // row 0 ist am NEGATIVEN z-Ende (z = -sz/2) nach rotateX. Vorsicht!
  // In PlaneGeometry: Vertex-Reihenfolge ist y-major (Zeilen). rotateX(-PI/2)
  // swappt y->z. x bleibt. Vertex (i, j) hat Index = j * (segsX+1) + i.
  // Nach rotateX: 'oben' (y=+) wird 'hinten' (z=-). Also row 0 = z=-sz/2.
  // Pruefen: pos.getZ(0) sollte -sz/2 sein. Das setzen wir voraus.
  return j * (segsX + 1) + i;
}

/**
 * Wendet alle aktuellen heightEdits-Deltas auf das Terrain-Mesh an.
 * Nur Vertices in bbox werden neu gesetzt (Performance).
 */
export function refreshTerrainHeights(bbox = null) {
  if (!_terrainMesh || !_tInfo) return;
  const { sx, sz, segsX, segsZ } = _tInfo;
  const pos = _terrainMesh.geometry.attributes.position;

  let i0 = 0, i1 = segsX, j0 = 0, j1 = segsZ;
  if (bbox) {
    i0 = Math.max(0, Math.floor((bbox.minX / sx + 0.5) * segsX));
    i1 = Math.min(segsX, Math.ceil((bbox.maxX / sx + 0.5) * segsX));
    j0 = Math.max(0, Math.floor((bbox.minZ / sz + 0.5) * segsZ));
    j1 = Math.min(segsZ, Math.ceil((bbox.maxZ / sz + 0.5) * segsZ));
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const idx = j * (segsX + 1) + i;
      const x = pos.getX(idx);
      const z = pos.getZ(idx);
      pos.setY(idx, sampleHeight(x, z));
    }
  }
  pos.needsUpdate = true;
  _terrainMesh.geometry.computeVertexNormals();
}

/**
 * Wendet Paint auf die VertexColors des Terrains an. Nur in bbox.
 */
const _tmpColPaint = new THREE.Color();
export function refreshTerrainColors(bbox = null) {
  if (!_terrainMesh || !_tInfo || !_baseColorAttr) return;
  const { sx, sz, segsX, segsZ } = _tInfo;
  const pos = _terrainMesh.geometry.attributes.position;
  const col = _terrainMesh.geometry.attributes.color;

  let i0 = 0, i1 = segsX, j0 = 0, j1 = segsZ;
  if (bbox) {
    i0 = Math.max(0, Math.floor((bbox.minX / sx + 0.5) * segsX));
    i1 = Math.min(segsX, Math.ceil((bbox.maxX / sx + 0.5) * segsX));
    j0 = Math.max(0, Math.floor((bbox.minZ / sz + 0.5) * segsZ));
    j1 = Math.min(segsZ, Math.ceil((bbox.maxZ / sz + 0.5) * segsZ));
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const idx = j * (segsX + 1) + i;
      const x = pos.getX(idx);
      const z = pos.getZ(idx);
      const br = _baseColorAttr[idx * 3];
      const bg = _baseColorAttr[idx * 3 + 1];
      const bb = _baseColorAttr[idx * 3 + 2];
      const paint = samplePaint(x, z, _tmpColPaint);
      if (paint.strength > 0.005 && paint.col) {
        const s = Math.min(1, paint.strength);
        col.setXYZ(idx,
          br * (1 - s) + paint.col.r * s,
          bg * (1 - s) + paint.col.g * s,
          bb * (1 - s) + paint.col.b * s,
        );
      } else {
        col.setXYZ(idx, br, bg, bb);
      }
    }
  }
  col.needsUpdate = true;
}
