// Zaun-Geometrie-Generator fuer das Pfad-System.
//
// Nimmt eine dicht abgetastete Kurve (Array<{x,z}>) und erzeugt ein
// THREE.Group mit instanziertem Pfosten-/Latten-/Mauer-Pool. Jeder Zaun ist
// ein einzelnes auswaehlbares Objekt (userData.editable + procId).
//
// Drei Stile:
//   'wood'  — klassischer Holzlattenzaun (Pfosten + 2 Horizontallatten)
//   'wicker'— Flechtzaun (Pfosten + sanft wogende Band-Geo)
//   'stone' — niedrige Steinmauer (Blockreihe)

import * as THREE from 'three';
import { distributeAlong, sampleCurve, totalLength } from './spline.js';

const UP = new THREE.Vector3(0, 1, 0);

// Shared Materials — 1x pro Zaun-Stil.
const MATS = {
  woodPost:  new THREE.MeshStandardMaterial({ color: 0xa47638, roughness: 0.95 }),
  woodRail:  new THREE.MeshStandardMaterial({ color: 0x8a6134, roughness: 0.95 }),
  wicker:    new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 1.0 }),
  stone:     new THREE.MeshStandardMaterial({ color: 0x6a7080, roughness: 1.0 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x484e58, roughness: 1.0 }),
};

// Shared Geometries.
const postGeoWood = new THREE.BoxGeometry(0.11, 0.9, 0.11);
const railGeoWood = new THREE.BoxGeometry(1.0, 0.07, 0.07);
const postGeoWick = new THREE.CylinderGeometry(0.06, 0.07, 0.95, 8);
const bandGeoWick = new THREE.PlaneGeometry(1.0, 0.45);
const stoneBlockGeo = new THREE.BoxGeometry(0.45, 0.35, 0.3);

// --- Kerngeneration -------------------------------------------------------

function composeMat(x, y, z, rotY, sx, sy, sz, tiltZ = 0) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, tiltZ, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  return m;
}

// Bauen eines Pools: nimmt Geometrie + Material + Liste von Matrizen -> InstancedMesh
function buildPool(geo, mat, matrices, { castShadow = true, receiveShadow = true } = {}) {
  if (matrices.length === 0) return null;
  const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
  inst.castShadow = castShadow;
  inst.receiveShadow = receiveShadow;
  for (let i = 0; i < matrices.length; i++) inst.setMatrixAt(i, matrices[i]);
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.computeBoundingBox();
  return inst;
}

// --- Stile ----------------------------------------------------------------

function buildWoodFence(sampled, sampleHeight) {
  const group = new THREE.Group();
  group.name = 'fence_wood';
  // Pfosten alle 0.4u.
  const postStep = 0.45;
  const posts = distributeAlong(sampled, postStep);
  const postMats = [];
  for (const p of posts) {
    const y = sampleHeight(p.x, p.z);
    // three.js rotation.y = theta dreht lokale +X-Achse auf (cos, 0, -sin)
    // in Welt-Koordinaten — Z-Vorzeichen also umkehren (atan2(-tz, tx)),
    // sonst stehen Pfosten/Latten bei diagonalen Segmenten verdreht.
    const rotY = Math.atan2(-p.tangentZ, p.tangentX);
    postMats.push(composeMat(p.x, y + 0.45, p.z, rotY, 1, 1, 1));
  }
  const postPool = buildPool(postGeoWood, MATS.woodPost, postMats);
  if (postPool) group.add(postPool);

  // 2 Latten pro Segment: zwischen Pfostenpaar, berg-/talfolgend.
  const railMats = [];
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i], b = posts[i + 1];
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const yA = sampleHeight(a.x, a.z);
    const yB = sampleHeight(b.x, b.z);
    const my = (yA + yB) * 0.5;
    const dx = b.x - a.x, dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    // Latte liegt lokal entlang +X; damit die Latte von Pfosten a nach b
    // zeigt, muss rotY deren Welt-Richtung (dx,dz) treffen → atan2(-dz, dx).
    const rotY = Math.atan2(-dz, dx);
    // Latten bei 0.3 und 0.7 (relativ 0..0.9 Pfostenhoehe).
    for (const h of [0.30, 0.68]) {
      railMats.push(composeMat(mx, my + h, mz, rotY, segLen + 0.02, 1, 1));
    }
  }
  const railPool = buildPool(railGeoWood, MATS.woodRail, railMats);
  if (railPool) group.add(railPool);

  return group;
}

