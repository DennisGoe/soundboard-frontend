// Dorfaufbau nach mapLayout.HOUSES. Jede Haus-Eintrag spezifiziert ein KayKit-
// Modell (oder 'temple' fuer das zentrale Rathaus). Fenster-Glow + dezente
// Dachlichter pro Haus; Laternen und Lichterketten entlang der Hauptwege.
//
// Performance: wir begrenzen die Anzahl ECHTER PointLights auf maxPointLights
// (default 6) — alle weiteren Laternen bleiben als emissiver Koerper + Bloom
// sichtbar, kosten aber keinen pro-Fragment-Lichter-Loop.

import * as THREE from 'three';
import { spawn, placeOnGround } from './assets.js';
import { createLantern, createCampfire, poolLanterns } from './lanterns.js';
import { attachWindowGlow } from './windows.js';
import { createTreesInstanced } from './trees.js';
import { makeGarland, makePathLights, makeRoofLights, poolGarlands, poolPathLights, poolRoofLights } from './stringlights.js';
import { sampleHeight } from './terrain.js';
import {
  HOUSES, PATHS, toWorldX, toWorldZ,
  distanceToPaths, distanceToRivers, FOREST_PATCHES, PX_SCALE,
  isInField,
} from './mapLayout.js';
import { distanceToHousePaths } from './housePaths.js';
import { createTemple } from './temple.js';

const MODEL_MAP = {
  homeA_blue:   'building_home_A_blue',
  homeA_red:    'building_home_A_red',
  homeB_blue:   'building_home_B_blue',
  homeB_red:    'building_home_B_red',
  homeB_yellow: 'building_home_B_yellow',
  tavern:       'building_tavern_blue',
  blacksmith:   'building_blacksmith_red',
  market:       'building_market_green',
  watermill:    'building_watermill_blue',
};

// Mindestabstand Haus-Bbox zum Wasser (in world units).
// Strenger als vorher: wenn ein Haus-Zentrum naeher als 3.2 am Fluss liegt,
// wird es radial weggeschoben; wenn es danach noch < 2.8 ist, wird's verworfen.
const RIVER_CLEARANCE = 3.2;
const RIVER_CLEARANCE_HARD = 2.8;

// KayKit-Haeuser haben einen eingebackenen sechseckigen Steinsockel am Boden.
// Der wird jetzt in assets.js trimHexBase() direkt aus der Geometrie
// geschnitten, bevor das Haus geklont wird — daher kein Versenken mehr noetig.
// Nur eine Winzigkeit sinken, damit die Wandunterkante nicht auf unebenen
// Terrain hochsteht.
const KAYKIT_HEX_SINK = 0.015;

