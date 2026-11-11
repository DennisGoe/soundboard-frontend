// Deko: belebt das Dorf zwischen den Haeusern.
// Alles streng pooled (InstancedMesh) um Draw-Calls low zu halten.
//
// Kategorien:
//   A) Hof-Props (Barrel, Crate, Sack, Pallet, Wheelbarrow, Bucket, Ladder):
//      KayKit-Modelle ueber poolAsset() pro Modell gebündelt (1-2 Draws/Modell).
//   B) Gaerten hinter/neben Haeusern — Zaun, Gemuesebeete, Blumen (alles instanziert).
//   C) Blumentöpfe an Fassaden.
//   D) Heuballen, Holzstapel (Scheite instanziert).
//   E) Wäscheleinen (Seil + Textil-Instanzen).
//   F) Bienenstoecke, Huehnerstall.
//   G) Marktstaende am Platz (Pfosten + Ladentisch + Markise).
//   H) Baenke, Wegweiser, kleine Dorflaternen am Weg.
//   I) Flussdeko: Steg + Boot, Schilf, Seerosen, Steine am Ufer.
//   J) Vogelscheuchen + Feldzäune.
//   K) Natur: Stuempfe, Pilze, Bueschel, Buesche, Rasenbuendel.
//
// Keine zusätzlichen PointLights (Deko ist komplett "cold" — nur emissive Farbe
// an Markisen-Laternen).
//
// Ergebnis: addDecorRects wird in excludeRects fuer Wald/Felsen reingeladen,
// damit nix in die Gaerten/Staende waechst.

import * as THREE from 'three';
import { spawn, placeOnGround } from './assets.js';
import { sampleHeight } from './terrain.js';
import { finalizeInstanced } from './instancedHelpers.js';
import {
  HOUSES, PATHS, toWorldX, toWorldZ, distanceToPaths, distanceToRivers,
  RIVER_MAIN, RIVER_NORTH, RIVER_SOUTH, FIELDS, PX_SCALE, isInField,
} from './mapLayout.js';
import { distanceToHousePaths } from './housePaths.js';
import { PALETTE } from '../palette.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// ---------- Shared Materials (wenig Shader-Programme) ----------------------

const MATS = {
  wood:        new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.95 }),
  woodDark:    new THREE.MeshStandardMaterial({ color: 0x3b2514, roughness: 0.95 }),
  woodLight:   new THREE.MeshStandardMaterial({ color: 0x8a6134, roughness: 0.9 }),
  stone:       new THREE.MeshStandardMaterial({ color: 0x5f6673, roughness: 0.95 }),
  dirt:        new THREE.MeshStandardMaterial({ color: 0x3b2d20, roughness: 1.0 }),
  leafDark:    new THREE.MeshStandardMaterial({ color: 0x2a4330, roughness: 0.95 }),
  leafLight:   new THREE.MeshStandardMaterial({ color: 0x55805a, roughness: 0.95 }),
  cabbage:     new THREE.MeshStandardMaterial({ color: 0x426a3c, roughness: 0.9 }),
  pumpkin:     new THREE.MeshStandardMaterial({ color: 0xc46b1e, roughness: 0.85 }),
  carrot:      new THREE.MeshStandardMaterial({ color: 0x5c8a2e, roughness: 0.95 }),
  flowerRed:   new THREE.MeshStandardMaterial({ color: 0xc44848, roughness: 0.9 }),
  flowerYel:   new THREE.MeshStandardMaterial({ color: 0xd9bf52, roughness: 0.9 }),
  flowerBlue:  new THREE.MeshStandardMaterial({ color: 0x5a7bcc, roughness: 0.9 }),
  hay:         new THREE.MeshStandardMaterial({ color: 0xa88845, roughness: 1.0 }),
  cloth:       new THREE.MeshStandardMaterial({ color: 0xd9d4bc, roughness: 1.0, side: THREE.DoubleSide }),
  clothRed:    new THREE.MeshStandardMaterial({ color: 0xa44848, roughness: 1.0, side: THREE.DoubleSide }),
  clothBlue:   new THREE.MeshStandardMaterial({ color: 0x4868a4, roughness: 1.0, side: THREE.DoubleSide }),
  clothGreen:  new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 1.0, side: THREE.DoubleSide }),
  rope:        new THREE.MeshStandardMaterial({ color: 0x8a6134, roughness: 1.0 }),
  mushroomCap: new THREE.MeshStandardMaterial({ color: 0xaa3030, roughness: 0.9 }),
  mushroomStem:new THREE.MeshStandardMaterial({ color: 0xd8cfae, roughness: 0.9 }),
  bush:        new THREE.MeshStandardMaterial({ color: 0x3a583d, roughness: 1.0 }),
  reed:        new THREE.MeshStandardMaterial({ color: 0x3d5a46, roughness: 1.0 }),
  lily:        new THREE.MeshStandardMaterial({ color: 0x264a3e, roughness: 1.0 }),
  lilyFlower:  new THREE.MeshStandardMaterial({ color: 0xcfb4d9, roughness: 1.0 }),
  candle:      new THREE.MeshStandardMaterial({
    color: PALETTE.lanternGlow, emissive: PALETTE.lanternHot,
    emissiveIntensity: 4.5, roughness: 0.4,
  }),
};

// ---------- Hilfen ----------------------------------------------------------

function inAnyRect(x, z, rects, extra = 0) {
  for (const r of rects) {
    if (Math.abs(x - r.x) < r.w / 2 + (r.pad ?? 0) + extra &&
        Math.abs(z - r.z) < r.d / 2 + (r.pad ?? 0) + extra) return true;
  }
  return false;
}

// Pool eines KayKit-GLTFs: bake sub-meshes als InstancedMesh pro Submesh/Material.
// Optional: procType (z.B. 'prop.barrel') — dann wird procMeta auf group.userData
// gelegt, damit der Editor jede Instanz anklickbar machen kann.
function poolAsset(name, placements, { procType = null, procPrefix = null } = {}) {
  const src = spawn(name);
  src.updateMatrixWorld(true);
  // Modell-BBox (unrotiert)
  const bbox = new THREE.Box3().setFromObject(src);
  const baseMinY = bbox.min.y;
  const group = new THREE.Group();
  group.name = 'pool_' + name;
  const allInstanced = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const baked = o.geometry.clone();
    baked.applyMatrix4(o.matrixWorld);
    const inst = new THREE.InstancedMesh(baked, o.material, placements.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      const y = pl.y ?? sampleHeight(pl.x, pl.z);
      const scl = pl.scale ?? 1;
      _p.set(pl.x, y - baseMinY * scl, pl.z);
      _q.setFromAxisAngle(UP, pl.rotY ?? 0);
      _s.setScalar(scl);
      _m.compose(_p, _q, _s);
      inst.setMatrixAt(i, _m);
    }
    finalizeInstanced(inst);
    group.add(inst);
    allInstanced.push(inst);
  });
  // procMeta: fuer Editor-Picker. Gleiche Reihenfolge wie placements.
  if (procType && procPrefix) {
    const meta = placements.map((pl, i) => ({
      id: procPrefix + i,
      type: procType,
      asset: name,              // Editor-Materialisierung spawnt per name
      x: pl.x, z: pl.z,
      y: pl.y,                  // kann undefined sein -> sampleHeight
      rotY: pl.rotY ?? 0,
      scale: pl.scale ?? 1,
      baseMinY,
    }));
    group.userData.procMeta = {
      instancedMeshes: allInstanced,
      meta,
      procType,
    };
  }
  return group;
}

