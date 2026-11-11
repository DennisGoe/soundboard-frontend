// Laedt alle benutzten KayKit-GLTFs einmal, cached die geladene Szene
// und liefert pro Aufruf einen frischen Klon zurueck.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Absolute URL inkl. Vite-Base ('/' im Dev, '/bilder/' im Prod unter Soundboard).
// Dadurch funktionieren GLTF-Fetches auch, wenn die Seite unter '/bilder' (ohne
// Slash) angesurft wird — relative Pfade waeren sonst '/models/...'.
const BASE = import.meta.env.BASE_URL + 'models/kaykit/';
const loader = new GLTFLoader();
const cache = new Map();

// KayKit-Gebaeude haben einen eingebackenen sechseckigen Steinsockel am Boden.
// Der Sockel ist ein paar Zentimeter hoch und weiter als die Grundflaeche der
// Haus-Waende, deshalb bildet er von aussen einen sichtbaren Hexagon-Ring.
// Um das Haus NICHT in den Boden versenken zu muessen (sonst gehen Tueren halb
// unter) schneiden wir den Sockel direkt aus der Geometrie: Dreiecke, deren
// drei Vertex-y-Werte alle unter HEX_TRIM_Y liegen, werden geloescht.
// Das trifft zuverlaessig nur die flache Hex-Platte — die Waende beginnen
// darueber, ihre Dreiecke haben mindestens einen y-Wert knapp ueber HEX_TRIM_Y.
// Empirisch: Hex-Plinth-Oberkante liegt bei ~0.10, Haus-Wand startet
// ab ~0.14. Mit 0.12 ist der komplette Plinth weg, die Waende bleiben
// vollstaendig erhalten (ihre untersten Dreiecke haben einen Vertex bei
// 0.14+, max-y also > 0.12 → nicht getrimmt).
const HEX_TRIM_Y = 0.12;

function trimHexBase(geometry) {
  const pos = geometry.getAttribute('position');
  if (!pos) return;
  const idx = geometry.getIndex();
  if (!idx) return;
  const posArr = pos.array;
  const idxArr = idx.array;
  const triCount = idxArr.length / 3;
  const kept = [];
  for (let t = 0; t < triCount; t++) {
    const a = idxArr[t * 3];
    const b = idxArr[t * 3 + 1];
    const c = idxArr[t * 3 + 2];
    const ya = posArr[a * 3 + 1];
    const yb = posArr[b * 3 + 1];
    const yc = posArr[c * 3 + 1];
    // Dreieck droppen, wenn ALLE 3 vertices unter der Schwelle sind
    if (ya < HEX_TRIM_Y && yb < HEX_TRIM_Y && yc < HEX_TRIM_Y) continue;
    kept.push(a, b, c);
  }
  if (kept.length === idxArr.length) return; // nichts zu trimmen
  const Ctor = idxArr.constructor;
  geometry.setIndex(new THREE.BufferAttribute(new Ctor(kept), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

// Namen mit sichtbarem Hex-Sockel, die getrimmt werden (well: hat auch einen,
// wirkt aber als Brunnen-Fundament schoen -> behalten).
const TRIM_HEX = new Set([
  'building_home_A_blue', 'building_home_A_red',
  'building_home_B_blue', 'building_home_B_red', 'building_home_B_yellow',
  'building_tavern_blue', 'building_market_green',
  'building_blacksmith_red', 'building_watermill_blue',
]);

function loadOne(name) {
  if (cache.has(name)) return Promise.resolve(cache.get(name));
  return new Promise((resolve, reject) => {
    loader.load(
      BASE + name + '.gltf',
      (gltf) => {
        const root = gltf.scene;
        root.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (TRIM_HEX.has(name) && o.geometry) {
              trimHexBase(o.geometry);
            }
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (m && m.map) {
                m.map.magFilter = THREE.NearestFilter;
                m.map.minFilter = THREE.NearestMipmapLinearFilter;
                m.map.anisotropy = 4;
                m.map.needsUpdate = true;
              }
              if (m) {
                m.roughness = 0.9;
                m.metalness = 0.0;
              }
            }
          }
        });
        cache.set(name, root);
        resolve(root);
      },
      undefined,
      reject,
    );
  });
}

const NAMES = [
  'building_home_A_blue',
  'building_home_A_red',
  'building_home_B_blue',
  'building_home_B_red',
  'building_home_B_yellow',
  'building_tavern_blue',
  'building_market_green',
  'building_blacksmith_red',
  'building_well_blue',
  'building_watermill_blue',
  'barrel',
  'crate_A_big',
  'crate_A_small',
  'bucket_water',
  'sack',
  'wheelbarrow',
  'pallet',
  'ladder',
  'flag_blue',
  'tree_single_A',
  'tree_single_B',
  'rock_single_A',
  'rock_single_C',
  'rock_single_E',
];

export async function loadAllAssets() {
  await Promise.all(NAMES.map(loadOne));
}

export function spawn(name) {
  const src = cache.get(name);
  if (!src) throw new Error('asset not loaded: ' + name);
  const clone = src.clone(true);
  // bbox merken, damit Caller das Modell sauber auf den Boden setzen kann
  const box = new THREE.Box3().setFromObject(clone);
  clone.userData.bbox = box;
  clone.userData.baseOffset = -box.min.y; // so viel anheben, damit min.y = 0
  return clone;
}

// Hilfsfunktion: platziert Objekt so, dass sein Modell-Boden auf dem gewuenschten
// Welt-Y liegt. Beruecksichtigt auch Skalierung, falls vorher gesetzt.
// WICHTIG: Bounding-Box wird jetzt NACH setScale ermittelt, damit skalierte
// Modelle korrekt am Boden sitzen und nicht mehr halb im Boden stecken.
export function placeOnGround(obj, x, z, groundY = 0) {
  // Falls das Modell skaliert wurde, muessen wir die aktuelle (effektive)
  // Bounding-Box verwenden, nicht die ungescaelte.
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const minY = box.min.y;
  // Objekt ist aktuell auf y=0 positioniert — hebe es um (-minY + groundY),
  // damit die Unterkante genau auf groundY liegt.
  obj.position.set(x, groundY - minY, z);
}

// Kleines negatives y, falls man etwas bewusst leicht ins Gras einsinken lassen
// moechte (z.B. kleine Props). Nicht mehr fuer Gebaeude benutzen.
export const GROUND_SINK = 0.0;

// Fuer Rueckwaerts-Kompatibilitaet: war ein grosser Sink (0.55) der Gebaeude
// halb versenkt hat. Wird jetzt bewusst auf 0 gesetzt — Gebaeude stehen auf
// dem Boden, die hex-Bodenplatte wirkt als Steinfundament.
export const HEX_SINK = 0.0;