export function placeVillage(world, opts = {}) {
  const maxPointLights = opts.maxPointLights ?? 6;
  // Editor-Hook: wenn eine Haus-Liste uebergeben wurde (materialisiert aus
  // dem SceneDoc, inkl. Overrides + extras), nutzen wir diese statt HOUSES.
  // Jeder Eintrag darf worldX/worldZ/rotYOverride tragen.
  const housesList = opts.houses || HOUSES.map((h) => ({ ...h }));

  const occupiedRects = [];
  const windowGlows = [];
  const roofLights = [];
  const garlands = [];
  const houseAnchors = [];
  // Vollstaendige Haus-Infos fuer die Deko-Platzierung (Gaerten, Props, usw.)
  const placedHouses = [];
  const roofBulbPlacements = []; // fuer globalen Pool
  let pointLightBudget = Math.max(2, maxPointLights); // mindestens Lagerfeuer + 1 Laterne

  // ---- Zentraler Brunnen am Tempelplatz -----------------------------------
  const templeHouse = HOUSES.find((h) => h.id === 'temple');
  const tx0 = toWorldX(templeHouse.px[0]);
  const tz0 = toWorldZ(templeHouse.px[1]);

  const wellX = tx0 + 1.8;
  const wellZ = tz0 + 3.0;
  const well = spawn('building_well_blue');
  well.scale.setScalar(1.8);
  well.rotation.y = Math.PI / 6;
  placeOnGround(well, wellX, wellZ, sampleHeight(wellX, wellZ));
  world.add(well);
  occupiedRects.push({ x: wellX, z: wellZ, w: 1.8, d: 1.8, pad: 0.4 });

  // Lagerfeuer am Brunnen. Das eigene PointLight wird vom Pool verwaltet
  // (siehe Registrierung unten). Flicker ueber Campfire-Logik bleibt.
  const fire = createCampfire({ useOwnLight: false });
  fire.position.set(wellX + 1.8, sampleHeight(wellX + 1.8, wellZ + 0.3), wellZ + 0.3);
  world.add(fire);
  if (typeof window !== 'undefined' && window.__lightsPool && fire.userData.poolMaterials) {
    window.__lightsPool.register({
      position: new THREE.Vector3(wellX + 1.8, sampleHeight(wellX + 1.8, wellZ + 0.3) + 0.5, wellZ + 0.3),
      color: 0xff7a2a,
      distance: 9,
      baseIntensity: 3.0,
      emissiveMaterials: fire.userData.poolMaterials,
    });
  }

  // ---- Alle Haeuser aus dem Layout ----------------------------------------
  for (const h of housesList) {
    // Editor-Override: wenn worldX/worldZ gesetzt sind, dann diese nutzen,
    // sonst wie bisher aus Pixelkoordinaten umrechnen.
    let x = Number.isFinite(h.worldX) ? h.worldX : toWorldX(h.px[0]);
    let z = Number.isFinite(h.worldZ) ? h.worldZ : toWorldZ(h.px[1]);

    // Haus weg vom Fluss schieben, falls es zu nah dran liegt.
    const rd = distanceToRivers(x, z);
    if (rd < RIVER_CLEARANCE) {
      // Schub-Richtung: einfach radial weg vom Dorfzentrum (so bleibt es
      // ungefaehr im Dorf). Betrag = fehlender Abstand.
      let dx = x - tx0, dz = z - tz0;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const push = (RIVER_CLEARANCE - rd) + 0.6;
      x += dx * push;
      z += dz * push;
      // Harte Grenze: wer immer noch zu nah am Fluss ist, fliegt raus.
      if (distanceToRivers(x, z) < RIVER_CLEARANCE_HARD) continue;
    }

    const isKayKit = h.model !== 'temple';
    let mesh;
    if (!isKayKit) {
      mesh = createTemple({ scale: 1.0 });
      mesh.scale.setScalar(h.scale);
    } else {
      const assetName = MODEL_MAP[h.model];
      if (!assetName) continue;
      mesh = spawn(assetName);
      mesh.scale.setScalar(h.scale);
    }
    mesh.rotation.y = Number.isFinite(h.rotYOverride)
      ? h.rotYOverride
      : THREE.MathUtils.degToRad(h.rotDeg);
    const y = sampleHeight(x, z);
    // KayKit-Haeuser: den hexagonalen Steinsockel in den Boden versenken.
    // Der Tempel hat keinen Sockel -> normale Platzierung.
    const sink = isKayKit ? KAYKIT_HEX_SINK : 0;
    // Shift-Drag-Hoehenoffset: beim Reload angewendet, damit ein angehobenes
    // Haus auch auf einem veraenderten Gelaende seinen Abstand zum Boden behaelt.
    const yOffset = Number.isFinite(h.yOffsetOverride) ? h.yOffsetOverride : 0;
    placeOnGround(mesh, x, z, y - sink + yOffset);
    // Editor-Markierung: jedes Haus wird auswaehl-/verschieb-/drehbar.
    // standardHouseId=true markiert, dass ein Edit als Override gespeichert
    // werden muss (nicht als neuer objects-Eintrag).
    const editableType = 'house.' + (h.model === 'temple' ? 'temple' : h.model);
    mesh.userData.editable = {
      id: h.id,
      type: editableType,
      scale: h.scale,
      standardHouseId: h._standard !== false ? h.id : null,
      yOffset,
    };
    mesh.name = 'editable:' + editableType + ':' + h.id;
    world.add(mesh);

    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const w = box.max.x - box.min.x;
    const d = box.max.z - box.min.z;
    occupiedRects.push({ x, z, w, d, pad: 0.18 });
    placedHouses.push({
      id: h.id,
      model: h.model,
      x, z,
      rotY: mesh.rotation.y,
      bboxW: w, bboxD: d,
      y: sampleHeight(x, z),
      scale: h.scale,
    });

    // Fenster-Glow (nur echte Haeuser, nicht Market/Temple)
    if (h.model !== 'market' && h.model !== 'temple') {
      const frontDir = new THREE.Vector3(1, 0, 0).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        mesh.rotation.y,
      );
      // attachWindowGlow kriegt jetzt ein Flag, ob ein echtes PointLight
      // dazukommen darf. Default: emissive-only (0 Draw-Calls fuer Licht).
      const g = attachWindowGlow(mesh, { frontDir, scale: 0.9, useLight: false });
      g.userData.phase = Math.random() * Math.PI * 2;
      windowGlows.push(g);

      if (h.model !== 'watermill') {
        // Roof-Bulb-Positionen im Weltkoordinatensystem sammeln (fuer Pool).
        mesh.updateMatrixWorld(true);
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frontDir).normalize();
        const localCount = 5, localWidth = 0.55, heightOffset = 0.68;
        for (let k = 0; k < localCount; k++) {
          const tt = localCount === 1 ? 0 : (k / (localCount - 1) - 0.5);
          const sag = Math.sin(Math.PI * (tt + 0.5)) * 0.06;
          const localP = new THREE.Vector3()
            .copy(frontDir).multiplyScalar(0.42)
            .addScaledVector(right, tt * localWidth)
            .setY(heightOffset - sag);
          // In Weltkoordinaten (Haus hat position + rotation + scale).
          const worldP = localP.clone().applyMatrix4(mesh.matrixWorld);
          roofBulbPlacements.push({
            p: worldP,
            scale: (0.8 + Math.random() * 0.25) * h.scale * 0.6,
          });
        }
      }
    }

    houseAnchors.push({ id: h.id, x, z, y: y + 1.9 });
  }

  // ---- Lichterketten-Girlanden zwischen Nachbarn ---------------------------
  // Alle Girlanden teilen EINEN InstancedMesh (siehe stringlights.poolGarlands).
  const close = [];
  for (let i = 0; i < houseAnchors.length; i++) {
    for (let j = i + 1; j < houseAnchors.length; j++) {
      const a = houseAnchors[i], b = houseAnchors[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 2.2 && d < 4.8) close.push({ a, b, d });
    }
  }
  close.sort((x, y) => x.d - y.d);
  const used = new Set();
  const pairs = [];
  for (const pair of close) {
    if (pairs.length >= 12) break;
    if (used.has(pair.a.id) && used.has(pair.b.id)) continue;
    used.add(pair.a.id); used.add(pair.b.id);
    pairs.push(pair);
  }
  if (pairs.length > 0) {
    const pooled = poolGarlands(pairs.map((p) => ({
      a: new THREE.Vector3(p.a.x, p.a.y, p.a.z),
      b: new THREE.Vector3(p.b.x, p.b.y, p.b.z),
    })));
    world.add(pooled);
    garlands.push(pooled);
  }

  // ---- Laternen entlang der Hauptstrasse (Point-Light-Budget-begrenzt) ----
  const lanternPts = [];
  const main0 = PATHS[0].pts.map((p) => [toWorldX(p[0]), toWorldZ(p[1])]);
  const stride = 3;
  for (let i = 1; i < main0.length - 1; i += stride) {
    lanternPts.push({ x: main0[i][0], z: main0[i][1] });
  }
  const north = PATHS[1].pts.map((p) => [toWorldX(p[0]), toWorldZ(p[1])]);
  for (let i = 1; i < north.length - 1; i += 2) {
    lanternPts.push({ x: north[i][0], z: north[i][1] });
  }
  // Nur Laternen weit genug vom Fluss weg.
  const validLanterns = lanternPts.filter((lp) => distanceToRivers(lp.x, lp.z) > 1.2);

  // Alle Laternen laufen jetzt ueber den globalen Lichter-Pool
  // (window.__lightsPool) — deren PointLights werden pro Tick den naechsten
  // zur Kamera zugewiesen. Lampen OHNE Zuweisung bleiben emissiv sichtbar
  // (Pool-Builder poolLanterns macht EINEN InstancedMesh-Pool fuer Geometrie).
  const poolPlacements = [];
  for (let i = 0; i < validLanterns.length; i++) {
    const lp = validLanterns[i];
    const gY = sampleHeight(lp.x, lp.z);
    const rotY = Math.random() * Math.PI * 2;
    poolPlacements.push({ x: lp.x + 0.5, y: gY + 0.02, z: lp.z + 0.5, rotY });
  }
  let villageLanternPool = null;
  if (poolPlacements.length > 0) {
    villageLanternPool = poolLanterns(poolPlacements);
    world.add(villageLanternPool);
    garlands.push(villageLanternPool);
    // Editor-Picker: pro Laterne stabile ID + Meta. Alle InstancedMeshes der
    // Pool-Gruppe werden als Hit-Targets registriert (Pfosten, Lampe, etc.).
    const lanternInstMeshes = villageLanternPool.children.filter(c => c.isInstancedMesh);
    const lanternMeta = poolPlacements.map((pl, i) => ({
      id: 'p:lantern:' + i,
      type: 'light.lantern',
      x: pl.x, z: pl.z,
      y: pl.y,       // Bodenniveau (exakter als sampleHeight)
      rotY: pl.rotY ?? 0,
      scale: 1,
    }));
    villageLanternPool.userData.procMeta = {
      instancedMeshes: lanternInstMeshes,
      meta: lanternMeta,
      procType: 'light.lantern',
    };
  }
  // Pool-Registrierung: pro Laterne beim globalen Lichter-Pool anmelden.
  if (typeof window !== 'undefined' && window.__lightsPool && poolPlacements.length > 0) {
    // Das poolLanterns-Material ist shared -> Emissive flackert global.
    // Wir registrieren jede Laterne mit shared Material.
    const mat = villageLanternPool.userData.mat;
    for (const pl of poolPlacements) {
      window.__lightsPool.register({
        position: new THREE.Vector3(pl.x, pl.y + 1.4, pl.z),
        color: 0xffa858,
        distance: 7,
        baseIntensity: 2.6,
        emissiveMaterials: [], // shared material -> wir flackern via village-Flicker-Loop (nicht pool)
      });
    }
  }

  // ---- Boden-Lichterketten entlang Main-Route 0 (gepoolt) ---------------
  const pathLights = [];
  const plSegs = [];
  for (let i = 0; i < main0.length - 1; i += 3) {
    const j = Math.min(i + 3, main0.length - 1);
    const from = main0[i], to = main0[j];
    const dir = new THREE.Vector2(to[0] - from[0], to[1] - from[1]);
    const len = dir.length();
    if (len < 0.1) continue;
    dir.multiplyScalar(1 / len);
    const side = new THREE.Vector3(-dir.y, 0, dir.x).multiplyScalar(0.7);
    plSegs.push({
      a: new THREE.Vector3(from[0], 0, from[1]).add(side),
      b: new THREE.Vector3(to[0],   0, to[1]).add(side),
      count: 5,
    });
  }
  if (plSegs.length > 0) {
    const pl = poolPathLights(plSegs, { sampleHeight });
    pl.userData.phase = Math.random() * Math.PI * 2;
    world.add(pl);
    pathLights.push(pl);
  }

  // ---- Alle Dachlicht-Bulbs gepoolt --------------------------------------
  if (roofBulbPlacements.length > 0) {
    const roofPool = poolRoofLights(roofBulbPlacements);
    roofPool.userData.phase = 0;
    world.add(roofPool);
    roofLights.push(roofPool);
  }

  return { occupiedRects, windowGlows, roofLights, garlands, pathLights, houseAnchors, placedHouses };
}