// Pool einer Primitive-Geometrie mit Matrix pro Instance
function poolPrim(geo, mat, matrices) {
  if (matrices.length === 0) return null;
  const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
  inst.castShadow = true;
  inst.receiveShadow = true;
  for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
  finalizeInstanced(inst);
  return inst;
}

function matTRS(x, y, z, rotY, sx, sy, sz) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

function matBoxRotYZ(x, y, z, rotY, tiltX, sx, sy, sz) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, rotY, 0, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

// Seed-basierte Random
let _rng = 1;
function rng() {
  _rng = (_rng * 9301 + 49297) % 233280;
  return _rng / 233280;
}
function rngReset(s) { _rng = s; }

// ---------- Hauptfunktion ---------------------------------------------------

export function placeDecor(world, { placedHouses, occupiedRects }) {
  rngReset(1337);
  const group = new THREE.Group();
  group.name = 'decor';

  // Decor-Rects (werden excludeRects hinzugefuegt, damit Baeume/Felsen nicht reinwachsen)
  const decorRects = [];

  // Helper: Platz frei fuer Deko?
  const isFreeSpot = (x, z, pad = 0.2) => {
    if (inAnyRect(x, z, occupiedRects, pad)) return false;
    if (distanceToPaths(x, z) < 0.6) return false;
    if (distanceToRivers(x, z) < 1.3) return false;
    if (isInField(x, z)) return false;
    return true;
  };

  // =========================================================================
  // A) Hof-Props um jedes Haus (gepooled per Modell)
  // =========================================================================
  const propPl = {
    barrel: [], crate_A_big: [], crate_A_small: [],
    sack: [], pallet: [], wheelbarrow: [], bucket_water: [],
    ladder: [], flag_blue: [],
  };

  // Welche Haeuser bekommen Flaggen? (Tavern, Market, Blacksmith immer)
  const flagIds = new Set(['h_tavern', 'market', 'h_blacksmith']);

  for (const h of placedHouses) {
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    const hw = h.bboxW * 0.5, hd = h.bboxD * 0.5;
    const outR = Math.max(hw, hd) + 0.45;

    // 2 Side-Props pro Haus
    const sideSlots = [
      { ox: -outR, oz:  hd * 0.3 },
      { ox: -outR, oz: -hd * 0.3 },
      { ox:  outR * 0.85, oz: hd * 0.7 },
    ];
    const propChoices = ['barrel', 'crate_A_small', 'sack', 'pallet', 'bucket_water'];
    const propCount = 2 + Math.floor(rng() * 2); // 2-3 pro Haus
    for (let i = 0; i < propCount; i++) {
      const slot = sideSlots[i % sideSlots.length];
      const jx = (rng() - 0.5) * 0.3;
      const jz = (rng() - 0.5) * 0.3;
      const px = h.x + right.x * slot.ox + fwd.x * slot.oz + jx;
      const pz = h.z + right.z * slot.ox + fwd.z * slot.oz + jz;
      if (!isFreeSpot(px, pz, 0.1)) continue;
      const key = propChoices[Math.floor(rng() * propChoices.length)];
      propPl[key].push({
        x: px, z: pz,
        rotY: h.rotY + (rng() - 0.5) * 1.2,
        scale: 0.55 + rng() * 0.15,
      });
    }

    // 25% der Haeuser: Schubkarre neben der Tuer
    if (rng() < 0.25) {
      const px = h.x + fwd.x * (hd + 0.6) + right.x * (hw * 0.3);
      const pz = h.z + fwd.z * (hd + 0.6) + right.z * (hw * 0.3);
      if (isFreeSpot(px, pz, 0.1)) {
        propPl.wheelbarrow.push({
          x: px, z: pz,
          rotY: h.rotY + Math.PI / 2 + (rng() - 0.5) * 0.4,
          scale: 0.55,
        });
      }
    }
    // 10% groesseres Lager: zusaetzlich crate_A_big
    if (rng() < 0.15) {
      const px = h.x + right.x * (-outR - 0.3) + fwd.x * (-hd * 0.3);
      const pz = h.z + right.z * (-outR - 0.3) + fwd.z * (-hd * 0.3);
      if (isFreeSpot(px, pz, 0.1)) {
        propPl.crate_A_big.push({
          x: px, z: pz,
          rotY: h.rotY + (rng() - 0.5) * 0.6,
          scale: 0.55,
        });
      }
    }
    // 15% Leiter an der Seite
    if (rng() < 0.18) {
      const px = h.x + right.x * (outR + 0.1);
      const pz = h.z + right.z * (outR + 0.1);
      if (isFreeSpot(px, pz, 0.05)) {
        propPl.ladder.push({
          x: px, z: pz,
          rotY: h.rotY + Math.PI / 2,
          scale: 0.6,
        });
      }
    }
    // Flaggen nur an ausgewaehlten Haeusern
    if (flagIds.has(h.id)) {
      const px = h.x + fwd.x * (hd + 0.2);
      const pz = h.z + fwd.z * (hd + 0.2);
      propPl.flag_blue.push({
        x: px, z: pz,
        rotY: h.rotY + Math.PI / 2,
        scale: 0.6,
      });
    }
  }
  // Prop-Pools mit procMeta — pro Asset-Name auf catalog-Type mappen.
  const PROP_TYPE_MAP = {
    barrel:        'prop.barrel',
    crate_A_big:   'prop.crate_big',
    crate_A_small: 'prop.crate_small',
    sack:          'prop.sack',
    pallet:        'prop.pallet',
    wheelbarrow:   'prop.wheelbarrow',
    bucket_water:  'prop.bucket',
    ladder:        'prop.ladder',
    flag_blue:     'prop.flag_blue',
  };
  const procPickerSources = [];
  for (const [name, plist] of Object.entries(propPl)) {
    if (plist.length === 0) continue;
    const procType = PROP_TYPE_MAP[name];
    const procPrefix = procType ? 'p:' + procType + ':' : null;
    const pool = poolAsset(name, plist, { procType, procPrefix });
    group.add(pool);
    if (pool.userData.procMeta) procPickerSources.push(pool);
  }

  // =========================================================================
  // B) Gaerten hinter/neben den Haeusern
  // =========================================================================
  // Pro Wohnhaus wird versucht, einen Garten zu platzieren. Wir probieren
  // mehrere Richtungen (back/left/right/front) und mehrere Groessen, bis einer
  // passt. Das gaerten-rejection-Problem vorher war: isFreeSpot(cx,cz,gW/2)
  // addierte den halben Garten-Radius als pad auf jede Haus-Box; die Garten-
  // mitte lag dadurch IM Verbotszonen-Ring des eigenen Hauses und wurde
  // sofort verworfen.
  // Jetzt: eigene Haus-Box wird explizit ausgeschlossen; getestet wird die
  // tatsaechliche Garten-Rechtecksflaeche (5 Samples) gegen alle ANDEREN
  // occupiedRects + Wege + Fluesse + Felder.

  const postMats = [];
  const railMats = [];
  const bedDirtMats = [];
  const cabbageMats = [];
  const pumpkinMats = [];
  const carrotMats = [];
  const gateMats = [];

  // Geometrien (gemeinsam genutzt). Deutlich chunkier als vorher, damit Gaerten
  // auch aus Startansicht + Dorfansicht klar erkennbar sind.
  const postGeo = new THREE.BoxGeometry(0.10, 0.80, 0.10);
  const railGeo = new THREE.BoxGeometry(1.0, 0.07, 0.07); // wird pro-Instance skaliert
  const bedDirtGeo = new THREE.BoxGeometry(1.0, 0.08, 1.0);
  const cabbageGeo = new THREE.IcosahedronGeometry(0.16, 0);
  const pumpkinGeo = new THREE.SphereGeometry(0.19, 8, 6);
  const carrotGeo = new THREE.ConeGeometry(0.09, 0.25, 6);
  const gateGeo = new THREE.BoxGeometry(0.5, 0.55, 0.05);

  // Helleres, warmes Holz fuer den Zaun (hebt sich gegen das Gras ab).
  const fenceWoodMat = new THREE.MeshStandardMaterial({ color: 0xa47638, roughness: 0.95 });
  // Dunklerer Beet-Erde-Ton (noch deutlicher Kontrast zum Gras).
  const bedDirtMat = new THREE.MeshStandardMaterial({ color: 0x2a1c0f, roughness: 1.0 });
  // Kraeftigere Pflanzenfarbe (wird im Mondlicht klar sichtbar).
  const cabbageMatVivid = new THREE.MeshStandardMaterial({ color: 0x6fae45, roughness: 0.9, emissive: 0x16321a, emissiveIntensity: 0.25 });
  const pumpkinMatVivid = new THREE.MeshStandardMaterial({ color: 0xd97718, roughness: 0.85, emissive: 0x3a1b05, emissiveIntensity: 0.25 });
  const carrotMatVivid  = new THREE.MeshStandardMaterial({ color: 0x7ab53d, roughness: 0.95, emissive: 0x16321a, emissiveIntensity: 0.3 });

  const gardenCount = { done: 0 };
  let firstGardenPos = null;
  const gardenReasons = { tried: 0, placed: 0, rejectAllSizes: 0 };

  // Haus-Zentrum-Index fuer "own rect"-Lookup via Koordinate.
  const sameRectAsHouse = (r, h) =>
    Math.abs(r.x - h.x) < 0.02 && Math.abs(r.z - h.z) < 0.02;

  // Testet, ob eine Garten-Rechtecksflaeche (Zentrum cx,cz, Groesse gW x gD,
  // orientiert in fwd/right) frei ist (ignoriert das eigene Haus).
  function gardenFits(cx, cz, gW, gD, fwd, right, ownHouse) {
    // 5 Samples: Zentrum + 4 Ecken (Haus-lokale Koordinaten)
    const samples = [
      [ 0,    0   ],
      [-0.5, -0.5], [ 0.5, -0.5], [-0.5,  0.5], [ 0.5,  0.5],
      [-0.5,  0  ], [ 0.5,  0  ], [ 0,   -0.5], [ 0,    0.5],
    ];
    for (const [sx, sz] of samples) {
      const ex = cx + right.x * gW * sx + fwd.x * gD * sz;
      const ez = cz + right.z * gW * sx + fwd.z * gD * sz;
      // Kollision mit ANDEREN Haeusern/Deko-Rects (nicht dem eigenen).
      for (const r of occupiedRects) {
        if (sameRectAsHouse(r, ownHouse)) continue;
        const hw = r.w * 0.5 + (r.pad ?? 0);
        const hd = r.d * 0.5 + (r.pad ?? 0);
        if (Math.abs(ex - r.x) < hw && Math.abs(ez - r.z) < hd) return false;
      }
      if (distanceToPaths(ex, ez) < 0.35) return false;
      if (distanceToHousePaths(ex, ez) < 0.25) return false;
      if (distanceToRivers(ex, ez) < 1.2) return false;
      if (isInField(ex, ez)) return false;
    }
    return true;
  }

  // Kandidaten-Richtungen in Haus-Local: (backFactor, sideFactor)
  // back = -fwd, side = right. Wir probieren erst "hinten", dann drumherum.
  const dirCandidates = [
    [-1,  0.0], [-1,  0.6], [-1, -0.6],       // hinten / hinten-seite
    [ 0,  1.0], [ 0, -1.0],                   // seitlich
    [ 1,  0.6], [ 1, -0.6],                   // vorne-seitlich (als letzter Ausweg)
  ];
  // Wenn kein Platz mit Standard-Groesse: schrumpfen und erneut versuchen.
  const sizeCandidates = [
    { w: 2.4, d: 1.5 },
    { w: 2.0, d: 1.3 },
    { w: 1.6, d: 1.1 },
    { w: 1.3, d: 0.9 },
  ];

  for (const h of placedHouses) {
    if (h.model === 'market' || h.model === 'temple' || h.model === 'watermill') continue;
    gardenReasons.tried++;

    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    const houseR = Math.max(h.bboxW, h.bboxD) * 0.5;

    // Suche eine passende Position (groesste Groesse zuerst, dann schrumpfen).
    let picked = null;
    for (const sz of sizeCandidates) {
      // 0.25 Puffer zwischen Haus-Wand und Gartenzaun.
      const offF = houseR + sz.d * 0.5 + 0.25;
      const offR = houseR + sz.w * 0.5 + 0.25;
      for (const [bf, sf] of dirCandidates) {
        // Grund-offset
        let cx = h.x + fwd.x * (bf * offF) + right.x * (sf * offR);
        let cz = h.z + fwd.z * (bf * offF) + right.z * (sf * offR);
        // Minimaler Jitter, damit nicht alle exakt im Raster liegen
        const jx = (rng() - 0.5) * 0.15;
        const jz = (rng() - 0.5) * 0.15;
        cx += jx; cz += jz;
        if (gardenFits(cx, cz, sz.w, sz.d, fwd, right, h)) {
          picked = { cx, cz, gW: sz.w, gD: sz.d };
          break;
        }
      }
      if (picked) break;
    }
    if (!picked) { gardenReasons.rejectAllSizes++; continue; }

    const { cx, cz, gW, gD } = picked;
    gardenCount.done++;
    gardenReasons.placed++;
    if (!firstGardenPos) firstGardenPos = { x: cx, z: cz };

    const yGround = sampleHeight(cx, cz);
    decorRects.push({ x: cx, z: cz, w: gW + 0.3, d: gD + 0.3, pad: 0.05 });

    // Garten als EINE Einheit auswaehlbar: unsichtbarer Box-Mesh als Hit-Target.
    // userData.editable mit stabiler procId (nach Haus-ID).
    const gardenHit = new THREE.Mesh(
      new THREE.BoxGeometry(gW, 0.8, gD),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    gardenHit.position.set(cx, yGround + 0.4, cz);
    gardenHit.rotation.y = h.rotY;
    gardenHit.userData.editable = {
      id: 'p:garden:' + h.id,
      type: 'garden',
      scale: 1,
      standardHouseId: null,
      procId: 'p:garden:' + h.id,
      gardenInfo: { cx, cz, gW, gD, rotY: h.rotY },
    };
    gardenHit.name = 'editable:garden:' + h.id;
    group.add(gardenHit);

    // --- Zaun: 4 Seiten mit Pfosten + Horizontallatte
    const sides = [
      { ax:  right.x * gW * 0.5, az:  right.z * gW * 0.5, dx: fwd.x,   dz: fwd.z,   len: gD, axisRot: h.rotY },
      { ax: -right.x * gW * 0.5, az: -right.z * gW * 0.5, dx: fwd.x,   dz: fwd.z,   len: gD, axisRot: h.rotY },
      { ax:  fwd.x * gD * 0.5,   az:  fwd.z * gD * 0.5,   dx: right.x, dz: right.z, len: gW, axisRot: h.rotY + Math.PI / 2 },
      { ax: -fwd.x * gD * 0.5,   az: -fwd.z * gD * 0.5,   dx: right.x, dz: right.z, len: gW, axisRot: h.rotY + Math.PI / 2 },
    ];
    for (let si = 0; si < sides.length; si++) {
      const s = sides[si];
      const halfL = s.len * 0.5;
      const postStep = 0.40;
      const nPosts = Math.max(2, Math.floor(s.len / postStep) + 1);
      for (let k = 0; k < nPosts; k++) {
        const t = -halfL + (k / (nPosts - 1)) * s.len;
        const px = cx + s.ax + s.dx * t;
        const pz = cz + s.az + s.dz * t;
        postMats.push(matTRS(px, yGround + 0.40, pz, s.axisRot, 1, 1, 1));
      }
      // Gate (Tuer) auf der Vorder-Seite (si === 3, vom Haus abgewandt).
      const isGate = (si === 3);
      if (!isGate) {
        for (const railY of [0.26, 0.60]) {
          const mRail = matTRS(cx + s.ax, yGround + railY, cz + s.az, s.axisRot, s.len, 1, 1);
          railMats.push(mRail);
        }
      } else {
        const sideLen = (s.len - 0.55) * 0.5;
        if (sideLen > 0.1) {
          for (const dir of [-1, 1]) {
            const midT = dir * (0.3 + sideLen * 0.5);
            const rpx = cx + s.ax + s.dx * midT;
            const rpz = cz + s.az + s.dz * midT;
            for (const railY of [0.26, 0.60]) {
              railMats.push(matTRS(rpx, yGround + railY, rpz, s.axisRot, sideLen, 1, 1));
            }
          }
          gateMats.push(matTRS(cx + s.ax, yGround + 0.33, cz + s.az, s.axisRot, 1, 1, 1));
        }
      }
    }

    // --- Beete: 2-3 Reihen, zwischen den Zaunseiten
    const nRows = 2 + (rng() < 0.5 ? 1 : 0);
    const rowSpacing = (gD - 0.3) / nRows;
    for (let r = 0; r < nRows; r++) {
      const rowT = -gD * 0.5 + 0.2 + r * rowSpacing + rowSpacing * 0.5;
      const bedLen = gW - 0.35;
      const bx = cx + fwd.x * rowT;
      const bz = cz + fwd.z * rowT;
      bedDirtMats.push(matTRS(bx, yGround + 0.04, bz, h.rotY + Math.PI / 2, bedLen, 1, 0.35));

      const typeChoice = (r + Math.floor(rng() * 3)) % 3;
      const nPlants = Math.max(4, Math.floor(bedLen / 0.22));
      for (let k = 0; k < nPlants; k++) {
        const t = -bedLen * 0.5 + (k / (nPlants - 1)) * bedLen;
        const px = bx + right.x * t;
        const pz = bz + right.z * t;
        const yy = yGround + 0.14;
        if (typeChoice === 0) {
          cabbageMats.push(matTRS(px, yy, pz, rng() * Math.PI, 1, 1, 1));
        } else if (typeChoice === 1) {
          pumpkinMats.push(matTRS(px, yy, pz, rng() * Math.PI, 1, 0.75, 1));
        } else {
          for (let c = 0; c < 2; c++) {
            const ox = (rng() - 0.5) * 0.08;
            const oz = (rng() - 0.5) * 0.08;
            carrotMats.push(matTRS(px + ox, yGround + 0.17, pz + oz, rng() * Math.PI, 1, 1, 1));
          }
        }
      }
    }
  }

  // Zaun + Beete poolen (helles Holz, dunkle Erde, kraeftige Pflanzen)
  const poolCounts = {};
  function trackPool(name, geo, mat, mats) {
    const inst = poolPrim(geo, mat, mats);
    if (inst) { group.add(inst); poolCounts[name] = mats.length; }
    else { poolCounts[name] = 0; }
    return inst;
  }
  trackPool('fencePost', postGeo, fenceWoodMat, postMats);
  trackPool('fenceRail', railGeo, fenceWoodMat, railMats);
  trackPool('bedDirt',   bedDirtGeo, bedDirtMat, bedDirtMats);
  trackPool('cabbage',   cabbageGeo, cabbageMatVivid, cabbageMats);
  trackPool('pumpkin',   pumpkinGeo, pumpkinMatVivid, pumpkinMats);
  trackPool('carrot',    carrotGeo, carrotMatVivid, carrotMats);
  trackPool('gate',      gateGeo, MATS.woodLight, gateMats);

  // =========================================================================
  // C) Blumentoepfe + Blumen vor der Haustuer / an den Seiten
  // =========================================================================
  const potGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.14, 8);
  const flowerBallGeo = new THREE.IcosahedronGeometry(0.07, 0);
  const stemGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4);

  const potMats = [];
  const flowerMatsR = [];
  const flowerMatsY = [];
  const flowerMatsB = [];
  const stemMats = [];

  const potMatClay = new THREE.MeshStandardMaterial({ color: 0x784028, roughness: 1.0 });

  for (const h of placedHouses) {
    if (h.model === 'temple' || h.model === 'watermill') continue;
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    const hd = h.bboxD * 0.5;
    const nPots = 2 + Math.floor(rng() * 2); // 2-3 Topfe
    for (let i = 0; i < nPots; i++) {
      const side = (i === 0 ? -1 : (i === 1 ? 1 : 0));
      const ox = side * (h.bboxW * 0.3);
      const oz = hd + 0.05 + (i === 2 ? 0.18 : 0);
      const px = h.x + right.x * ox + fwd.x * oz;
      const pz = h.z + right.z * ox + fwd.z * oz;
      const yy = sampleHeight(px, pz);
      potMats.push(matTRS(px, yy + 0.07, pz, 0, 1, 1, 1));
      // 2 Blumen pro Topf
      for (let k = 0; k < 2; k++) {
        const ax = (rng() - 0.5) * 0.08;
        const az = (rng() - 0.5) * 0.08;
        const fy = yy + 0.22;
        stemMats.push(matTRS(px + ax, yy + 0.14 + 0.06, pz + az, 0, 1, 1, 1));
        const col = Math.floor(rng() * 3);
        const m = matTRS(px + ax, fy, pz + az, 0, 1, 1, 1);
        if (col === 0) flowerMatsR.push(m);
        else if (col === 1) flowerMatsY.push(m);
        else flowerMatsB.push(m);
      }
    }
  }
  trackPool('pot',       potGeo, potMatClay, potMats);
  trackPool('flowerRed', flowerBallGeo, MATS.flowerRed, flowerMatsR);
  trackPool('flowerYel', flowerBallGeo, MATS.flowerYel, flowerMatsY);
  trackPool('flowerBlue',flowerBallGeo, MATS.flowerBlue, flowerMatsB);
  trackPool('stem',      stemGeo, MATS.carrot, stemMats);

  // =========================================================================
  // D) Heuballen (Zylinder) + Holzstapel (3-4 Scheite geschichtet)
  // =========================================================================
  const hayGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 10);
  const logGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 7);
  const hayMats = [];
  const logMats = [];

  // Heuballen: pro Hof-Haus (Farm/Barn + ein paar random Houses)
  const hayHouses = placedHouses.filter(h =>
    h.id.startsWith('farm') || (h.model !== 'temple' && h.model !== 'market' && rng() < 0.25)
  );
  for (const h of hayHouses) {
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    const side = rng() < 0.5 ? 1 : -1;
    const ox = side * (h.bboxW * 0.5 + 0.9);
    const oz = (rng() - 0.5) * h.bboxD * 0.5;
    const px = h.x + right.x * ox + fwd.x * oz;
    const pz = h.z + right.z * ox + fwd.z * oz;
    if (!isFreeSpot(px, pz, 0.3)) continue;
    const yy = sampleHeight(px, pz);
    // 1-2 Ballen gestapelt
    const n = rng() < 0.4 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const yk = yy + 0.3 + k * 0.55;
      hayMats.push(matBoxRotYZ(px, yk, pz, rng() * Math.PI, Math.PI / 2, 1, 1, 1));
    }
  }
  // Holzstapel: pro Blacksmith + einige random
  const logHouses = placedHouses.filter(h =>
    h.id.includes('blacksmith') || (rng() < 0.18 && h.model !== 'temple' && h.model !== 'market')
  );
  for (const h of logHouses) {
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    const side = rng() < 0.5 ? 1 : -1;
    const ox = side * (h.bboxW * 0.5 + 0.5);
    const oz = (rng() - 0.5) * h.bboxD * 0.6;
    const px = h.x + right.x * ox + fwd.x * oz;
    const pz = h.z + right.z * ox + fwd.z * oz;
    if (!isFreeSpot(px, pz, 0.3)) continue;
    const yy = sampleHeight(px, pz);
    // Holzstapel: 2-3 Scheite auf 2 Ebenen
    const rotStack = h.rotY + Math.PI / 2;
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < 3; c++) {
        const t = -0.25 + c * 0.17;
        const yk = yy + 0.1 + row * 0.17;
        const dx = Math.cos(rotStack) * t * 0; // vertical stack dir
        // orient logs with rotStack
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotStack, Math.PI / 2, 'YXZ'));
        const m = new THREE.Matrix4();
        const offx = Math.sin(rotStack) * t;
        const offz = -Math.cos(rotStack) * t; // orthogonal
        m.compose(new THREE.Vector3(px + offx, yk, pz + offz), q, new THREE.Vector3(1, 1, 1));
        logMats.push(m);
      }
    }
  }
  trackPool('hay', hayGeo, MATS.hay, hayMats);
  trackPool('log', logGeo, MATS.woodDark, logMats);

  // =========================================================================
  // E) Waescheleinen zwischen Nachbarhaeusern
  // =========================================================================
  // Zwei Pfosten am Haus-Rand + Textilien an Sagging-Linie zwischen ihnen.
  // Simpel: pro Paar ein waagrechtes Band (CylinderGeo thin) + 3 Cloth-Planes.
  const lineGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4);
  const clothGeo = new THREE.PlaneGeometry(0.25, 0.3);
  const lineMats = [];
  const clothMats = [];
  // Finde Nachbarn (Distanz 2.0..3.6)
  const usedLine = new Set();
  const pairs = [];
  for (let i = 0; i < placedHouses.length; i++) {
    if (usedLine.has(placedHouses[i].id)) continue;
    for (let j = i + 1; j < placedHouses.length; j++) {
      if (usedLine.has(placedHouses[j].id)) continue;
      const a = placedHouses[i], b = placedHouses[j];
      if (a.model === 'temple' || b.model === 'temple') continue;
      if (a.model === 'market' || b.model === 'market') continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 2.2 && d < 3.6) {
        pairs.push({ a, b, d });
        usedLine.add(a.id); usedLine.add(b.id);
        break;
      }
    }
    if (pairs.length >= 7) break;
  }
  for (const { a, b, d } of pairs) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const ang = Math.atan2(dx, dz); // yaw around y
    const midX = (a.x + b.x) * 0.5;
    const midZ = (a.z + b.z) * 0.5;
    const yAnchor = sampleHeight(midX, midZ) + 1.8;
    // Linie
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, Math.PI / 2, 'YXZ'));
    const mLine = new THREE.Matrix4().compose(
      new THREE.Vector3(midX, yAnchor - 0.05, midZ),
      q,
      new THREE.Vector3(1, d - 0.4, 1),
    );
    lineMats.push(mLine);
    // Cloth-Stuecke: 3 Stueck mit Sag
    const nCloth = 3;
    for (let k = 0; k < nCloth; k++) {
      const tt = (k + 0.5) / nCloth;
      const cx = a.x + dx * tt;
      const cz = a.z + dz * tt;
      const sag = Math.sin(Math.PI * tt) * 0.1;
      const yy = yAnchor - sag - 0.1;
      // hing: Plane vertikal
      const qc = new THREE.Quaternion().setFromAxisAngle(UP, ang + Math.PI / 2);
      const mC = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, yy, cz),
        qc,
        new THREE.Vector3(1, 1, 1),
      );
      clothMats.push(mC);
    }
  }
  trackPool('line', lineGeo, MATS.rope, lineMats);
  if (clothMats.length > 0) {
    // Alternierende Stoff-Farben: spalte in 3 Pools
    const red = [], blue = [], white = [];
    for (let i = 0; i < clothMats.length; i++) {
      (i % 3 === 0 ? red : (i % 3 === 1 ? blue : white)).push(clothMats[i]);
    }
    trackPool('clothRed',  clothGeo, MATS.clothRed, red);
    trackPool('clothBlue', clothGeo, MATS.clothBlue, blue);
    trackPool('cloth',     clothGeo, MATS.cloth, white);
  } else {
    poolCounts.clothRed = 0; poolCounts.clothBlue = 0; poolCounts.cloth = 0;
  }

  // =========================================================================
  // F) Bienenstoecke (Stacked-Disk-Zylinder) + einfache Huehnerstaelle
  // =========================================================================
  // Bienenkoerbe: 2 abgeflachte Zylinder uebereinander, bauchiger Look.
  const hiveGeo = (() => {
    const g = new THREE.CylinderGeometry(0.22, 0.28, 0.45, 10);
    return g;
  })();
  const hiveTopGeo = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const hiveMat = new THREE.MeshStandardMaterial({ color: 0x9a7a40, roughness: 1.0 });
  const hiveMats = [];
  const hiveTopMats = [];
  // Bienenkoerbe: beim Farm-Haus (farm_house) + an einem Suedwest-Haus
  const hiveSpots = placedHouses.filter(h => h.id === 'farm_house' || h.id === 'farm_barn');
  for (const h of hiveSpots) {
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    for (let k = 0; k < 3; k++) {
      const ox = (h.bboxW * 0.5 + 0.7);
      const oz = -h.bboxD * 0.4 + k * 0.45;
      const px = h.x + right.x * ox + fwd.x * oz;
      const pz = h.z + right.z * ox + fwd.z * oz;
      if (!isFreeSpot(px, pz, 0.2)) continue;
      const yy = sampleHeight(px, pz);
      hiveMats.push(matTRS(px, yy + 0.22, pz, 0, 1, 1, 1));
      hiveTopMats.push(matTRS(px, yy + 0.44, pz, 0, 1, 1, 1));
    }
  }
  trackPool('hive',    hiveGeo, hiveMat, hiveMats);
  trackPool('hiveTop', hiveTopGeo, hiveMat, hiveTopMats);

  // Huehnerstall: beim Farm-Haus (prozedural kleine Kiste + Rampe) — nur 2 Stueck
  const coopBoxGeo = new THREE.BoxGeometry(0.9, 0.5, 0.7);
  const coopRoofGeo = new THREE.BoxGeometry(1.0, 0.04, 0.8);
  const coopPoleGeo = new THREE.BoxGeometry(0.04, 0.5, 0.04);
  const coopBoxMats = [];
  const coopRoofMats = [];
  const coopPoleMats = [];
  const coopSpots = placedHouses.filter(h => h.id === 'farm_barn' || h.id === 'farm_stable');
  for (const h of coopSpots) {
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, h.rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    const ox = -(h.bboxW * 0.5 + 1.0);
    const oz = -h.bboxD * 0.1;
    const px = h.x + right.x * ox + fwd.x * oz;
    const pz = h.z + right.z * ox + fwd.z * oz;
    if (!isFreeSpot(px, pz, 0.4)) continue;
    const yy = sampleHeight(px, pz);
    coopBoxMats.push(matTRS(px, yy + 0.25, pz, h.rotY, 1, 1, 1));
    coopRoofMats.push(matTRS(px, yy + 0.52, pz, h.rotY, 1, 1, 1));
    // vier Pfosten als Hühner-Zaun
    for (const [sx, sz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) {
      const pcx = px + right.x * sx + fwd.x * sz;
      const pcz = pz + right.z * sx + fwd.z * sz;
      coopPoleMats.push(matTRS(pcx, yy + 0.25, pcz, h.rotY, 1, 1, 1));
    }
    decorRects.push({ x: px, z: pz, w: 1.4, d: 1.1, pad: 0.1 });
  }
  trackPool('coopBox',  coopBoxGeo,  MATS.wood,     coopBoxMats);
  trackPool('coopRoof', coopRoofGeo, MATS.woodDark, coopRoofMats);
  trackPool('coopPole', coopPoleGeo, MATS.wood,     coopPoleMats);

  // =========================================================================
  // G) Marktstaende am Platz (4 Stueck um den Brunnen)
  // =========================================================================
  // Jeder Stand: 4 Pfosten + Ladentisch + Markise (schraege Plane).
  // Shared Geos.
  const stallPostGeo = new THREE.BoxGeometry(0.08, 1.4, 0.08);
  const stallTableGeo = new THREE.BoxGeometry(1.4, 0.08, 0.7);
  const stallCanopyGeo = new THREE.PlaneGeometry(1.5, 0.95);
  const stallCandleGeo = new THREE.SphereGeometry(0.06, 8, 6);

  const stallPostMats = [];
  const stallTableMats = [];
  const stallCanopyMatsR = [];
  const stallCanopyMatsG = [];
  const stallCanopyMatsB = [];
  const stallCandleMats = [];

  // Brunnen-Pos: tx0, tz0 in placedHouses finden
  const temple = placedHouses.find(h => h.id === 'temple');
  const wellX = temple ? temple.x + 1.8 : 0;
  const wellZ = temple ? temple.z + 3.0 : 0;

  const stallRadius = 5.0;
  const nStalls = 4;
  for (let i = 0; i < nStalls; i++) {
    const ang = (i / nStalls) * Math.PI * 2 + 0.6;
    const px = wellX + Math.cos(ang) * stallRadius;
    const pz = wellZ + Math.sin(ang) * stallRadius;
    const yy = sampleHeight(px, pz);
    const rotY = ang + Math.PI / 2; // Front zum Brunnen
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);

    // Hitbox IMMER anlegen (auch wenn freeSpot-Check scheitert) — jeder Stand
    // soll anklickbar sein (Runde C Punkt 3: ALLE Marktstaende pickbar).
    // Die Hitbox verhindert nicht die Freecheck-Entscheidung fuer die sichtbaren
    // Pfosten/Tisch/Markise — die werden weiter nur bei frei gemalt.
    const stallHitEarly = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.8, 1.0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    stallHitEarly.position.set(px, yy + 1.0, pz);
    stallHitEarly.rotation.y = rotY;
    const stallIdEarly = 'p:stall:' + i;
    stallHitEarly.userData.editable = {
      id: stallIdEarly, type: 'stall', scale: 1,
      standardHouseId: null, procId: stallIdEarly,
      stallInfo: { px, pz, yy, rotY },
    };
    stallHitEarly.name = 'editable:stall:' + i;
    group.add(stallHitEarly);

    // Platz frei fuer sichtbare Teile? Wenn nicht, nur Hitbox behalten.
    if (!isFreeSpot(px, pz, 0.6)) continue;
    decorRects.push({ x: px, z: pz, w: 1.8, d: 1.0, pad: 0.2 });

    // 4 Pfosten (hoch 1.4)
    for (const [sx, sz] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) {
      const ox = right.x * sx + fwd.x * sz;
      const oz = right.z * sx + fwd.z * sz;
      stallPostMats.push(matTRS(px + ox, yy + 0.7, pz + oz, rotY, 1, 1, 1));
    }
    // Ladentisch (vorn, Hoehe 0.8)
    stallTableMats.push(matTRS(px + fwd.x * 0.05, yy + 0.75, pz + fwd.z * 0.05, rotY, 1, 1, 1));
    // Markise: Plane oben, schraeg
    const canopyQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, rotY, 0, 'YXZ'));
    const mCan = new THREE.Matrix4().compose(
      new THREE.Vector3(px, yy + 1.5, pz),
      canopyQ,
      new THREE.Vector3(1, 1, 1),
    );
    const colIdx = i % 3;
    if (colIdx === 0) stallCanopyMatsR.push(mCan);
    else if (colIdx === 1) stallCanopyMatsG.push(mCan);
    else stallCanopyMatsB.push(mCan);
    // Kerze als emissive-only Lichtpunkt
    stallCandleMats.push(matTRS(px + fwd.x * 0.3, yy + 0.84, pz + fwd.z * 0.3, 0, 1, 1, 1));
    // Zusaetzliche Waren auf dem Tisch: ein paar Kisten/Barrels
    propPl.crate_A_small.push({
      x: px - right.x * 0.35,
      z: pz - right.z * 0.35,
      rotY: rotY,
      scale: 0.45,
      y: yy + 0.8,
    });
    propPl.sack.push({
      x: px + right.x * 0.35,
      z: pz + right.z * 0.35,
      rotY: rotY,
      scale: 0.45,
      y: yy + 0.8,
    });
    // Hitbox wurde schon vor dem freeSpot-Check angelegt (siehe oben).
  }
  trackPool('stallPost',    stallPostGeo,   MATS.woodDark,  stallPostMats);
  trackPool('stallTable',   stallTableGeo,  MATS.woodLight, stallTableMats);
  trackPool('stallCanopyR', stallCanopyGeo, MATS.clothRed,  stallCanopyMatsR);
  trackPool('stallCanopyG', stallCanopyGeo, MATS.clothGreen, stallCanopyMatsG);
  trackPool('stallCanopyB', stallCanopyGeo, MATS.clothBlue, stallCanopyMatsB);
  trackPool('stallCandle',  stallCandleGeo, MATS.candle,    stallCandleMats);

  // =========================================================================
  // H) Baenke + Wegweiser
  // =========================================================================
  const benchSeatGeo = new THREE.BoxGeometry(1.0, 0.05, 0.25);
  const benchLegGeo = new THREE.BoxGeometry(0.06, 0.35, 0.22);
  const benchMats = [];
  const benchLegMats = [];
  // 4 Baenke am Platz (jeweils zwischen zwei Staenden)
  for (let i = 0; i < nStalls; i++) {
    const ang = (i / nStalls) * Math.PI * 2 + 0.6 + Math.PI / nStalls;
    const r = stallRadius * 0.75;
    const px = wellX + Math.cos(ang) * r;
    const pz = wellZ + Math.sin(ang) * r;
    if (!isFreeSpot(px, pz, 0.3)) continue;
    const yy = sampleHeight(px, pz);
    const rotY = ang;
    const fwd = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, rotY);
    const right = new THREE.Vector3().crossVectors(UP, fwd);
    benchMats.push(matTRS(px, yy + 0.4, pz, rotY, 1, 1, 1));
    for (const [sx] of [[-0.42], [0.42]]) {
      const ox = right.x * sx;
      const oz = right.z * sx;
      benchLegMats.push(matTRS(px + ox, yy + 0.175, pz + oz, rotY, 1, 1, 1));
    }
  }
  trackPool('benchSeat', benchSeatGeo, MATS.woodLight, benchMats);
  trackPool('benchLeg',  benchLegGeo,  MATS.woodDark,  benchLegMats);

  // Wegweiser: an 3 Kreuzungen (Hauptstrasse)
  const signPostGeo = new THREE.BoxGeometry(0.08, 1.8, 0.08);
  const signPlankGeo = new THREE.BoxGeometry(0.55, 0.14, 0.03);
  const signPostMats = [];
  const signPlankMats = [];
  const signCandidates = [
    { px: PATHS[0].pts[2], rotY: 0.3 },
    { px: PATHS[0].pts[11], rotY: -0.3 },
    { px: PATHS[1].pts[2], rotY: 0.5 },
  ];
  for (const sc of signCandidates) {
    const wx = toWorldX(sc.px[0]) + 1.2;
    const wz = toWorldZ(sc.px[1]) + 0.5;
    if (!isFreeSpot(wx, wz, 0.3)) continue;
    const yy = sampleHeight(wx, wz);
    signPostMats.push(matTRS(wx, yy + 0.9, wz, sc.rotY, 1, 1, 1));
    signPlankMats.push(matTRS(wx, yy + 1.55, wz, sc.rotY, 1, 1, 1));
    signPlankMats.push(matTRS(wx, yy + 1.35, wz, sc.rotY + 0.3, 1, 1, 1));
  }
  trackPool('signPost',  signPostGeo,  MATS.wood,      signPostMats);
  trackPool('signPlank', signPlankGeo, MATS.woodLight, signPlankMats);

  // =========================================================================
  // I) Flussdeko: Steg + Boot, Schilf, Seerosen, Steine am Ufer
  // =========================================================================
  // Schilf entlang des Flusses (viele kleine Grasbuendel knapp am Wasser).
  const reedGeo = new THREE.PlaneGeometry(0.1, 0.5);
  const reedMats = [];
  const reedPolys = [
    { pts: RIVER_MAIN, step: 2.0 },
    { pts: RIVER_NORTH, step: 2.0 },
    { pts: RIVER_SOUTH, step: 2.0 },
  ];
  for (const poly of reedPolys) {
    const pts = poly.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ax = toWorldX(a[0]), az = toWorldZ(a[1]);
      const bx = toWorldX(b[0]), bz = toWorldZ(b[1]);
      const segLen = Math.hypot(bx - ax, bz - az);
      const n = Math.max(2, Math.floor(segLen / poly.step));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const cx = ax + (bx - ax) * t;
        const cz = az + (bz - az) * t;
        // Normale senkrecht zum Segment
        const dx = (bx - ax) / segLen;
        const dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        for (const side of [-1, 1]) {
          const offset = 1.85 + rng() * 0.5; // kurz hinterm Ufer
          const rx = cx + nx * side * offset;
          const rz = cz + nz * side * offset;
          // Cluster: 3-4 Schilfhalme je spot
          for (let c = 0; c < 4; c++) {
            const jx = rx + (rng() - 0.5) * 0.4;
            const jz = rz + (rng() - 0.5) * 0.4;
            if (inAnyRect(jx, jz, occupiedRects, 0)) continue;
            if (distanceToPaths(jx, jz) < 0.5) continue;
            if (distanceToRivers(jx, jz) < 1.55) continue;
            const yy = sampleHeight(jx, jz);
            const ra = rng() * Math.PI * 2;
            reedMats.push(matTRS(jx, yy + 0.25, jz, ra, 1, 1, 1));
            reedMats.push(matTRS(jx, yy + 0.25, jz, ra + Math.PI / 2, 1, 1, 1));
          }
        }
      }
    }
  }
  trackPool('reed', reedGeo, MATS.reed, reedMats);

  // Seerosen auf dem Wasser (dunkler Fluss -> y ~ -0.22)
  const lilyGeo = new THREE.CircleGeometry(0.22, 10);
  const lilyFlowerGeo = new THREE.IcosahedronGeometry(0.06, 0);
  const lilyMats = [];
  const lilyFlowerMats = [];
  for (const poly of reedPolys) {
    const pts = poly.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ax = toWorldX(a[0]), az = toWorldZ(a[1]);
      const bx = toWorldX(b[0]), bz = toWorldZ(b[1]);
      for (let k = 0; k < 2; k++) {
        const t = 0.3 + rng() * 0.4;
        const jx = ax + (bx - ax) * t + (rng() - 0.5) * 1.0;
        const jz = az + (bz - az) * t + (rng() - 0.5) * 1.0;
        // Nur wenn im Wasser
        if (distanceToRivers(jx, jz) > 0.5) continue;
        // Lily-Pad flach auf -0.24 (Wasser bei -0.25)
        const qL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        const mL = new THREE.Matrix4().compose(
          new THREE.Vector3(jx, -0.24, jz),
          qL,
          new THREE.Vector3(1, 1, 1),
        );
        lilyMats.push(mL);
        if (rng() < 0.4) {
          lilyFlowerMats.push(matTRS(jx + (rng() - 0.5) * 0.1, -0.2, jz + (rng() - 0.5) * 0.1, 0, 1, 1, 1));
        }
      }
    }
  }
  trackPool('lily',       lilyGeo,       MATS.lily,       lilyMats);
  trackPool('lilyFlower', lilyFlowerGeo, MATS.lilyFlower, lilyFlowerMats);

  // Ufersteine (klein, instanziert)
  const riverStoneGeo = new THREE.IcosahedronGeometry(0.2, 0);
  const riverStoneMats = [];
  for (const poly of reedPolys) {
    const pts = poly.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ax = toWorldX(a[0]), az = toWorldZ(a[1]);
      const bx = toWorldX(b[0]), bz = toWorldZ(b[1]);
      const segLen = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.floor(segLen / 3.5));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const cx = ax + (bx - ax) * t;
        const cz = az + (bz - az) * t;
        const dx = (bx - ax) / segLen;
        const dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        for (const side of [-1, 1]) {
          const offset = 1.4 + rng() * 0.4;
          const jx = cx + nx * side * offset;
          const jz = cz + nz * side * offset;
          if (inAnyRect(jx, jz, occupiedRects, 0)) continue;
          if (distanceToPaths(jx, jz) < 0.3) continue;
          const yy = sampleHeight(jx, jz);
          const sx = 0.6 + rng() * 0.6;
          const sy = 0.5 + rng() * 0.4;
          const sz = 0.6 + rng() * 0.6;
          const q = new THREE.Quaternion().setFromAxisAngle(UP, rng() * Math.PI * 2);
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(jx, yy + 0.1 * sy, jz), q, new THREE.Vector3(sx, sy, sz),
          );
          riverStoneMats.push(m);
        }
      }
    }
  }
  trackPool('riverStone', riverStoneGeo, MATS.stone, riverStoneMats);

  // Steg + Boot: individuell (nur je 1), je 1-3 Draws.
  // Ort: an einer ruhigen Stelle vom RIVER_MAIN, nah am Dorf (Index 7..8).
  const dockAx = toWorldX(RIVER_MAIN[6][0]);
  const dockAz = toWorldZ(RIVER_MAIN[6][1]);
  const dockBx = toWorldX(RIVER_MAIN[7][0]);
  const dockBz = toWorldZ(RIVER_MAIN[7][1]);
  const dockMx = (dockAx + dockBx) * 0.5;
  const dockMz = (dockAz + dockBz) * 0.5;
  const dockDir = Math.atan2(dockBz - dockAz, dockBx - dockAx);
  const dockNormal = dockDir + Math.PI / 2;

  {
    const dockGroup = new THREE.Group();
    // Shore end + water end
    const shoreOffset = 1.5;
    const waterOffset = -1.0;
    const shoreX = dockMx + Math.cos(dockNormal) * shoreOffset;
    const shoreZ = dockMz + Math.sin(dockNormal) * shoreOffset;
    const waterX = dockMx + Math.cos(dockNormal) * waterOffset;
    const waterZ = dockMz + Math.sin(dockNormal) * waterOffset;
    const shoreY = sampleHeight(shoreX, shoreZ);

    // Platform: ein langes Brett
    const plankMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 2.6),
      MATS.woodLight,
    );
    const platX = (shoreX + waterX) * 0.5;
    const platZ = (shoreZ + waterZ) * 0.5;
    plankMesh.position.set(platX, shoreY + 0.05, platZ);
    plankMesh.rotation.y = dockNormal;
    plankMesh.castShadow = true;
    plankMesh.receiveShadow = true;
    dockGroup.add(plankMesh);
    // 2 Pfosten im Wasser
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6);
    for (const toff of [-0.4, 0.4]) {
      const pp = new THREE.Mesh(poleGeo, MATS.woodDark);
      pp.position.set(
        waterX + Math.cos(dockDir) * toff,
        shoreY + 0.5 - 0.5,
        waterZ + Math.sin(dockDir) * toff,
      );
      dockGroup.add(pp);
    }
    world.add(dockGroup);
    decorRects.push({ x: platX, z: platZ, w: 2.0, d: 2.0, pad: 0.2 });

    // Boot: auf dem Wasser, parallel zum Steg
    const boatGroup = new THREE.Group();
    const boatHull = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 2.0),
      MATS.wood,
    );
    boatHull.position.set(0, 0, 0);
    boatHull.castShadow = true;
    boatGroup.add(boatHull);
    // Boat sides (rand)
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.06, 1.8),
      MATS.woodLight,
    );
    rail.position.set(0.45, 0.17, 0);
    boatGroup.add(rail);
    const rail2 = rail.clone(); rail2.position.x = -0.45; boatGroup.add(rail2);
    boatGroup.position.set(waterX + Math.cos(dockDir) * 1.2, -0.12, waterZ + Math.sin(dockDir) * 1.2);
    boatGroup.rotation.y = dockDir;
    world.add(boatGroup);
  }

  // =========================================================================
  // J) Vogelscheuchen + Feldzaeune
  // =========================================================================
  // Vogelscheuche: Kreuz-Post + Strohkopf (nur 2 insgesamt).
  const scarecrowPosts = [];
  const scarecrowArms = [];
  const scarecrowHeads = [];
  const fieldsW = FIELDS.map(f => ({
    cx: toWorldX(f.px[0]),
    cz: toWorldZ(f.px[1]),
    w: f.w * PX_SCALE,
    d: f.h * PX_SCALE,
  }));
  for (let i = 0; i < Math.min(3, fieldsW.length); i++) {
    const f = fieldsW[i];
    const px = f.cx + (rng() - 0.5) * f.w * 0.4;
    const pz = f.cz + (rng() - 0.5) * f.d * 0.4;
    const yy = sampleHeight(px, pz);
    scarecrowPosts.push(matTRS(px, yy + 0.8, pz, 0, 1, 1, 1));
    scarecrowArms.push(matTRS(px, yy + 1.3, pz, 0, 1, 1, 1));
    scarecrowHeads.push(matTRS(px, yy + 1.65, pz, 0, 1, 1, 1));
  }
  const scarePostGeo = new THREE.BoxGeometry(0.08, 1.6, 0.08);
  const scareArmGeo = new THREE.BoxGeometry(0.9, 0.06, 0.06);
  const scareHeadGeo = new THREE.SphereGeometry(0.18, 8, 8);
  trackPool('scarePost', scarePostGeo, MATS.woodDark, scarecrowPosts);
  trackPool('scareArm',  scareArmGeo,  MATS.woodDark, scarecrowArms);
  trackPool('scareHead', scareHeadGeo, MATS.hay,      scarecrowHeads);

  // Feldzaun ENTFERNT (Aufgabe 8): Felder haben keine Zaeune mehr.
  // Hecken um die Felder liegen in fields.js und bleiben.
  poolCounts.fieldPost = 0; poolCounts.fieldRail = 0;

  // =========================================================================
  // K) Natur: Stuempfe, Pilze, Bueschel am Waldrand & zwischen Haeusern
  // =========================================================================
  const stumpGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.25, 8);
  const mushStemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.09, 6);
  const mushCapGeo = new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const bushGeo = new THREE.IcosahedronGeometry(0.4, 1);

  const stumpMats = [];
  const mushStemMats = [];
  const mushCapMats = [];
  const bushMats = [];

  // Random scatter: dicht ums Dorf (6..30) + weit ueber die Karte (30..65).
  // Die zweite Schicht fuellt die freien Wiesen zwischen Dorf, Burg, Hof und Wald.
  const centerX = temple ? temple.x : 0;
  const centerZ = temple ? temple.z : 0;
  const scatterN = 220;
  for (let i = 0; i < scatterN; i++) {
    const ang = rng() * Math.PI * 2;
    // 55% nah (6..30), 45% weit (30..65) -> ganze Karte abgedeckt
    const nearRoll = rng();
    const rr = nearRoll < 0.55 ? (6 + rng() * 24) : (30 + rng() * 35);
    const px = centerX + Math.cos(ang) * rr;
    const pz = centerZ + Math.sin(ang) * rr;
    if (!isFreeSpot(px, pz, 0.1)) continue;
    if (distanceToHousePaths(px, pz) < 0.3) continue;
    const yy = sampleHeight(px, pz);
    const type = rng();
    if (type < 0.3) {
      // Stumpf
      stumpMats.push(matTRS(px, yy + 0.12, pz, rng() * Math.PI * 2, 1, 1, 1));
      // + 1-3 Pilze am Stumpf
      const nM = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < nM; k++) {
        const ma = rng() * Math.PI * 2;
        const mx = px + Math.cos(ma) * 0.3;
        const mz = pz + Math.sin(ma) * 0.3;
        const my = sampleHeight(mx, mz);
        mushStemMats.push(matTRS(mx, my + 0.045, mz, 0, 1, 1, 1));
        mushCapMats.push(matTRS(mx, my + 0.09, mz, 0, 1, 1, 1));
      }
    } else if (type < 0.7) {
      // Busch
      const sx = 0.6 + rng() * 0.5;
      const sy = 0.55 + rng() * 0.4;
      const sz = 0.6 + rng() * 0.5;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, rng() * Math.PI * 2);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(px, yy + 0.4 * sy, pz), q, new THREE.Vector3(sx, sy, sz),
      );
      bushMats.push(m);
    } else {
      // Pilzgruppe
      for (let k = 0; k < 3; k++) {
        const ma = rng() * Math.PI * 2;
        const mx = px + Math.cos(ma) * 0.2;
        const mz = pz + Math.sin(ma) * 0.2;
        const my = sampleHeight(mx, mz);
        mushStemMats.push(matTRS(mx, my + 0.045, mz, 0, 1, 1, 1));
        mushCapMats.push(matTRS(mx, my + 0.09, mz, 0, 1, 1, 1));
      }
    }
  }
  trackPool('stump',    stumpGeo,    MATS.woodDark,     stumpMats);
  trackPool('mushStem', mushStemGeo, MATS.mushroomStem, mushStemMats);
  trackPool('mushCap',  mushCapGeo,  MATS.mushroomCap,  mushCapMats);
  trackPool('bush',     bushGeo,     MATS.bush,         bushMats);

  // Gesamt-Instanzen aufsummieren
  let decorInstanceTotal = 0;
  for (const k in poolCounts) decorInstanceTotal += poolCounts[k];

  return {
    group, decorRects,
    gardenCount: gardenCount.done,
    gardenReasons,
    firstGardenPos,
    poolCounts,
    decorInstanceTotal,
    procPickerSources, // nur Pools mit procMeta — fuer Editor-Picker
  };
}
