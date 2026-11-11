// Lichterketten: viele kleine, warme emissive Punkte auf durchhaengenden
// Ketten zwischen Haeusern. Sehr klein, sehr dezent — eher Tiny Glade
// als Jahrmarkt. Keine echten PointLights (zu teuer) — nur emissiv.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { finalizeInstanced } from './instancedHelpers.js';

// Sehr kleine Birnen — wirken wie feine Lichtpunkte (Tiny Glade), nicht wie Kugeln.
const sphereGeo = new THREE.SphereGeometry(0.018, 6, 5);

function makeBulbMaterial(color = PALETTE.stringLight, intensity = 0.55) {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 1.0,
  });
}

/**
 * Pool: alle Girlanden in EINEM InstancedMesh.
 * pairs: [{a: Vector3, b: Vector3}]
 */
export function poolGarlands(pairs, { segments = 16, sag = 0.45, color } = {}) {
  const group = new THREE.Group();
  const mat = makeBulbMaterial(color, 0.55);
  const total = pairs.length * segments;
  const inst = new THREE.InstancedMesh(sphereGeo, mat, total);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  let idx = 0;
  for (const pair of pairs) {
    const a = pair.a, b = pair.b;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t - sag * Math.sin(Math.PI * t);
      const z = a.z + (b.z - a.z) * t;
      p.set(x, y, z);
      s.setScalar(0.85 + Math.random() * 0.3);
      m.compose(p, q, s);
      inst.setMatrixAt(idx++, m);
    }
  }
  finalizeInstanced(inst);
  inst.name = 'garlandPool';
  group.add(inst);
  group.userData.mat = mat;
  group.userData.flicker = (t, phase = 0) => {
    const f = 1.0 + Math.sin(t * 1.1 + phase) * 0.08 + Math.sin(t * 2.3 + phase * 1.7) * 0.05;
    mat.emissiveIntensity = 0.55 * f;
  };
  return group;
}

/**
 * Pool: alle Path-Lights-Reihen in EINEM InstancedMesh (Bulbs + Posts).
 * segments: [{a: Vector3, b: Vector3, count: int}], sampleHeight: fn(x,z)
 */
export function poolPathLights(segments, { sampleHeight, color = PALETTE.stringLight } = {}) {
  const group = new THREE.Group();
  const bulbMat = makeBulbMaterial(color, 0.7);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.8 });
  const postGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 5);

  let total = 0;
  for (const seg of segments) total += seg.count;
  const bulbInst = new THREE.InstancedMesh(sphereGeo, bulbMat, total);
  const postInst = new THREE.InstancedMesh(postGeo, postMat, total);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const sP = new THREE.Vector3(1, 1, 1);
  const pP = new THREE.Vector3();
  let idx = 0;
  for (const seg of segments) {
    const a = seg.a, b = seg.b;
    for (let i = 0; i < seg.count; i++) {
      const t = seg.count === 1 ? 0.5 : i / (seg.count - 1);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const groundY = sampleHeight ? sampleHeight(x, z) : 0;
      pP.set(x, groundY + 0.11, z);
      m.compose(pP, q, sP);
      postInst.setMatrixAt(idx, m);
      p.set(x, groundY + 0.26, z);
      s.setScalar(0.85);
      m.compose(p, q, s);
      bulbInst.setMatrixAt(idx, m);
      idx++;
    }
  }
  finalizeInstanced(bulbInst);
  finalizeInstanced(postInst);
  group.add(bulbInst, postInst);
  group.userData.flicker = (t, phase = 0) => {
    const f = 1.0 + Math.sin(t * 0.9 + phase) * 0.07;
    bulbMat.emissiveIntensity = 0.7 * f;
  };
  return group;
}

/**
 * Pool: alle Dachkanten-Lichter in EINEM InstancedMesh.
 * placements: [{p: Vector3, scale: number}] im Weltkoordinatensystem.
 */
