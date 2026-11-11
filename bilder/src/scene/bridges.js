// Zwei Bruecken: eine kleine Holzbruecke + eine kleinere Steinbogenbruecke.
// Steinmaterial dunkel-grau (kein weisses Gluehen), Bogen unter der Fahrbahn
// sichtbar, Gelaender beidseitig.

import * as THREE from 'three';
import { BRIDGES, toWorldX, toWorldZ } from './mapLayout.js';
import { RIVER_SURFACE } from './river.js';

const WOOD_COLOR = new THREE.Color(0x4a2f1a);
const WOOD_DARK  = new THREE.Color(0x2a1a0a);
// Dunkleres Stein-Grau damit die Bruecke im Mondlicht kuehl, nicht grell wirkt.
const STONE_LIGHT= new THREE.Color(0x5f6673);
const STONE_DARK = new THREE.Color(0x343842);

export function makeWoodBridge(len, wid) {
  const g = new THREE.Group();
  const deckGeo = new THREE.BoxGeometry(len, 0.1, wid);
  const deckMat = new THREE.MeshStandardMaterial({ color: WOOD_COLOR, roughness: 1.0, metalness: 0.0 });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = RIVER_SURFACE + 0.45;
  deck.receiveShadow = true;
  deck.castShadow = true;
  g.add(deck);

  const plankMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 1.0, metalness: 0.0 });
  const nPlanks = Math.max(6, Math.round(len * 1.8));
  for (let i = 0; i < nPlanks; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(len / nPlanks * 0.82, 0.12, wid * 0.96), plankMat);
    p.position.set((i - (nPlanks - 1) / 2) * (len / nPlanks), deck.position.y + 0.01, 0);
    p.receiveShadow = true;
    g.add(p);
  }

  const railMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 1.0, metalness: 0.0 });
  for (const side of [1, -1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), railMat);
    rail.position.set(0, deck.position.y + 0.55, side * (wid / 2 - 0.04));
    rail.castShadow = true;
    g.add(rail);
    const nPost = 5;
    for (let i = 0; i < nPost; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), railMat);
      post.position.set(((i / (nPost - 1)) - 0.5) * (len - 0.4),
        deck.position.y + 0.28,
        side * (wid / 2 - 0.04));
      post.castShadow = true;
      g.add(post);
    }
  }

  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), railMat);
    p.position.set(side * (len / 2 - 0.3), deck.position.y - 0.35, 0);
    g.add(p);
  }
  return g;
}

export function makeStoneBridge(len, wid) {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: STONE_LIGHT, roughness: 1.0, metalness: 0.0,
  });
  const stoneDarkMat = new THREE.MeshStandardMaterial({
    color: STONE_DARK, roughness: 1.0, metalness: 0.0,
  });

  // Fahrbahn mit leichter Woelbung (Bogen).
  const segs = 14;
  const archGeo = new THREE.BufferGeometry();
  const verts = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = (t - 0.5) * len;
    const yArch = Math.sin(t * Math.PI) * 0.22;
    verts.push(x, RIVER_SURFACE + 0.75 + yArch, -wid / 2);
    verts.push(x, RIVER_SURFACE + 0.75 + yArch,  wid / 2);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }
  archGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  archGeo.setIndex(idx);
  archGeo.computeVertexNormals();
  const arch = new THREE.Mesh(archGeo, stoneMat);
  arch.receiveShadow = true;
  arch.castShadow = true;
  g.add(arch);

  // Bogen UNTER der Fahrbahn (sichtbar vom Wasser aus)
  const uArchGeo = new THREE.BufferGeometry();
  const uVerts = [];
  const uIdx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = (t - 0.5) * len * 0.75;
    // Halbkreis-Bogen: Boden am Wasser, oben an der Fahrbahn
    const yBottom = RIVER_SURFACE - 0.1;
    const yTop    = RIVER_SURFACE + 0.6;
    const inner   = Math.sin(t * Math.PI);
    const yCurve  = yBottom + (yTop - yBottom) * inner;
    uVerts.push(x, yCurve, -wid / 2 - 0.02);
    uVerts.push(x, yCurve,  wid / 2 + 0.02);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    uIdx.push(a, c, b, b, c, d);
  }
  uArchGeo.setAttribute('position', new THREE.Float32BufferAttribute(uVerts, 3));
  uArchGeo.setIndex(uIdx);
  uArchGeo.computeVertexNormals();
  const uArch = new THREE.Mesh(uArchGeo, stoneDarkMat);
  uArch.receiveShadow = true;
  g.add(uArch);

  // Seitenwaende (Fundament aus dem Wasser bis Fahrbahn)
  for (const side of [1, -1]) {
    const wVerts = [];
    const wIdx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = (t - 0.5) * len;
      const yArch = Math.sin(t * Math.PI) * 0.22;
      const y0 = RIVER_SURFACE - 0.25;
      const y1 = RIVER_SURFACE + 1.1 + yArch;
      wVerts.push(x, y0, side * wid / 2);
      wVerts.push(x, y1, side * wid / 2);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      if (side > 0) wIdx.push(a, b, c, b, d, c);
      else          wIdx.push(a, c, b, b, c, d);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wVerts, 3));
    wg.setIndex(wIdx);
    wg.computeVertexNormals();
    const wall = new THREE.Mesh(wg, stoneMat);
    wall.receiveShadow = true;
    wall.castShadow = true;
    g.add(wall);
  }

  // Gelaender (keine Zinnen — zu "burgig"). Dezente Steinleiste.
  for (const side of [1, -1]) {
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = (t - 0.5) * (len - 0.3);
      const yArch = Math.sin(t * Math.PI) * 0.22;
      const b = new THREE.Mesh(new THREE.BoxGeometry(len / segs * 1.05, 0.2, 0.18), stoneDarkMat);
      b.position.set(x, RIVER_SURFACE + 1.2 + yArch, side * (wid / 2 + 0.02));
      b.receiveShadow = true;
      g.add(b);
    }
  }
  return g;
}