function buildWickerFence(sampled, sampleHeight) {
  const group = new THREE.Group();
  group.name = 'fence_wicker';
  const postStep = 0.55;
  const posts = distributeAlong(sampled, postStep);
  const postMats = [];
  for (const p of posts) {
    const y = sampleHeight(p.x, p.z);
    const rotY = Math.atan2(-p.tangentZ, p.tangentX);
    postMats.push(composeMat(p.x, y + 0.48, p.z, rotY, 1, 1, 1));
  }
  const postPool = buildPool(postGeoWick, MATS.wicker, postMats);
  if (postPool) group.add(postPool);
  // Flechtband in Mitte (Plane, bewegt leicht in Hoehe).
  const bandMats = [];
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i], b = posts[i + 1];
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const yA = sampleHeight(a.x, a.z);
    const yB = sampleHeight(b.x, b.z);
    const my = (yA + yB) * 0.5;
    const dx = b.x - a.x, dz = b.z - a.z;
    const segLen = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx);
    bandMats.push(composeMat(mx, my + 0.42, mz, rotY, segLen + 0.02, 1, 1));
  }
  const bandMat = MATS.wicker.clone();
  bandMat.side = THREE.DoubleSide;
  const bandPool = buildPool(bandGeoWick, bandMat, bandMats);
  if (bandPool) group.add(bandPool);
  return group;
}

function buildStoneWall(sampled, sampleHeight) {
  const group = new THREE.Group();
  group.name = 'fence_stone';
  const blockStep = 0.5;
  const blocks = distributeAlong(sampled, blockStep);
  const topMats = [];
  const botMats = [];
  // Reihe 1 (unten) direkt am Boden, Reihe 2 (oben) dick, ein paar versetzt.
  for (let i = 0; i < blocks.length; i++) {
    const p = blocks[i];
    const y = sampleHeight(p.x, p.z);
    const rotY = Math.atan2(-p.tangentZ, p.tangentX);
    // Mini-Jitter auf Rotation, damit die Steine nicht wie Legosteine liegen.
    const jitter = ((i * 37 + 11) % 13) / 13 * 0.3 - 0.15;
    botMats.push(composeMat(p.x, y + 0.17, p.z, rotY + jitter, 1, 1, 1));
    // Zweite Reihe nur bei jedem 2. Block (versetzt).
    if (i % 2 === 0 && i < blocks.length - 1) {
      const next = blocks[i + 1];
      const mx = (p.x + next.x) * 0.5;
      const mz = (p.z + next.z) * 0.5;
      const my = (sampleHeight(p.x, p.z) + sampleHeight(next.x, next.z)) * 0.5;
      const dx = next.x - p.x, dz = next.z - p.z;
      const rot = Math.atan2(-dz, dx);
      const jitter2 = ((i * 53 + 21) % 17) / 17 * 0.25 - 0.125;
      topMats.push(composeMat(mx, my + 0.47, mz, rot + jitter2, 1, 0.8, 1));
    }
  }
  const botPool = buildPool(stoneBlockGeo, MATS.stone, botMats);
  if (botPool) group.add(botPool);
  const topPool = buildPool(stoneBlockGeo, MATS.stoneDark, topMats);
  if (topPool) group.add(topPool);
  return group;
}

// --- Public API -----------------------------------------------------------

// buildFence(points, style, sampleHeight) -> THREE.Group
// points: Anker-Punkte {x,z} (vor Spline-Sampling)
// style:  'wood' | 'wicker' | 'stone'
export function buildFence(points, style, sampleHeight) {
  if (!points || points.length < 2) return new THREE.Group();
  // Rough length -> samplesPerSegment anpassen.
  let roughLen = 0;
  for (let i = 1; i < points.length; i++) {
    roughLen += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].z - points[i - 1].z,
    );
  }
  const samplesPerSeg = Math.max(6, Math.min(24, Math.round(roughLen * 1.5)));
  const sampled = sampleCurve(points, { samplesPerSegment: samplesPerSeg });
  if (sampled.length < 2) return new THREE.Group();
  switch (style) {
    case 'wicker': return buildWickerFence(sampled, sampleHeight);
    case 'stone':  return buildStoneWall(sampled, sampleHeight);
    case 'wood':
    default:       return buildWoodFence(sampled, sampleHeight);
  }
}

export { sampleCurve, totalLength };

// Ghost-Variante: semi-transparente Vorschau waehrend des Zeichnens.
export function tintFenceAsGhost(group, isValid = true) {
  const colOk = new THREE.Color(0x66ff8e);
  const colBad = new THREE.Color(0xff6f6f);
  const target = isValid ? colOk : colBad;
  group.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.material.depthWrite = false;
      if (o.material.emissive) {
        o.material.emissive.copy(target);
        o.material.emissiveIntensity = 0.6;
      } else {
        // Ghost-Faerbung ueber color-Multiplier.
        o.material.color.lerp(target, 0.5);
      }
    }
  });
}
