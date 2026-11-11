// Gepfluegte Felder mit sichtbaren Furchen + Hecken drumherum.
// Hecken sind jetzt ueber InstancedMesh pro Material realisiert — spart
// hunderte Draw-Calls (vorher pro Hecken-Icosphere ein eigenes Mesh).

import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { fieldRectsWorld } from './mapLayout.js';
import { sampleHeight } from './terrain.js';

function makeFurrowPatch(w, d, furrowDeg) {
  const segsU = 48, segsV = 48;
  const geo = new THREE.PlaneGeometry(w, d, segsU, segsV);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cos = Math.cos(THREE.MathUtils.degToRad(furrowDeg));
  const sin = Math.sin(THREE.MathUtils.degToRad(furrowDeg));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const u = x * cos + z * sin;
    const v = -x * sin + z * cos;
    const h = Math.sin(v * 3.2) * 0.07 + Math.sin(u * 0.4) * 0.05;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const col = new Float32Array(pos.count * 3);
  const dirt = new THREE.Color(PALETTE.dirt);
  const dirtLight = new THREE.Color(PALETTE.dirtLight);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const v = -x * sin + z * cos;
    const f = Math.sin(v * 3.2) * 0.5 + 0.5;
    tmp.copy(dirt).lerp(dirtLight, f * 0.55);
    col[i * 3 + 0] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1.0, metalness: 0.0,
  });
  const mmesh = new THREE.Mesh(geo, mat);
  mmesh.receiveShadow = true;
  return mmesh;
}

export function createFields() {
  const group = new THREE.Group();
  group.name = 'fields';

  // Erst alle Hecken-Placements sammeln, dann in InstancedMeshes bauen.
  const placements = []; // {x, z, y, h, matIdx, rotY}
  const hedgeGeo = new THREE.IcosahedronGeometry(0.46, 0);
  const matBase = new THREE.MeshStandardMaterial({ color: 0x2b4530, roughness: 1.0 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1b2d20, roughness: 1.0 });
  const matLit  = new THREE.MeshStandardMaterial({ color: 0x4e6d45, roughness: 1.0 });

  const addStrip = (cx, cz, lx, lz, baseY) => {
    const n = Math.max(8, Math.round((lx > lz ? lx : lz) * 1.2));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = cx - lx / 2 + lx * t + (Math.random() - 0.5) * 0.1;
      const z = cz - lz / 2 + lz * t + (Math.random() - 0.5) * 0.1;
      const h = 0.55 + Math.random() * 0.2;
      const matIdx = Math.floor(Math.random() * 3);
      placements.push({ x, z, y: baseY + h * 0.5, h, matIdx, rotY: Math.random() * Math.PI });
    }
  };

  for (const r of fieldRectsWorld()) {
    const baseY = sampleHeight(r.cx, r.cz);
    const patch = makeFurrowPatch(r.w, r.d, r.furrowDeg);
    patch.position.set(r.cx, baseY + 0.02, r.cz);
    group.add(patch);
    addStrip(r.cx,          r.cz - r.d / 2, r.w, 0, baseY);
    addStrip(r.cx,          r.cz + r.d / 2, r.w, 0, baseY);
    addStrip(r.cx - r.w / 2, r.cz,          0, r.d, baseY);
    addStrip(r.cx + r.w / 2, r.cz,          0, r.d, baseY);
  }

  // Pro Material ein InstancedMesh.
  const buckets = [[], [], []];
  for (const p of placements) buckets[p.matIdx].push(p);
  const mats = [matBase, matDark, matLit];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (let b = 0; b < buckets.length; b++) {
    const bucket = buckets[b];
    if (bucket.length === 0) continue;
    const inst = new THREE.InstancedMesh(hedgeGeo, mats[b], bucket.length);
    for (let i = 0; i < bucket.length; i++) {
      const pl = bucket[i];
      pos.set(pl.x, pl.y, pl.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rotY);
      scl.set(1, pl.h, 1);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
  }

  return group;
}
