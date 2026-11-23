// Shared visual look: studio environment lighting, physically based materials
// by tissue type, a distinct shade per bone so neighbours separate clearly,
// and depth classes used by the twin and the atlas.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function studio(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(1.2, 2.4, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb4ff, 0.9); rim.position.set(-2, 1.4, -2.2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x18121f, 0.35));
}

// Tissue kind from the FMA name (and layer). Used only for appearance.
export function tissueKind(part) {
  const n = part.name;
  if (part.layer !== 'skeleton') return part.layer;
  if (/intervertebral disk/.test(n)) return 'disc';
  if (/tooth/.test(n)) return 'tooth';
  if (/cartilage/.test(n)) return 'cartilage';
  if (/ligament|membrane|tendon|retinaculum/.test(n)) return 'ligament';
  return 'bone';
}

export const KIND_LABEL = { bone: 'Bone', cartilage: 'Cartilage', disc: 'Intervertebral disc', ligament: 'Ligament / membrane', tooth: 'Tooth' };

const BASE = {
  bone: { color: 0xeee3cc, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.3, sheenColor: 0xfff1d6 },
  cartilage: { color: 0x9fd3ea, roughness: 0.25, transmission: 0.35, thickness: 0.004, clearcoat: 0.6, opacity: 0.85, transparent: true },
  disc: { color: 0x78b8ff, roughness: 0.3, clearcoat: 0.7, transmission: 0.25, thickness: 0.006 },
  ligament: { color: 0xd9e4ee, roughness: 0.35, sheen: 0.9, sheenColor: 0xffffff, clearcoat: 0.4 },
  tooth: { color: 0xfffaf0, roughness: 0.18, clearcoat: 1.0, clearcoatRoughness: 0.08 },
};

// Deterministic per-name shade so each bone reads as its own piece.
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

export function materialFor(part, layerColor, clipping = []) {
  const k = tissueKind(part);
  if (BASE[k]) {
    const b = BASE[k];
    const m = new THREE.MeshPhysicalMaterial({ ...b, color: new THREE.Color(b.color), ...(b.sheenColor ? { sheenColor: new THREE.Color(b.sheenColor) } : {}), side: THREE.DoubleSide, clippingPlanes: clipping });
    if (k === 'bone') {
      const h = hash(part.name);
      m.color.offsetHSL((h - 0.5) * 0.035, (h - 0.5) * 0.12, (h - 0.5) * 0.09); // small, visible separation between neighbours
    }
    return m;
  }
  const soft = { muscles: { roughness: 0.6, sheen: 0.6, sheenColor: 0xffb3b3 }, arteries: { roughness: 0.35, clearcoat: 0.5 }, veins: { roughness: 0.35, clearcoat: 0.5 },
    nerves: { roughness: 0.4, sheen: 0.5, sheenColor: 0xfff3b0 }, organs: { roughness: 0.4, clearcoat: 0.6 }, skin: { roughness: 0.65 } }[k] || {};
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(layerColor), ...soft, ...(soft.sheenColor ? { sheenColor: new THREE.Color(soft.sheenColor) } : {}), side: THREE.DoubleSide, clippingPlanes: clipping,
    transparent: k === 'skin', opacity: k === 'skin' ? 0.3 : 1, depthWrite: k !== 'skin' });
}

// Depth classes: what is shown, from deepest (bones) outward.
export const DEPTH_CLASSES = [
  { key: 1, label: 'Bones', show: (p) => tissueKind(p) === 'bone' || tissueKind(p) === 'tooth' },
  { key: 2, label: '+ cartilage, discs, ligaments', show: (p) => p.layer === 'skeleton' },
  { key: 3, label: '+ muscles & tendons', show: (p) => p.layer === 'skeleton' || p.layer === 'muscles' },
  { key: 4, label: '+ vessels, nerves, organs', show: (p) => p.layer !== 'skin' },
  { key: 5, label: '+ skin', show: () => true },
];
