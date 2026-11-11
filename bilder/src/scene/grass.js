// Weiche gebogene Grashalme (Bezier aus 5 Segmenten).
// InstancedMesh, Farbverlauf Wurzel dunkel -> Spitze hell, Wind als Wellen.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { sampleHeight } from './terrain.js';
import { distanceToPaths } from './paths.js';
import { distanceToRivers, isInField, WORLD_W, WORLD_D } from './mapLayout.js';
import { distanceToHousePaths } from './housePaths.js';

// --- Geometrie: ein gebogener Grashalm, 5 Segmente, nach oben verjuengt ---
function makeBladeGeometry() {
  const segs = 5;
  const bendMax = 0.18;   // seitlicher Bend an der Spitze (lokal)
  const height = 0.55;    // Halmhoehe
  // breitere Basis: aus Nahansicht waren die alten 0.025 so duenn, dass einzelne
  // Halme wie schwarze Linien gegen das Mondlicht wirkten.
  const baseW = 0.055;
  // Positionen: zwei Spalten links/rechts, pro segment ein y
  const verts = [];
  const uvs = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = t * height;
    const w = baseW * (1 - t * 0.9); // oben fast spitz
    // Bend-Kurve (quadratisch): x = bendMax * t^2
    const bx = bendMax * t * t;
    verts.push(-w + bx, y, 0);
    verts.push( w + bx, y, 0);
    uvs.push(0, t, 1, t);
  }
  const positions = new Float32Array(verts);
  const uvArr = new Float32Array(uvs);
  const indices = [];
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    // zwei Dreiecke pro Segment
    indices.push(a, a + 1, a + 2);
    indices.push(a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function createGrassField({
  count = 14000,
  innerRadius = 5,
  outerRadius = 20,
  excludeRects = [],
  centerX = 0,
  centerZ = 0,
  // Wenn mapMode=true: statt Kreis wird das ganze Dorf-Umfeld rechteckig
  // (WORLD_W x WORLD_D) belegt, mit Dichte-Falloff vom Dorfzentrum.
  mapMode = false,
  mapWidth = WORLD_W,
  mapDepth = WORLD_D,
  densityFalloff = 0.35,   // Weit weg vom Zentrum nur noch densityFalloff*100% der Kandidaten
} = {}) {
  const geo = makeBladeGeometry();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    roughness: 1.0,
    metalness: 0.0,
    // kleiner Emissive-Lift: edge-on-Halme erhalten einen minimalen Grundton,
    // damit sie nicht als schwarze Striche gegen den Hintergrund erscheinen.
    emissive: new THREE.Color(PALETTE.grassDark),
    emissiveIntensity: 0.22,
  });

  // Shader-Injection: Wind + Farbverlauf + Tageszeit-Shift (nachts kuehl-blaeulich)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: 0.18 };
    shader.uniforms.uColRoot = { value: new THREE.Color(PALETTE.grassDark) };
    shader.uniforms.uColTip  = { value: new THREE.Color(PALETTE.grassLit) };
    // uNightMix 0..1 (0 = Tag, 1 = Nacht).
    shader.uniforms.uNightMix = { value: 0.0 };
    // Kuehler Nachtton — leicht blaeulich (NICHT mint).
    shader.uniforms.uNightTint = { value: new THREE.Color(0x4a6680) };
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWindStrength;
         varying float vT;
         attribute float aPhase;
        `
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3( position );
         vT = clamp(position.y / 0.55, 0.0, 1.0);
         float tipMask = vT * vT;
         // Wellenwind ueber die Wiese: welle abhaengig von Instanzposition
         // (aus instanceMatrix extrahieren)
         #ifdef USE_INSTANCING
           vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float wave = sin(worldOrigin.x * 0.35 + worldOrigin.z * 0.25 + uTime * 1.5 + aPhase) * 0.6
                      + sin(worldOrigin.z * 0.6 - uTime * 0.9 + aPhase * 1.4) * 0.4;
         #else
           float wave = sin(uTime);
         #endif
         float sway = wave * uWindStrength * tipMask;
         transformed.x += sway;
         transformed.z += sway * 0.4;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vT;
         uniform vec3 uColRoot;
         uniform vec3 uColTip;
         uniform float uNightMix;
         uniform vec3 uNightTint;
        `
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec3 grad = mix(uColRoot, uColTip, smoothstep(0.0, 1.0, vT));
         // Nachts kuehl-blaeulich shiften, NICHT mintgruen.
         // De-saturieren + Blau-Tint ueberlagern.
         float luma = dot(grad, vec3(0.2126, 0.7152, 0.0722));
         vec3 desat = mix(grad, vec3(luma), 0.55);
         vec3 nightCol = desat * uNightTint * 1.4;
         vec3 final = mix(grad, nightCol, uNightMix);
         vec4 diffuseColor = vec4( final, opacity );`
      );
  };

  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.castShadow = false;
  inst.receiveShadow = true;
  inst.frustumCulled = false;

  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const colA = new THREE.Color(PALETTE.grass);
  const colB = new THREE.Color(PALETTE.grassDark);
  const colC = new THREE.Color(PALETTE.grassLit);
  const tmp = new THREE.Color();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  let placed = 0;
  let tries = 0;
  const maxTries = count * 15;
  // Max-Radius fuer rechteckigen mapMode-Falloff
  const mapHalfW = mapWidth * 0.5;
  const mapHalfD = mapDepth * 0.5;
  const mapMaxR = Math.hypot(mapHalfW, mapHalfD);
  while (placed < count && tries < maxTries) {
    tries++;
    let x, z, r;
    if (mapMode) {
      // Rechteckig ueber die ganze Karte
      x = (Math.random() - 0.5) * mapWidth;
      z = (Math.random() - 0.5) * mapDepth;
      r = Math.hypot(x - centerX, z - centerZ);
      // Distanz-Ausduennung: weit weg vom Dorfzentrum, nur densityFalloff * 100%
      const rt = Math.min(1, r / (mapMaxR * 0.6));
      const keepP = THREE.MathUtils.lerp(1.0, densityFalloff, rt);
      if (Math.random() > keepP) continue;
    } else {
      // Flaechen-gleichverteilt im Kreis
      const a = Math.random() * Math.PI * 2;
      // sqrt fuer gleichmaessige Flaechendichte
      r = Math.sqrt(
        Math.random() * (outerRadius * outerRadius - innerRadius * innerRadius)
        + innerRadius * innerRadius
      );
      x = Math.cos(a) * r + centerX;
      z = Math.sin(a) * r + centerZ;
      // Distanz-Ausduennung nach aussen: 20% nach outerRadius*0.8 verwerfen
      if (r > outerRadius * 0.75 && Math.random() < 0.35) continue;
    }
    if (inAnyRect(x, z, excludeRects)) continue;
    // Keine Halme auf den Wegen, im Wasser oder in Aeckern
    if (distanceToPaths(x, z) < 0.6) continue;
    if (distanceToHousePaths(x, z) < 0.35) continue;
    if (distanceToRivers(x, z) < 2.6) continue;
    if (isInField(x, z)) continue;

    p.set(x, sampleHeight(x, z), z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    s.setScalar(0.75 + Math.random() * 0.75);
    m.compose(p, q, s);
    inst.setMatrixAt(placed, m);
    phases[placed] = Math.random() * Math.PI * 2;

    // kleine Farbvariation PRO Halm (ueberschreibt Shader-Gradient leicht) —
    // vorher dominierte grassDark (B) → viele Halme wurden nahezu schwarz. Jetzt
    // Gewicht in Richtung mid/lit shift, Lightness-Jitter nur nach oben.
    const t = Math.random();
    if (t < 0.5) tmp.copy(colC);
    else if (t < 0.85) tmp.copy(colA);
    else tmp.copy(colB);
    tmp.offsetHSL(0, (Math.random() - 0.5) * 0.04, Math.random() * 0.08);
    colors[placed * 3 + 0] = tmp.r;
    colors[placed * 3 + 1] = tmp.g;
    colors[placed * 3 + 2] = tmp.b;
    placed++;
  }
  inst.count = placed;
  inst.instanceMatrix.needsUpdate = true;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  inst.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

  inst.userData.update = (t) => {
    const sh = mat.userData.shader;
    if (sh) sh.uniforms.uTime.value = t;
  };
  inst.userData.count = placed;
  inst.name = 'grass';
  return inst;
}

// Blumen bei Nacht – kleine farbige Punkte, leicht emissive (damit sie nicht ganz untergehen)
export function createFlowers({
  count = 160,
  innerRadius = 5,
  outerRadius = 17,
  excludeRects = [],
  centerX = 0,
  centerZ = 0,
} = {}) {
  const group = new THREE.Group();
  const colors = [0xd24a4a, 0xf3d24a, 0xffffff, 0xb979e8];
  for (const c of colors) {
    const geo = new THREE.SphereGeometry(0.08, 6, 5);
    const mat = new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.7,
      emissive: c,
      emissiveIntensity: 0.15,
    });
    const n = Math.floor(count / colors.length);
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let placed = 0;
    let tries = 0;
    while (placed < n && tries < n * 20) {
      tries++;
      const a = Math.random() * Math.PI * 2;
      const r = innerRadius + Math.random() * (outerRadius - innerRadius);
      const x = Math.cos(a) * r + centerX;
      const z = Math.sin(a) * r + centerZ;
      if (inAnyRect(x, z, excludeRects)) continue;
      if (distanceToPaths(x, z) < 0.6) continue;
      if (distanceToRivers(x, z) < 2.6) continue;
      if (isInField(x, z)) continue;
      p.set(x, sampleHeight(x, z) + 0.05, z);
      s.setScalar(0.7 + Math.random() * 0.6);
      m.compose(p, q, s);
      inst.setMatrixAt(placed, m);
      placed++;
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
    inst.castShadow = false;
    inst.receiveShadow = true;
    group.add(inst);
  }
  group.name = 'flowers';
  return group;
}

function inAnyRect(x, z, rects) {
  for (const rect of rects) {
    if (Math.abs(x - rect.x) < rect.w / 2 && Math.abs(z - rect.z) < rect.d / 2) {
      return true;
    }
  }
  return false;
}