export function poolRoofLights(placements, { color = PALETTE.stringLight } = {}) {
  const group = new THREE.Group();
  const mat = makeBulbMaterial(color, 0.75);
  const inst = new THREE.InstancedMesh(sphereGeo, mat, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < placements.length; i++) {
    const pl = placements[i];
    sv.setScalar(pl.scale ?? 0.9);
    m.compose(pl.p, q, sv);
    inst.setMatrixAt(i, m);
  }
  finalizeInstanced(inst);
  inst.name = 'roofLightsPool';
  group.add(inst);
  group.userData.flicker = (t, phase = 0) => {
    const f = 1.0 + Math.sin(t * 1.3 + phase) * 0.09;
    mat.emissiveIntensity = 0.75 * f;
  };
  return group;
}

/**
 * Baut eine Lichterketten-Girlande zwischen zwei Punkten.
 */
export function makeGarland(a, b, { segments = 18, sag = 0.5, color } = {}) {
  const group = new THREE.Group();
  const mat = makeBulbMaterial(color, 0.55);
  const inst = new THREE.InstancedMesh(sphereGeo, mat, segments);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t - sag * Math.sin(Math.PI * t);
    const z = a.z + (b.z - a.z) * t;
    p.set(x, y, z);
    const sz = 0.85 + Math.random() * 0.3;
    s.setScalar(sz);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  finalizeInstanced(inst);
  inst.name = 'garland';
  group.add(inst);
  group.userData.mat = mat;
  group.userData.flicker = (t, phase = 0) => {
    const f = 1.0 + Math.sin(t * 1.1 + phase) * 0.08 + Math.sin(t * 2.3 + phase * 1.7) * 0.05;
    mat.emissiveIntensity = 0.55 * f;
  };
  return group;
}

/**
 * Kleine Bodenlichter entlang einer Linie (a -> b).
 * sampleHeight optional, damit die Posts dem Terrain folgen.
 */
export function makePathLights(a, b, { count = 6, color = PALETTE.stringLight, sampleHeight } = {}) {
  const group = new THREE.Group();
  const bulbMat = makeBulbMaterial(color, 0.7);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.8 });
  const postGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.22, 5);
  const bulbInst = new THREE.InstancedMesh(sphereGeo, bulbMat, count);
  const postInst = new THREE.InstancedMesh(postGeo, postMat, count);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const sP = new THREE.Vector3(1, 1, 1);
  const pP = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const groundY = sampleHeight ? sampleHeight(x, z) : 0;
    // Post
    pP.set(x, groundY + 0.11, z);
    m.compose(pP, q, sP);
    postInst.setMatrixAt(i, m);
    // Bulb oben
    p.set(x, groundY + 0.26, z);
    s.setScalar(0.85);
    m.compose(p, q, s);
    bulbInst.setMatrixAt(i, m);
  }
  finalizeInstanced(bulbInst);
  finalizeInstanced(postInst);
  group.add(bulbInst);
  group.add(postInst);
  group.userData.mat = bulbMat;
  group.userData.flicker = (t, phase = 0) => {
    const f = 1.0 + Math.sin(t * 0.9 + phase) * 0.07;
    bulbMat.emissiveIntensity = 0.7 * f;
  };
  return group;
}

/**
 * Baut emissive Dachkanten-Lichter fuer ein Haus: eine Reihe sehr kleiner
 * Bulbs oben am Hausdach entlang der Front.
 */
export function makeRoofLights(houseRoot, {
  frontDir = new THREE.Vector3(1, 0, 0),
  count = 9,
  width = 0.85,
  heightOffset = 0.82,
  color = PALETTE.stringLight,
} = {}) {
  const group = new THREE.Group();
  const mat = makeBulbMaterial(color, 0.75);
  const inst = new THREE.InstancedMesh(sphereGeo, mat, count);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), frontDir).normalize();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5);
    const sag = Math.sin(Math.PI * (t + 0.5)) * 0.06;
    p.copy(frontDir).multiplyScalar(0.42)
      .addScaledVector(right, t * width)
      .setY(heightOffset - sag);
    s.setScalar(0.8 + Math.random() * 0.25);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  finalizeInstanced(inst);
  group.add(inst);
  group.userData.mat = mat;
  group.userData.flicker = (t, phase = 0) => {
    const f = 1.0 + Math.sin(t * 1.3 + phase) * 0.09;
    mat.emissiveIntensity = 0.75 * f;
  };
  houseRoot.add(group);
  return group;
}
