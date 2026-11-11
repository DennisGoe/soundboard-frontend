// Nur noch Pflaster-Platzgeometrie — der eigentliche Bodengras-Mesh
// wird jetzt von terrain.js uebernommen (Huegel-Heightfield).
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { sampleHeight } from './terrain.js';

export function createGround(radius = 20) {
  const geo = new THREE.CircleGeometry(radius, 64);
  // Vertex-Color-Noise fuer unregelmaessiges Gras
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(PALETTE.grass);
  const dark = new THREE.Color(PALETTE.grassDark);
  const lit  = new THREE.Color(PALETTE.grassLit);
  const tmp  = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // einfache Pseudo-Noise aus Sinus
    const n = (
      Math.sin(x * 0.4 + y * 0.3) * 0.5 +
      Math.sin(x * 1.1 - y * 0.7) * 0.25 +
      Math.sin(x * 0.17 + y * 0.9) * 0.25
    );
    tmp.copy(base);
    if (n > 0.2) tmp.lerp(lit, Math.min(1, (n - 0.2) * 1.5));
    else if (n < -0.2) tmp.lerp(dark, Math.min(1, (-n - 0.2) * 1.5));
    col[i * 3 + 0] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// Zentraler Pflasterplatz: viele kleine instanzierte Steine.
export function createCobbleSquare(radius = 4.2, count = 180, centerX = 0, centerZ = 0) {
  const geo = new THREE.BoxGeometry(0.42, 0.14, 0.42);
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.cobble,
    roughness: 1.0,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = false;
  inst.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const colorBase = new THREE.Color(PALETTE.cobble);
  const colorDark = new THREE.Color(PALETTE.cobbleDark);
  const tmp = new THREE.Color();
  inst.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(count * 3), 3,
  );
  for (let i = 0; i < count; i++) {
    // Punkt im Kreis (etwas konzentriert nach innen)
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = Math.cos(a) * r + centerX;
    const z = Math.sin(a) * r + centerZ;
    p.set(x, sampleHeight(x, z) + 0.04, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    s.setScalar(0.75 + Math.random() * 0.6);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    tmp.copy(colorBase).lerp(colorDark, Math.random() * 0.7);
    inst.setColorAt(i, tmp);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.computeBoundingBox();
  inst.name = 'cobble';
  return inst;
}

// Weg aus Steinen zwischen zwei Punkten.
export function createPath(ax, az, bx, bz, count = 40) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.42, 0.1, 0.42);
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.cobble,
    roughness: 1.0,
  });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.receiveShadow = true;
  inst.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(count * 3), 3,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const colorBase = new THREE.Color(PALETTE.cobble);
  const colorDark = new THREE.Color(PALETTE.cobbleDark);
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const jitterX = (Math.random() - 0.5) * 0.7;
    const jitterZ = (Math.random() - 0.5) * 0.7;
    p.set(
      ax + (bx - ax) * t + jitterX,
      0.04,
      az + (bz - az) * t + jitterZ,
    );
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    s.setScalar(0.75 + Math.random() * 0.5);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
    tmp.copy(colorBase).lerp(colorDark, Math.random() * 0.6);
    inst.setColorAt(i, tmp);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.computeBoundingSphere();
  inst.computeBoundingBox();
  group.add(inst);
  return group;
}