// Stable prozedurale ID pro Karten-Bruecke. Format: `p:bridge:${type}_${idx}`.
// Wichtig: idx referenziert den Eintrag in BRIDGES (nicht pro Typ), damit
// die ID eindeutig bleibt wenn weitere Bruecken desselben Typs hinzukommen.
export function bridgeProcId(type, idx) {
  return `p:bridge:${type}_${idx}`;
}

// Baut die Karten-Bruecken. Wenn ein sceneDoc uebergeben wird, werden
// procOverrides angewendet (verschoben / rotiert / skaliert / geloescht).
// Jede Bruecke ist eine THREE.Group mit userData.editable — damit funktioniert
// Picking im Editor exakt wie bei Haeusern.
export function createBridges(sceneDoc = null) {
  const group = new THREE.Group();
  group.name = 'bridges';
  for (let i = 0; i < BRIDGES.length; i++) {
    const b = BRIDGES[i];
    const procId = bridgeProcId(b.type, i);
    const ov = sceneDoc && sceneDoc.procOverrides ? sceneDoc.procOverrides[procId] : null;
    if (ov && ov.deleted) continue;
    const baseX = toWorldX(b.px[0]);
    const baseZ = toWorldZ(b.px[1]);
    const baseRot = THREE.MathUtils.degToRad(b.angleDeg);
    const x = (ov && Number.isFinite(ov.x)) ? ov.x : baseX;
    const z = (ov && Number.isFinite(ov.z)) ? ov.z : baseZ;
    const rotY = (ov && Number.isFinite(ov.rotY)) ? ov.rotY : baseRot;
    const scale = (ov && Number.isFinite(ov.scale)) ? ov.scale : 1.0;
    // Shift-Drag-Hoehenoffset: Bruecken stehen normal auf y=0 (Geometrie ist
    // um RIVER_SURFACE herum). Ein Offset hebt sie z.B. fuer Hoch-Bruecken an.
    const yOffset = (ov && Number.isFinite(ov.yOffset)) ? ov.yOffset : 0;
    const mesh = b.type === 'wood'
      ? makeWoodBridge(b.length, b.width)
      : makeStoneBridge(b.length, b.width);
    mesh.position.set(x, yOffset, z);
    mesh.rotation.y = rotY;
    mesh.scale.setScalar(scale);
    mesh.name = `editable:bridge.${b.type}:${procId}`;
    mesh.userData.editable = {
      id: procId,
      type: `bridge.${b.type}`,
      scale,
      standardHouseId: null,
      procId,
      isBridge: true,
      isLight: false,
      yOffset,
    };
    group.add(mesh);
  }
  return group;
}
