// Nachthimmel: Gradient-Dome mit grossen, deutlich sichtbaren Violett-Wolken,
// dezente Sterne, kleiner, matter Mond mit sehr kleinem Halo.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

const MOON_DIR_DEFAULT = new THREE.Vector3(-0.95, 0.35, -0.4).normalize();

export function createSkyDome(moonDir = MOON_DIR_DEFAULT, { fbmIters = 5 } = {}) {
  // Weniger Segmente -> weniger Vertex-Last (ist ohnehin ein ferner Dome).
  const geo = new THREE.SphereGeometry(180, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: { FBM_ITERS: Math.max(2, Math.min(6, fbmIters | 0)) },
    uniforms: {
      uTop:      { value: new THREE.Color(PALETTE.skyTop) },
      uMid:      { value: new THREE.Color(PALETTE.skyMid) },
      uHorizon:  { value: new THREE.Color(PALETTE.skyHorizon) },
      uGlow:     { value: new THREE.Color(PALETTE.skyGlow) },
      uCloudDark:  { value: new THREE.Color(PALETTE.cloudDark) },
      uCloudLight: { value: new THREE.Color(PALETTE.cloudLight) },
      uCloudEdge:  { value: new THREE.Color(PALETTE.cloudEdge) },
      uMoonDir:  { value: moonDir.clone().normalize() },
      uTime:     { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDir;
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uCloudDark;
      uniform vec3 uCloudLight;
      uniform vec3 uCloudEdge;
      uniform vec3 uMoonDir;
      uniform float uTime;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0,0.0));
        float c = hash(i + vec2(0.0,1.0));
        float d = hash(i + vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      float fbm(vec2 p){
        float v = 0.0; float a = 0.5;
        for(int k = 0; k < FBM_ITERS; k++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main() {
        float t = clamp(vWorldDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.35, t));
        col = mix(col, uTop, smoothstep(0.32, 0.95, t));

        // dezenter Mond-Halo am Himmel
        float md = max(dot(vWorldDir, uMoonDir), 0.0);
        col += uGlow * pow(md, 12.0) * 0.18;

        // Grosse weiche Wolken — Projektion aus der XZ-Ebene auf eine tangentiale
        // Flaeche ueber uns. Das vermeidet die atan()-Diskontinuitaet, die vorher
        // als vertikaler dunkler Streifen zwischen -PI und +PI auftrat.
        float yAbs = max(vWorldDir.y, 0.001);
        vec2 uv = vWorldDir.xz / yAbs * 0.6;
        uv += vec2(uTime * 0.012, 0.0);
        float n = fbm(uv * 0.85);
        float n2 = fbm(uv * 1.7 + 17.0);
        // deutlich niedrigerer Threshold -> viel mehr Wolken sichtbar
        float cloudMask = smoothstep(0.05, 0.42, n * 0.78 + n2 * 0.22);
        // Wolken duerfen bis fast zum Horizont kommen
        float horizonFade = smoothstep(0.01, 0.12, t);
        cloudMask *= horizonFade;
        // Rim-Light nahe Mond
        float moonCloud = pow(md, 3.0) * 0.5;
        float edgeMask = clamp(moonCloud * (n - 0.15), 0.0, 1.0);
        cloudMask = clamp(cloudMask + moonCloud * 0.3, 0.0, 1.0);

        // Wolkenfarbe: dunkel violett im Kern, heller am Rand
        vec3 cloudCol = mix(uCloudDark, uCloudLight, smoothstep(0.15, 1.0, n));
        cloudCol = mix(cloudCol, uCloudEdge, edgeMask * 0.6);

        col = mix(col, cloudCol, cloudMask * 0.97);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.name = 'skyDome';
  dome.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  // Exponiert, damit dayNight die Farben live updaten kann.
  dome.userData.material = mat;
  dome.userData.setColors = (c) => {
    if (c.skyTop)     mat.uniforms.uTop.value.copy(c.skyTop);
    if (c.skyMid)     mat.uniforms.uMid.value.copy(c.skyMid);
    if (c.skyHorizon) mat.uniforms.uHorizon.value.copy(c.skyHorizon);
    if (c.skyGlow)    mat.uniforms.uGlow.value.copy(c.skyGlow);
    if (c.cloudDark)  mat.uniforms.uCloudDark.value.copy(c.cloudDark);
    if (c.cloudLight) mat.uniforms.uCloudLight.value.copy(c.cloudLight);
    if (c.cloudEdge)  mat.uniforms.uCloudEdge.value.copy(c.cloudEdge);
    if (c.sunDir)     mat.uniforms.uMoonDir.value.copy(c.sunDir).normalize();
  };
  return dome;
}

// Sterne: dezenter als vorher — kleinere Groessen, weniger Alpha.
export function createStars(count = 650) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const twinkle = new Float32Array(count);
  const R = 170;
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random() * 0.7 + 0.3;
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    positions[i * 3 + 0] = R * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = R * Math.cos(phi);
    positions[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.5 + Math.random() * 1.4;
    twinkle[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uPx:   { value: 1 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aTwinkle;
      uniform float uTime;
      uniform float uPx;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.5 + 0.5 * sin(uTime * 1.6 + aTwinkle);
        vAlpha = 0.3 + 0.4 * tw;
        gl_PointSize = aSize * uPx * (160.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        a *= vAlpha;
        gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), a);
      }
    `,
  });

  const stars = new THREE.Points(geo, mat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  stars.name = 'stars';
  stars.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return stars;
}

// Mond: kleine, matte Scheibe, Halo fast weg (Palia / Tiny Glade Vibe).
export function createMoon(moonDir) {
  const group = new THREE.Group();
  const dist = 140;
  const dir = moonDir.clone().normalize().multiplyScalar(dist);

  const coreMat = new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    fog: false,
    uniforms: {
      uCore:   { value: new THREE.Color(PALETTE.moonCore) },
      uCrater: { value: new THREE.Color(PALETTE.moonCrater) },
    },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vLocal;
      uniform vec3 uCore;
      uniform vec3 uCrater;

      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise3(vec3 p){
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f*f*(3.0-2.0*f);
        float n000 = hash(i);
        float n100 = hash(i + vec3(1,0,0));
        float n010 = hash(i + vec3(0,1,0));
        float n110 = hash(i + vec3(1,1,0));
        float n001 = hash(i + vec3(0,0,1));
        float n101 = hash(i + vec3(1,0,1));
        float n011 = hash(i + vec3(0,1,1));
        float n111 = hash(i + vec3(1,1,1));
        return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
                   mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
      }
      float fbm(vec3 p){
        float v=0.0; float a=0.5;
        for(int k=0;k<4;k++){ v += a*noise3(p); p*=2.0; a*=0.5; }
        return v;
      }

      void main() {
        vec3 n = normalize(vLocal);
        vec3 dirLocal = normalize(vec3(0.6, 0.6, 0.5));
        float lambert = max(dot(n, dirLocal), 0.0);
        float shade = mix(0.72, 1.0, lambert);

        float m = fbm(vLocal * 2.4);
        float m2 = fbm(vLocal * 6.5 + 7.0);
        float craters = smoothstep(0.52, 0.78, m * 0.65 + m2 * 0.35);

        vec3 col = mix(uCore, uCrater, craters * 0.55);
        col *= shade;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // Groesse an den neuen Dome-Radius angepasst (dist jetzt 140).
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 32, 24),
    coreMat,
  );
  core.position.copy(dir);
  core.name = 'moonCore';
  group.add(core);

  // Halo fast weg: kleinere Plane + geringere Alpha + steiler Falloff
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE.moonHalo) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 uColor;
      void main() {
        float d = distance(vUv, vec2(0.5));
        float a = smoothstep(0.5, 0.2, d);
        a = pow(a, 4.0);
        gl_FragColor = vec4(uColor, a * 0.12);
      }
    `,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), haloMat);
  halo.position.copy(dir);
  group.add(halo);
  group.userData.billboard = halo;
  group.renderOrder = -8;
  group.name = 'moon';
  // Dynamische Richtung + Sichtbarkeit (fuer Tageszeit-Slider).
  group.userData.setDir = (newDir) => {
    const d = newDir.clone().normalize().multiplyScalar(dist);
    core.position.copy(d);
    halo.position.copy(d);
  };
  return group;
}
