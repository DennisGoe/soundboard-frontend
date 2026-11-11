// Gluehwuermchen: leuchtende Punkte, die langsam schweben.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { sampleHeight } from './terrain.js';

export function createFireflies(count = 70, radius = 14, exclude = [], opts = {}) {
  const centerX = opts.centerX ?? 0;
  const centerZ = opts.centerZ ?? 0;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const freqs = new Float32Array(count);
  // Startpunkte: nur in Bodennaehe (<=1.2m), nur im inneren Ring 4..radius.
  // Vordergrund (grob: Kamera-Strahl +X/+Z) etwas ausduennen — dort wirkten
  // die Fireflies vorher wie Schneeflocken.
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 20) {
    tries++;
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * (radius - 4);
    const x = Math.cos(a) * r + centerX;
    const z = Math.sin(a) * r + centerZ;
    if (inAny(x, z, exclude)) continue;
    // Vordergrund (+X und +Z, Kamera-Seite): 65% ausduennen
    if ((x - centerX) > 2 && (z - centerZ) > 2 && Math.random() < 0.65) continue;
    positions[placed * 3 + 0] = x;
    positions[placed * 3 + 1] = sampleHeight(x, z) + 0.3 + Math.random() * 0.9; // ueber Boden
    positions[placed * 3 + 2] = z;
    phases[placed] = Math.random() * 100;
    freqs[placed] = 0.3 + Math.random() * 0.45;
    placed++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, placed * 3), 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases.subarray(0, placed), 1));
  geo.setAttribute('aFreq',  new THREE.BufferAttribute(freqs.subarray(0, placed), 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.fireflyGlow) },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aFreq;
      uniform float uTime;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * aFreq + aPhase) * 0.5;
        p.z += cos(uTime * aFreq * 0.8 + aPhase * 1.3) * 0.5;
        p.y += sin(uTime * 0.6 + aPhase * 0.7) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float pulse = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 3.0 + aPhase * 2.1));
        vA = pulse;
        // ~1/3 der bisherigen Groesse, damit sie nicht wie Schneeflocken wirken
        gl_PointSize = (0.9 + 0.8 * pulse) * (160.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d);
        a = pow(a, 2.0);
        gl_FragColor = vec4(uColor * 0.9, a * vA * 0.75);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'fireflies';
  pts.userData.update = (t) => { mat.uniforms.uTime.value = t; };
  return pts;
}

function inAny(x, z, rects) {
  for (const r of rects) {
    if (Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2) return true;
  }
  return false;
}