// -------- Natur: Waldpatches + Felsen -------------------------------------
// Baeume gehen nicht in Haus-Rect, Wege, Fluss, Felder und Obstwiese.

export function scatterNature(world, excludeRects, opts = {}) {
  // WICHTIG: scatterNature wird zur Laufzeit JEDES Reloads neu gestartet,
  // aber stable procIds ('p:tree:5', 'p:rock:3') erwarten, dass sich die
  // *Position* der i-ten Instanz NICHT aendert — sonst zeigen procOverrides
  // nach Reload auf das falsche Objekt. Daher: Lokaler Seeded-RNG statt
  // Math.random().
  let _rng = 20231110;
  const rnd = () => {
    _rng = (_rng * 1664525 + 1013904223) >>> 0;
    return _rng / 0x100000000;
  };
  const treePlacements = [];
  const inExclude = (x, z) => {
    for (const r of excludeRects) {
      if (Math.abs(x - r.x) < r.w / 2 + (r.pad ?? 0) &&
          Math.abs(z - r.z) < r.d / 2 + (r.pad ?? 0)) return true;
    }
    return false;
  };
  const totalDensity = FOREST_PATCHES.reduce((s, p) => s + p.density * (p.r * p.r), 0);
  const targetCount = opts.count ?? 420;
  for (const p of FOREST_PATCHES) {
    const share = (p.density * p.r * p.r) / totalDensity;
    const n = Math.round(targetCount * share);
    const cx = toWorldX(p.px[0]);
    const cz = toWorldZ(p.px[1]);
    const R = p.r * PX_SCALE;
    const leafyRatio = p.leafy ?? 0.45;
    let attempts = 0;
    let placed = 0;
    while (placed < n && attempts < n * 4) {
      attempts++;
      const ang = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * R;
      const x = cx + Math.cos(ang) * rr;
      const z = cz + Math.sin(ang) * rr;
      if (inExclude(x, z)) continue;
      if (distanceToPaths(x, z) < 1.0) continue;
      if (distanceToHousePaths(x, z) < 0.5) continue;
      if (distanceToRivers(x, z) < 3.0) continue;
      if (isInField(x, z)) continue; // KEINE Baeume in Aeckern
      const y = sampleHeight(x, z);
      const edgeFactor = Math.min(1, rr / R);
      const typeIsLeafy = rnd() < leafyRatio * (1 - edgeFactor * 0.55);
      const type = typeIsLeafy ? 'leafy' : 'pine';
      const scale = type === 'leafy'
        ? 0.9 + rnd() * 0.9
        : 0.85 + rnd() * 0.9;
      const rotY = rnd() * Math.PI * 2;
      const tilt = (rnd() - 0.5) * 0.08;
      treePlacements.push({ x, y, z, scale, rotY, tilt, type });
      placed++;
    }
  }
  const forest = createTreesInstanced(treePlacements);
  world.add(forest);

  // Felsen scattern — ebenfalls kein Fluss, keine Felder.
  // Jeder Felsen wird mit userData.editable markiert und bekommt eine stabile
  // procId. Dadurch sind sie einzeln anklickbar und ueber procOverrides
  // auch ueber Reload hinweg (Position/Rotation/Scale) persistierbar.
  const rockNames = ['rock_single_A', 'rock_single_C', 'rock_single_E'];
  const rockTypes = ['rock.a', 'rock.c', 'rock.e'];
  const rockCount = 24;
  const rocks = [];
  let rPlaced = 0, rAttempts = 0;
  while (rPlaced < rockCount && rAttempts < rockCount * 6) {
    rAttempts++;
    const px = rnd() * 700;
    const py = rnd() * 495;
    const x = toWorldX(px);
    const z = toWorldZ(py);
    if (inExclude(x, z)) continue;
    if (distanceToPaths(x, z) < 0.9) continue;
    if (distanceToHousePaths(x, z) < 0.4) continue;
    if (distanceToRivers(x, z) < 2.8) continue;
    if (isInField(x, z)) continue;
    const kindIdx = rPlaced % rockNames.length;
    const rock = spawn(rockNames[kindIdx]);
    const s = 0.6 + rnd() * 1.2;
    const rotY = rnd() * Math.PI * 2;
    rock.scale.setScalar(s);
    rock.rotation.y = rotY;
    placeOnGround(rock, x, z, sampleHeight(x, z));
    // Editor: einzeln auswaehlbar + procOverride-faehig.
    const procIdStr = 'p:rock:' + rPlaced;
    rock.userData.editable = {
      id: procIdStr,
      type: rockTypes[kindIdx],
      scale: s,
      standardHouseId: null,
      procId: procIdStr,
    };
    rock.name = 'editable:' + rockTypes[kindIdx] + ':' + procIdStr;
    world.add(rock);
    rocks.push(rock);
    rPlaced++;
  }
  // Rock-Liste wird als procPicker-Liste von main.js ausgewertet
  // (keine InstancedMesh noetig — rocks sind individuelle Spawn-Groups).
  return { forest, treeCount: treePlacements.length, rocks };
}
