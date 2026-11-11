// Fluss-Mesh: entlang der Polylinien Strips erzeugen.
// Wasser als ShaderMaterial (custom, ohne three-FogChunk-Risk).
// Mondlicht-Specular + stroemende Wellen per FBM-Noise, langsam driftend.
// Dunkleres Nachtblau-Tuerkis in der Mitte, hellere Uferkante.
import * as THREE from 'three';
import {
  RIVER_MAIN, RIVER_NORTH, RIVER_SOUTH,
  toWorldX, toWorldZ,
} from './mapLayout.js';

const RIVER_SURFACE_Y = -0.25;
const RIVER_HALF_WIDTH = 2.0;

function buildRiverStrip(polyPx, width) {
  const pts = polyPx.map((p) => new THREE.Vector2(toWorldX(p[0]), toWorldZ(p[1])));
  const left = [];
  const right = [];
  const tangents = [];
  for (let i = 0; i < pts.length; i++) {
    let tx, tz;
    if (i === 0) {
      tx = pts[i + 1].x - pts[i].x;
      tz = pts[i + 1].y - pts[i].y;
    } else if (i === pts.length - 1) {
      tx = pts[i].x - pts[i - 1].x;
      tz = pts[i].y - pts[i - 1].y;
    } else {
      tx = pts[i + 1].x - pts[i - 1].x;
      tz = pts[i + 1].y - pts[i - 1].y;
    }
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    tangents.push({ x: tx, z: tz });
    const nx = -tz, nz = tx;
    left.push(new THREE.Vector2(pts[i].x + nx * width, pts[i].y + nz * width));
    right.push(new THREE.Vector2(pts[i].x - nx * width, pts[i].y - nz * width));
  }
  const verts = [];
  const uvs = [];
  const flowDir = []; // pro Vertex: xz Flussrichtung
  let cumLen = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) cumLen += pts[i].distanceTo(pts[i - 1]);
    // uv.x: 0 links, 1 rechts; uv.y: entlang des Flusses
    verts.push(left[i].x, RIVER_SURFACE_Y, left[i].y);
    verts.push(right[i].x, RIVER_SURFACE_Y, right[i].y);
    uvs.push(0, cumLen * 0.4);
    uvs.push(1, cumLen * 0.4);
    const t = tangents[i];
    flowDir.push(t.x, t.z);
    flowDir.push(t.x, t.z);
  }
  const indices = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flowDir, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function makeWaterMaterial(moonDir, { fbmIters = 4 } = {}) {
  const uMoonDir = new THREE.Vector3(moonDir.x, moonDir.y, moonDir.z).normalize();
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    fog: false,
    defines: { FBM_ITERS: Math.max(2, Math.min(5, fbmIters | 0)) },
    uniforms: {
      uTime:     { value: 0 },
      uDeepCol:  { value: new THREE.Color(0x071a28) },
      uMidCol:   { value: new THREE.Color(0x0e3444) },
      uBankCol:  { value: new THREE.Color(0x2a6878) },
      uFoamCol:  { value: new THREE.Color(0x7bb5c2) },
      uMoonDir:  { value: uMoonDir },
      uMoonCol:  { value: new THREE.Color(0xb7c2e0) },
    },
    vertexShader: `
      attribute vec2 aFlow;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec2 vFlow;
      void main() {
        vUv = uv;
        vFlow = aFlow;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec3 uDeepCol;
      uniform vec3 uMidCol;
      uniform vec3 uBankCol;
      uniform vec3 uFoamCol;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonCol;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec2 vFlow;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0,0.0));
        float c = hash(i + vec2(0.0,1.0));
        float d = hash(i + vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
      }
      float fbm(vec2 p){
        float v=0.0; float a=0.5;
        for(int k=0;k<FBM_ITERS;k++){ v += a*noise(p); p*=2.03; a*=0.5; }
        return v;
      }

      void main() {
        // Entfernung vom Mitte-Band (uv.x ~ 0.5)
        float center = abs(vUv.x - 0.5) * 2.0;
        // Zwei stroemende Noise-Lagen entlang vFlow
        vec2 flow = vFlow * uTime * 0.18;
        vec2 p1 = vWorldPos.xz * 0.55 - flow;
        vec2 p2 = vWorldPos.xz * 1.1  - flow * 1.6;
        float w1 = fbm(p1);
        float w2 = fbm(p2 + vec2(13.7, 4.2));
        float wave = (w1 * 0.6 + w2 * 0.4);
        // Tiefenfarbe: Mitte dunkler, Uferkante heller
        vec3 depth = mix(uDeepCol, uMidCol, smoothstep(0.0, 0.7, center));
        vec3 base  = mix(depth, uBankCol, smoothstep(0.7, 1.0, center));
        // Wellen-Modulation
        base += (wave - 0.5) * 0.07;
        // Mond-Highlights: dort, wo wave.*grad nahe Mondrichtung
        float highlight = smoothstep(0.65, 0.95, wave);
        base += uMoonCol * highlight * 0.25;
        // Uferschaum
        float foam = smoothstep(0.85, 1.0, center) * (0.4 + 0.6 * smoothstep(0.55, 0.75, w1));
        base = mix(base, uFoamCol, foam * 0.55);
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });
}

export function createRivers(moonDir, { fbmIters = 4 } = {}) {
  const group = new THREE.Group();
  group.name = 'rivers';

  const geos = [
    buildRiverStrip(RIVER_MAIN,  RIVER_HALF_WIDTH),
    buildRiverStrip(RIVER_NORTH, RIVER_HALF_WIDTH * 0.9),
    buildRiverStrip(RIVER_SOUTH, RIVER_HALF_WIDTH * 0.9),
  ];

  const mat = makeWaterMaterial(moonDir, { fbmIters });

  for (const g of geos) {
    const m = new THREE.Mesh(g, mat);
    m.name = 'river';
    m.renderOrder = 1;
    m.frustumCulled = false;
    m.receiveShadow = false;
    group.add(m);
  }

  group.userData.update = (t) => {
    mat.uniforms.uTime.value = t;
  };

  // Tageszeit-Farbshift: nachts = sehr dunkles Nachtwasser (kein Tuerkis-Glow
  // mehr), tags = helleres klares Blau.
  // Nacht-Palette bewusst stark gedimmt: der frueher sichtbare Tuerkis-Glow
  // (nightBank = 0x2a6878 + Moon-Highlight 0.25) kam fast heller rueber als
  // das Dorf. Jetzt: tief dunkelblau mit nur minimalem Mondglanz.
  const nightDeep = new THREE.Color(0x030810);
  const nightMid  = new THREE.Color(0x071624);
  const nightBank = new THREE.Color(0x102838);
  const nightMoon = new THREE.Color(0x7a84a0);
  const dayDeep   = new THREE.Color(0x1d4a68);   // klares, deutlich helleres Blau
  const dayMid    = new THREE.Color(0x3a7a9a);
  const dayBank   = new THREE.Color(0x6ab0c8);
  const daySun    = new THREE.Color(0xfff2cc);
  const _dtTmp = new THREE.Color();
  group.userData.applyDayTint = (st) => {
    const nm = st.nightMask;
    _dtTmp.copy(dayDeep).lerp(nightDeep, nm); mat.uniforms.uDeepCol.value.copy(_dtTmp);
    _dtTmp.copy(dayMid).lerp(nightMid, nm);   mat.uniforms.uMidCol.value.copy(_dtTmp);
    _dtTmp.copy(dayBank).lerp(nightBank, nm); mat.uniforms.uBankCol.value.copy(_dtTmp);
    _dtTmp.copy(daySun).lerp(nightMoon, nm);  mat.uniforms.uMoonCol.value.copy(_dtTmp);
  };

  // Flusssteine: alle in einem InstancedMesh
  const stoneGeo = new THREE.IcosahedronGeometry(0.28, 0);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x55606e, roughness: 1.0, metalness: 0.0,
  });
  const placements = [];
  const sampleFromPoly = (poly, count) => {
    for (let i = 0; i < count; i++) {
      const seg = Math.floor(Math.random() * (poly.length - 1));
      const t = Math.random();
      const a = poly[seg], b = poly[seg + 1];
      const px = a[0] + (b[0] - a[0]) * t;
      const py = a[1] + (b[1] - a[1]) * t;
      const wx = toWorldX(px);
      const wz = toWorldZ(py);
      const off = (Math.random() - 0.5) * RIVER_HALF_WIDTH * 1.0;
      const dx = toWorldX(b[0]) - toWorldX(a[0]);
      const dz = toWorldZ(b[1]) - toWorldZ(a[1]);
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      placements.push({
        x: wx + nx * off,
        z: wz + nz * off,
        s: 0.4 + Math.random() * 0.8,
        r: Math.random() * Math.PI * 2,
      });
    }
  };
  sampleFromPoly(RIVER_MAIN,  8);
  sampleFromPoly(RIVER_NORTH, 5);
  sampleFromPoly(RIVER_SOUTH, 4);

  const stoneInst = new THREE.InstancedMesh(stoneGeo, stoneMat, placements.length);
  stoneInst.name = 'riverStones';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    pv.set(p.x, RIVER_SURFACE_Y - 0.04, p.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.r);
    sv.set(p.s, 0.5 * p.s, p.s);
    m.compose(pv, q, sv);
    stoneInst.setMatrixAt(i, m);
  }
  stoneInst.instanceMatrix.needsUpdate = true;
  stoneInst.computeBoundingSphere();
  stoneInst.computeBoundingBox();
  stoneInst.receiveShadow = true;
  group.add(stoneInst);

  return group;
}

export const RIVER_SURFACE = RIVER_SURFACE_Y;
