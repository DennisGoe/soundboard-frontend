// Prozedurale Lampen-Modelle fuer Editor + Dorf. Jedes Modell liefert ein
// THREE.Group mit einer glow-Material-Liste (userData.lightGlowMaterials) und
// den Positions-Offsets fuer das PointLight (userData.lightOffset).
//
// Lichtanzahl ist NICHT direkt an diese Meshes gekoppelt — alle Lichter werden
// via lightsPool.js verwaltet. Hier wird nur Geometrie + Material gebaut.

import * as THREE from 'three';
import { PALETTE } from '../palette.js';

const ironMat = new THREE.MeshStandardMaterial({ color: 0x120e0a, roughness: 0.8, metalness: 0.3 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 0.9 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5f6673, roughness: 1.0 });

function makeGlowMat(color, intensity) {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.lanternGlow,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
  });
}

// --------------------------------------------------------------------------
// Laterne (pfostenhoch). Warmes Glimmen + Haube.
export function buildLantern() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 8), woodMat);
  post.position.y = 0.85; post.castShadow = true;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.05), woodMat);
  arm.position.set(0.18, 1.6, 0);
  g.add(arm);
  const glowMat = makeGlowMat(new THREE.Color(PALETTE.lanternHot), 4.0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMat);
  bulb.position.set(0.33, 1.4, 0);
  g.add(bulb);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 6), ironMat);
  cap.position.set(0.33, 1.58, 0);
  g.add(cap);
  g.userData.lightGlowMaterials = [glowMat];
  g.userData.lightOffset = new THREE.Vector3(0.33, 1.4, 0);
  g.userData.lightColor = PALETTE.lanternGlow;
  g.userData.lightDistance = 7;
  g.userData.lightBaseIntensity = 2.6;
  g.name = 'lantern_edit';
  return g;
}

// --------------------------------------------------------------------------
// Strassenlaterne — hoher Mast, zwei Lampen oben.
export function buildStreetlamp() {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 10), ironMat);
  mast.position.y = 1.2; mast.castShadow = true;
  g.add(mast);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.05, 10), ironMat);
  top.position.y = 2.45;
  g.add(top);
  const glowMat = makeGlowMat(new THREE.Color(PALETTE.lanternHot), 4.5);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glowMat);
  bulb.position.y = 2.25;
  g.add(bulb);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 10), ironMat);
  shade.position.y = 2.6;
  g.add(shade);
  g.userData.lightGlowMaterials = [glowMat];
  g.userData.lightOffset = new THREE.Vector3(0, 2.25, 0);
  g.userData.lightColor = PALETTE.lanternGlow;
  g.userData.lightDistance = 9;
  g.userData.lightBaseIntensity = 3.2;
  g.name = 'streetlamp_edit';
  return g;
}

// --------------------------------------------------------------------------
// Bodenlampe — flache Scheibe, kleine Glaskuppel darauf.
export function buildGroundLamp() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 12), stoneMat);
  base.position.y = 0.04;
  g.add(base);
  const glowMat = makeGlowMat(new THREE.Color(0xfff3b0), 4.0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glowMat);
  dome.position.y = 0.09;
  g.add(dome);
  g.userData.lightGlowMaterials = [glowMat];
  g.userData.lightOffset = new THREE.Vector3(0, 0.15, 0);
  g.userData.lightColor = 0xfff3b0;
  g.userData.lightDistance = 5.5;
  g.userData.lightBaseIntensity = 2.0;
  g.name = 'groundLamp_edit';
  return g;
}

// --------------------------------------------------------------------------
// Fackel — Pfosten + Flammenball oben.
export function buildTorch() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 7), woodMat);
  post.position.y = 0.65; post.castShadow = true;
  g.add(post);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.1, 8), ironMat);
  bowl.position.y = 1.32;
  g.add(bowl);
  const flameMat = makeGlowMat(new THREE.Color(PALETTE.fireGlow), 4.5);
  const flame1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), flameMat);
  flame1.position.y = 1.44; flame1.scale.set(0.9, 1.4, 0.9);
  g.add(flame1);
  const flame2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), flameMat);
  flame2.position.y = 1.58; flame2.scale.set(0.8, 1.2, 0.8);
  g.add(flame2);
  g.userData.lightGlowMaterials = [flameMat];
  g.userData.lightOffset = new THREE.Vector3(0, 1.45, 0);
  g.userData.lightColor = PALETTE.fireGlow;
  g.userData.lightDistance = 6;
  g.userData.lightBaseIntensity = 2.8;
  g.name = 'torch_edit';
  return g;
}

// --------------------------------------------------------------------------
// Feuerschale / Lagerfeuer — breite Schale + grosse Flamme.
export function buildBrazier() {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.2, 12), ironMat);
  bowl.position.y = 0.3; bowl.castShadow = true;
  g.add(bowl);
  const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), ironMat);
  for (let i = 0; i < 3; i++) {
    const leg = tripod.clone();
    leg.position.y = 0.15;
    const ang = (i / 3) * Math.PI * 2;
    leg.position.x = Math.cos(ang) * 0.28;
    leg.position.z = Math.sin(ang) * 0.28;
    leg.rotation.z = (Math.PI / 12) * Math.cos(ang);
    leg.rotation.x = -(Math.PI / 12) * Math.sin(ang);
    g.add(leg);
  }
  const flameMat = makeGlowMat(new THREE.Color(PALETTE.fireGlow), 3.5);
  for (let k = 0; k < 4; k++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 - k * 0.025, 1), flameMat);
    f.position.set(
      (Math.random() - 0.5) * 0.08,
      0.5 + k * 0.08,
      (Math.random() - 0.5) * 0.08,
    );
    f.scale.set(0.9, 1.3 + k * 0.08, 0.9);
    g.add(f);
  }
  g.userData.lightGlowMaterials = [flameMat];
  g.userData.lightOffset = new THREE.Vector3(0, 0.6, 0);
  g.userData.lightColor = PALETTE.fireGlow;
  g.userData.lightDistance = 9;
  g.userData.lightBaseIntensity = 3.5;
  g.name = 'brazier_edit';
  return g;
}

export function buildLightByType(type) {
  if (type === 'light.lantern') return buildLantern();
  if (type === 'light.streetlamp') return buildStreetlamp();
  if (type === 'light.groundLamp') return buildGroundLamp();
  if (type === 'light.torch') return buildTorch();
  if (type === 'light.brazier') return buildBrazier();
  return buildLantern();
}
