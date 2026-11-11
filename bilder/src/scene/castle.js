// Kleine Motte: Palisaden-Ringwall (instanziert!), Bergfried, Tor + Fackeln.
// Palisaden-Pfosten + Caps + Zinnen laufen jetzt ueber InstancedMesh (statt
// 48 einzelner Meshes pro Element) — spart viele Draw-Calls.

import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { castleWorld } from './mapLayout.js';
import { sampleHeight } from './terrain.js';

const PALISADE_COLOR = 0x5a3d26;
const PALISADE_DARK  = 0x2e1f14;

export function createCastle({ torchCount = 2 } = {}) {
  const group = new THREE.Group();
  group.name = 'castle';
  const c = castleWorld();
  // Editor-Picker: Burg als EINE Einheit selektierbar. Hitbox umfasst Bergfried
  // + Palisadenring. Wird spaeter mit userData.editable markiert und von main.js
  // ueber die Scene traversiert.

  // ---- Palisaden-Ringwall (instanziert) ---------------------------------
  const nPosts = 48;
  const palMat = new THREE.MeshStandardMaterial({ color: PALISADE_COLOR, roughness: 1.0 });
  const palTopMat = new THREE.MeshStandardMaterial({ color: PALISADE_DARK, roughness: 1.0 });
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.9, 7);
  const capGeo = new THREE.ConeGeometry(0.13, 0.22, 7);

  const gateAng = THREE.MathUtils.degToRad(c.gateDeg);
  const gateHalfWidth = Math.PI / 12;

  const postPlacements = [];
  for (let i = 0; i < nPosts; i++) {
    const a = (i / nPosts) * Math.PI * 2;
    const da = Math.atan2(Math.sin(a - gateAng), Math.cos(a - gateAng));
    if (Math.abs(da) < gateHalfWidth) continue;
    const r = c.palR;
    const x = c.cx + Math.cos(a) * r;
    const z = c.cz + Math.sin(a) * r;
    const y = sampleHeight(x, z);
    postPlacements.push({ x, y, z });
  }
  const trunkInst = new THREE.InstancedMesh(trunkGeo, palMat, postPlacements.length);
  const capInst = new THREE.InstancedMesh(capGeo, palTopMat, postPlacements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sOne = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < postPlacements.length; i++) {
    const pl = postPlacements[i];
    p.set(pl.x, pl.y + 1.0, pl.z);
    m.compose(p, q, sOne);
    trunkInst.setMatrixAt(i, m);
    p.set(pl.x, pl.y + 1.9 + 0.08, pl.z);
    m.compose(p, q, sOne);
    capInst.setMatrixAt(i, m);
  }
  trunkInst.instanceMatrix.needsUpdate = true;
  capInst.instanceMatrix.needsUpdate = true;
  trunkInst.computeBoundingSphere(); trunkInst.computeBoundingBox();
  capInst.computeBoundingSphere();   capInst.computeBoundingBox();
  trunkInst.castShadow = true;
  trunkInst.receiveShadow = true;
  group.add(trunkInst);
  group.add(capInst);

  // ---- Tor (2 dickere Pfosten + Balken) --------------------------------
  const gx = c.cx + Math.cos(gateAng) * c.palR;
  const gz = c.cz + Math.sin(gateAng) * c.palR;
  const gy = sampleHeight(gx, gz);
  const tangentX = -Math.sin(gateAng), tangentZ = Math.cos(gateAng);
  const gatePostGeo = new THREE.CylinderGeometry(0.19, 0.21, 2.5, 8);
  for (const side of [1, -1]) {
    const px = gx + tangentX * 0.7 * side;
    const pz = gz + tangentZ * 0.7 * side;
    const post = new THREE.Mesh(gatePostGeo, palTopMat);
    post.position.set(px, gy + 1.25, pz);
    post.castShadow = true;
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.7), palTopMat);
  beam.position.set(gx, gy + 2.3, gz);
  beam.rotation.y = gateAng + Math.PI / 2;
  group.add(beam);

  // ---- Bergfried ---------------------------------------------------------
  const keepY = sampleHeight(c.cx, c.cz);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 1.0 });
  const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 1.0 });

  const keepSize = c.keep.size * 1.6;
  const keepHeight = c.keep.height * 1.1;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(keepSize, keepHeight, keepSize),
    stoneMat,
  );
  body.position.set(c.cx, keepY + keepHeight / 2, c.cz);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Zinnenring (instanziert)
  const nMerlons = 12;
  const merlonGeo = new THREE.BoxGeometry(0.35, 0.55, 0.35);
  const merlonInst = new THREE.InstancedMesh(merlonGeo, stoneDarkMat, nMerlons);
  for (let i = 0; i < nMerlons; i++) {
    const a = (i / nMerlons) * Math.PI * 2;
    const r = keepSize * 0.55;
    const mx = c.cx + Math.cos(a) * r;
    const mz = c.cz + Math.sin(a) * r;
    p.set(mx, keepY + keepHeight + 0.28, mz);
    m.compose(p, q, sOne);
    merlonInst.setMatrixAt(i, m);
  }
  merlonInst.instanceMatrix.needsUpdate = true;
  merlonInst.computeBoundingSphere(); merlonInst.computeBoundingBox();
  group.add(merlonInst);

  // Dach
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(keepSize * 0.78, c.keep.roofHeight * 1.2, 10),
    new THREE.MeshStandardMaterial({
      color: 0x5a3550,
      emissive: new THREE.Color(0x2a1030),
      emissiveIntensity: 0.3,
      roughness: 1.0,
    }),
  );
  roof.position.set(c.cx, keepY + keepHeight + 0.6 + (c.keep.roofHeight * 1.2) / 2, c.cz);
  roof.castShadow = true;
  group.add(roof);

  // Fenster-Glow (4 Planes — klein, bleibt als Einzelmeshes)
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0xffb867,
    emissive: new THREE.Color(PALETTE.windowGlow),
    emissiveIntensity: 1.6,
  });
  for (let side = 0; side < 4; side++) {
    const a = (side / 4) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.42), windowMat);
    const wx = c.cx + Math.cos(a) * (keepSize / 2 + 0.01);
    const wz = c.cz + Math.sin(a) * (keepSize / 2 + 0.01);
    w.position.set(wx, keepY + keepHeight * 0.65, wz);
    w.lookAt(c.cx + Math.cos(a) * 2, w.position.y, c.cz + Math.sin(a) * 2);
    group.add(w);
  }

  // Tor-Fackeln: Zwei emissive Glows (keine eigenen PointLights mehr —
  // die werden jetzt zentral vom Lichter-Pool verwaltet, Registrierung unten).
  const fackelGroup = new THREE.Group();
  const torchGlows = [];
  for (const side of [1, -1]) {
    const px = gx + tangentX * 0.9 * side;
    const pz = gz + tangentZ * 0.9 * side;
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      emissive: new THREE.Color(PALETTE.fireHot),
      emissiveIntensity: 2.0,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat);
    glow.position.set(px, gy + 1.85, pz);
    fackelGroup.add(glow);
    torchGlows.push({ px, pz, mat: glowMat });
  }
  group.add(fackelGroup);
  // Pool-Registrierung
  if (typeof window !== 'undefined' && window.__lightsPool) {
    for (const t of torchGlows) {
      window.__lightsPool.register({
        position: new THREE.Vector3(t.px, gy + 1.9, t.pz),
        color: PALETTE.fireGlow,
        distance: 7,
        baseIntensity: 2.6,
        emissiveMaterials: [t.mat],
      });
    }
  }

  // Editor-Picker: Burg als EINE Einheit selektierbar.
  // Tag auf dem Root-Group, damit der Editor ueber _pickEditable()-Traversal
  // beim Treffer auf einen Palisaden-Pfosten/Zinne nach oben auf die Gruppe
  // laeuft und die ganze Burg auswaehlt. Beim Verschieben folgen alle Teile
  // (Group.position aendert sich).
  group.userData.editable = {
    id: 'p:castle:main',
    type: 'castle.main',
    scale: 1,
    standardHouseId: null,
    procId: 'p:castle:main',
  };
  group.name = 'editable:castle.main:p:castle:main';

  return group;
}
