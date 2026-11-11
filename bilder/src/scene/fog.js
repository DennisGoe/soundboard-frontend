// Tiefliegender Bodennebel: mehrere halbtransparente, langsam treibende
// Nebel-Ebenen. Shader macht aus einer einfachen Noise-ueberlagerung einen
// Wolken-Look. Von Laternen wird der Nebel durch die Punktlichter angestrahlt,
// deshalb reagiert das Material auf die Szenen-Beleuchtung (StandardMaterial-Basis).
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

export function createGroundFog({ radius = 22, layers = 3 } = {}) {
  const group = new THREE.Group();
  group.name = 'groundFog';

  for (let i = 0; i < layers; i++) {
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 24, 24);
    geo.rotateX(-Math.PI / 2);

    // MeshStandardMaterial, damit die Nebel-Bodenplanes von Laternen &
    // Mondlicht angestrahlt werden koennen (warm an Laternen, blau unterm Mond).
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.skyHorizon).lerp(new THREE.Color(PALETTE.fogColor), 0.2),
      emissive: new THREE.Color(0x24345a),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
      blending: THREE.NormalBlending,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uLayer = { value: i };
      shader.uniforms.uCenterR = { value: radius };
      mat.userData.shader = shader;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uLayer;
           varying vec2 vWorldXZ;
          `
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3( position );
           // Leichte Vertex-Verformung (welliges Nebelband)
           vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
           vWorldXZ = wp.xz;
           float n = sin(wp.x * 0.3 + uTime * 0.25 + uLayer * 1.7)
                   + sin(wp.z * 0.21 - uTime * 0.18 + uLayer * 2.3);
           transformed.y += n * 0.08;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uLayer;
           uniform float uCenterR;
           varying vec2 vWorldXZ;
           // simple pseudo-noise
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
             float v=0.0; float a=0.5;
             for(int k=0;k<4;k++){ v += a*noise(p); p*=2.0; a*=0.5; }
             return v;
           }
          `
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec2 drift = vec2(uTime * 0.04 * (1.0 + uLayer * 0.3), uTime * 0.02);
           float n = fbm(vWorldXZ * 0.18 + drift + uLayer * 11.3);
           n = smoothstep(0.35, 0.85, n);
           // Radial-Fade zum Rand (Nebel dichter innen rund um das Dorf)
           float d = length(vWorldXZ) / uCenterR;
           float radial = smoothstep(1.0, 0.1, d);
           float a = n * radial * (0.45 - uLayer * 0.06);
           vec4 diffuseColor = vec4( diffuse, a );`
        );
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.15 + i * 0.25;
    mesh.renderOrder = 2 + i;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  group.userData.update = (t) => {
    group.traverse(o => {
      if (o.isMesh && o.material.userData.shader) {
        o.material.userData.shader.uniforms.uTime.value = t;
      }
    });
  };
  return group;
}
