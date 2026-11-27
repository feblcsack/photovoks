/**
 * Low-poly "pals" — chunky PS1/PS2-era animals that photobomb the booth
 * photos (duck, pigeon, chicken, sheep, monkey, crab, shark, seagull).
 * Original models built from a handful of low-segment primitives with flat
 * shading and per-triangle colour jitter (that faceted 90s look). Each is
 * rendered once into a transparent sprite canvas; nothing is downloaded.
 *
 * Browser only, loaded lazily (three.js).
 */
import * as THREE from 'three';

import { PAL_IDS, type PalId } from '@/lib/booth/pals';

export { PAL_IDS, PAL_LABELS, bakePal, palFor, type PalId, type PalPlacement } from '@/lib/booth/pals';

// ── Faceted building blocks ──────────────────────────────────────────────────

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Non-indexed geometry with a jittered flat colour per triangle. */
function facet(geo: THREE.BufferGeometry, color: string, jitter = 0.09): THREE.Mesh {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const base = new THREE.Color(color);
  const cols: number[] = [];
  const n = g.attributes.position.count;
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd() - 0.5) * 2 * jitter;
    const c = base.clone().multiplyScalar(k);
    for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }));
  return m;
}

const blob = (r: number, color: string, detail = 1) => facet(new THREE.IcosahedronGeometry(r, detail), color);
const box = (w: number, h: number, d: number, color: string) => facet(new THREE.BoxGeometry(w, h, d), color, 0.05);
const cone = (r: number, h: number, color: string, seg = 5) => facet(new THREE.ConeGeometry(r, h, seg), color, 0.06);
const cyl = (r1: number, r2: number, h: number, color: string, seg = 5) => facet(new THREE.CylinderGeometry(r1, r2, h, seg), color, 0.05);

function place<T extends THREE.Object3D>(o: T, p: [number, number, number], s: [number, number, number] = [1, 1, 1], r: [number, number, number] = [0, 0, 0]): T {
  o.position.set(...p);
  o.scale.set(...s);
  o.rotation.set(...r);
  return o;
}

/** Glossy cartoon eye (black + white glint). */
function eye(p: [number, number, number], size = 0.07): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color: '#120C08' })));
  g.add(place(new THREE.Mesh(new THREE.SphereGeometry(size * 0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })), [size * 0.35, size * 0.35, size * 0.75]));
  g.position.set(...p);
  return g;
}

function legs(g: THREE.Group, color: string, xs: number[], y: number, len: number, z = 0) {
  for (const x of xs) {
    g.add(place(cyl(0.035, 0.03, len, color, 4), [x, y - len / 2, z]));
    g.add(place(box(0.16, 0.03, 0.2, color), [x, y - len, z + 0.06]));
  }
}

// ── Models (all face +x, i.e. to the right) ─────────────────────────────────

function bebek() {
  const g = new THREE.Group();
  g.add(place(blob(0.55, '#8F8A7E'), [0, 0.55, 0], [1.25, 0.75, 0.85]));
  g.add(place(blob(0.4, '#6B4026'), [0.38, 0.5, 0], [0.7, 0.8, 0.85])); // chest
  g.add(place(cone(0.22, 0.5, '#4A4640'), [-0.75, 0.75, 0], [1, 1, 0.7], [0, 0, 1.25])); // tail
  g.add(place(cyl(0.18, 0.2, 0.08, '#F4EDDC', 7), [0.5, 0.92, 0], [1, 1, 1], [0, 0, -0.4])); // neck ring
  g.add(place(blob(0.32, '#2E6B3A'), [0.62, 1.22, 0], [1.1, 0.95, 0.9]));
  g.add(place(box(0.34, 0.08, 0.2, '#E8B830'), [0.98, 1.16, 0], [1, 1, 1], [0, 0, -0.08]));
  g.add(eye([0.82, 1.32, 0.2]), eye([0.82, 1.32, -0.2]));
  g.add(place(blob(0.38, '#5F5A52', 0), [-0.08, 0.72, 0.38], [1.3, 0.55, 0.2])); // wing
  return g;
}

function merpati() {
  const g = new THREE.Group();
  g.add(place(blob(0.5, '#6E7480'), [0, 0.75, 0], [1.2, 0.85, 0.85]));
  g.add(place(blob(0.32, '#3E6A60'), [0.4, 1.05, 0], [0.9, 0.9, 0.85])); // iridescent neck
  g.add(place(blob(0.08, '#7A4B82', 0), [0.48, 1.0, 0.24], [1.6, 1.2, 0.5]));
  g.add(place(blob(0.25, '#55606E'), [0.6, 1.35, 0], [1.05, 0.95, 0.9]));
  g.add(place(cone(0.06, 0.2, '#2A2A2A', 4), [0.86, 1.32, 0], [1, 1, 1], [0, 0, -1.57]));
  g.add(place(blob(0.04, '#F4EDDC', 0), [0.78, 1.38, 0]));
  g.add(eye([0.72, 1.43, 0.16], 0.05), eye([0.72, 1.43, -0.16], 0.05));
  g.add(place(cone(0.3, 0.6, '#3A3E48', 4), [-0.62, 0.8, 0], [1, 1, 0.5], [0, 0, 1.4])); // tail
  g.add(place(blob(0.42, '#565C68', 0), [-0.12, 0.85, 0.36], [1.3, 0.6, 0.18]));
  legs(g, '#D9897A', [0.05, 0.25], 0.42, 0.36);
  return g;
}

function ayam() {
  const g = new THREE.Group();
  g.add(place(blob(0.55, '#F4F1E8'), [0, 0.7, 0], [1.1, 0.9, 0.85]));
  for (let i = 0; i < 4; i++) g.add(place(cone(0.14, 0.5, '#E6E1D3', 4), [-0.55, 0.95 + i * 0.08, 0], [1, 1, 0.5], [0, 0, 0.7 - i * 0.25]));
  g.add(place(blob(0.3, '#FBF8F0'), [0.45, 1.3, 0], [0.95, 1.05, 0.9]));
  for (let i = 0; i < 3; i++) g.add(place(blob(0.1, '#D42A1E', 0), [0.38 + i * 0.12, 1.62 - Math.abs(i - 1) * 0.03, 0], [0.8, 1.3, 0.5])); // comb
  g.add(place(blob(0.08, '#D42A1E', 0), [0.72, 1.08, 0], [0.7, 1.4, 0.5])); // wattle
  g.add(place(cone(0.08, 0.22, '#F2B33D', 4), [0.82, 1.27, 0], [1, 1, 1], [0, 0, -1.57]));
  g.add(eye([0.62, 1.4, 0.2], 0.06), eye([0.62, 1.4, -0.2], 0.06));
  g.add(place(blob(0.4, '#ECE7DA', 0), [-0.05, 0.82, 0.38], [1.2, 0.65, 0.2]));
  legs(g, '#F2B33D', [-0.05, 0.18], 0.32, 0.3);
  return g;
}

function domba() {
  const g = new THREE.Group();
  // Fluffy wool: a cluster of faceted puffs
  const wool = '#E8EEF4';
  g.add(place(blob(0.6, wool, 1), [0, 0.95, 0], [1.3, 0.95, 1]));
  for (const [x, y, z] of [[-0.5, 1.15, 0.3], [0.3, 1.3, 0.25], [-0.2, 1.3, -0.3], [0.45, 0.95, -0.35], [-0.6, 0.8, -0.2]]) g.add(place(blob(0.3, '#DDE6EF', 1), [x, y, z]));
  g.add(place(box(0.42, 0.5, 0.38, '#1E1A18'), [0.82, 1.05, 0], [1, 1, 1], [0, 0, -0.25]));
  g.add(place(box(0.12, 0.28, 0.06, '#1E1A18'), [0.72, 1.28, 0.26], [1, 1, 1], [0.6, 0, 0.9]));
  g.add(place(box(0.12, 0.28, 0.06, '#1E1A18'), [0.72, 1.28, -0.26], [1, 1, 1], [-0.6, 0, 0.9]));
  g.add(place(blob(0.07, '#F4EDDC', 0), [0.98, 1.14, 0.17]), place(blob(0.07, '#F4EDDC', 0), [0.98, 1.14, -0.17]));
  g.add(eye([1.02, 1.15, 0.19], 0.04), eye([1.02, 1.15, -0.19], 0.04));
  for (const [x, z] of [[-0.45, 0.25], [-0.45, -0.25], [0.4, 0.25], [0.4, -0.25]]) g.add(place(cyl(0.07, 0.06, 0.5, '#1E1A18', 4), [x, 0.3, z]));
  return g;
}

function monyet() {
  const g = new THREE.Group();
  const fur = '#9C5A2E';
  const face = '#F2D4A0';
  g.add(place(blob(0.45, fur), [0, 0.6, 0], [0.9, 1, 0.8])); // body
  g.add(place(blob(0.5, fur), [0, 1.35, 0], [1, 0.95, 0.9])); // head
  g.add(place(blob(0.34, face, 1), [0.06, 1.28, 0.28], [1.1, 0.95, 0.6]));
  for (const s of [-1, 1]) {
    g.add(place(cyl(0.22, 0.22, 0.08, '#E8C890', 7), [0, 1.42, 0.52 * s], [1, 1, 1], [Math.PI / 2, 0, 0])); // ears
    g.add(place(cyl(0.12, 0.1, 0.55, fur, 5), [0.1, 0.62, 0.42 * s], [1, 1, 1], [0.5 * s, 0, 0.4])); // arms
    g.add(place(blob(0.12, face, 0), [0.25, 0.38, 0.55 * s]));
    g.add(place(cyl(0.13, 0.11, 0.35, fur, 5), [0.05, 0.18, 0.22 * s], [1, 1, 1], [0, 0, 1.2])); // legs
  }
  g.add(eye([0.32, 1.42, 0.42], 0.065), eye([0.32, 1.42, 0.12], 0.065));
  g.rotation.y = -0.35;
  // cheeky smile
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 4, 8, Math.PI), new THREE.MeshBasicMaterial({ color: '#3A1A0A' }));
  g.add(place(smile, [0.36, 1.22, 0.27], [1, 1, 1], [0, -0.5, Math.PI]));
  return g;
}

function kepiting() {
  const g = new THREE.Group();
  const shell = '#E0752E';
  g.add(place(blob(0.55, shell, 1), [0, 0.55, 0], [1.25, 0.42, 0.95]));
  for (const s of [-1, 1]) {
    // claws on arms
    g.add(place(cyl(0.07, 0.06, 0.5, '#E8873C', 4), [0.55, 0.62, 0.55 * s], [1, 1, 1], [0.9 * s, 0, 0.8]));
    const claw = new THREE.Group();
    claw.add(place(blob(0.2, '#F0913F', 0), [0, 0, 0], [1.4, 0.8, 0.8]));
    claw.add(place(cone(0.08, 0.3, '#F7C27C', 4), [0.28, 0.08, 0], [1, 1, 0.6], [0, 0, -1.3]));
    claw.add(place(cone(0.07, 0.26, '#F7C27C', 4), [0.26, -0.08, 0], [1, 1, 0.6], [0, 0, -1.9]));
    g.add(place(claw, [0.85, 0.82, 0.78 * s], [1, 1, 1], [0, -0.4 * s, 0.3]));
    // legs
    for (let i = 0; i < 3; i++) g.add(place(cyl(0.035, 0.02, 0.6, '#D9692A', 4), [-0.25 + i * 0.25, 0.3, 0.6 * s], [1, 1, 1], [0.9 * s, 0, -0.1 + i * 0.1]));
    // eye stalks
    g.add(place(cyl(0.025, 0.025, 0.25, '#E0752E', 4), [0.4, 0.85, 0.15 * s]));
    g.add(eye([0.4, 1.0, 0.15 * s], 0.06));
  }
  return g;
}

function hiu() {
  const g = new THREE.Group();
  const top = '#2E4BA8';
  g.add(place(blob(0.5, top, 1), [0, 0.7, 0], [1.9, 0.62, 0.62]));
  g.add(place(blob(0.42, '#D9E2F2', 1), [0.05, 0.6, 0], [1.75, 0.45, 0.55])); // belly
  g.add(place(cone(0.32, 0.5, top, 4), [-1.05, 0.72, 0], [1, 1, 0.25], [0, 0, 1.57])); // tail base
  g.add(place(cone(0.22, 0.6, top, 3), [-1.3, 1.0, 0], [1, 1, 0.3], [0, 0, 0.5]));
  g.add(place(cone(0.18, 0.45, top, 3), [-1.28, 0.42, 0], [1, 1, 0.3], [0, 0, 2.5]));
  g.add(place(cone(0.22, 0.55, '#253F8F', 3), [-0.1, 1.12, 0], [1, 1, 0.3], [0, 0, 0.25])); // dorsal fin
  for (const s of [-1, 1]) g.add(place(cone(0.16, 0.45, '#253F8F', 3), [0.25, 0.45, 0.28 * s], [1, 1, 0.3], [1.1 * s, 0, 1.0]));
  g.add(eye([0.72, 0.82, 0.24], 0.055), eye([0.72, 0.82, -0.24], 0.055));
  g.add(place(box(0.24, 0.04, 0.22, '#C4201A'), [0.82, 0.58, 0], [1, 1, 1], [0, 0, 0.2])); // grin
  g.rotation.z = 0.12;
  return g;
}

function camar() {
  const g = new THREE.Group();
  g.add(place(blob(0.45, '#F7F7F4'), [0, 1.0, 0], [0.85, 1.2, 0.8]));
  g.add(place(blob(0.28, '#FFFFFF'), [0.18, 1.62, 0], [1, 1, 0.9]));
  g.add(place(cone(0.08, 0.32, '#F2C230', 4), [0.5, 1.58, 0], [1, 1, 1], [0, 0, -1.65]));
  g.add(place(blob(0.03, '#C4201A', 0), [0.56, 1.53, 0]));
  g.add(eye([0.36, 1.7, 0.18], 0.045), eye([0.36, 1.7, -0.18], 0.045));
  for (const s of [-1, 1]) g.add(place(blob(0.36, '#9AA3AE', 0), [-0.12, 1.1, 0.33 * s], [0.9, 1.3, 0.2], [0, 0, -0.25]));
  g.add(place(cone(0.18, 0.4, '#2A2A2A', 4), [-0.38, 0.72, 0], [1, 1, 0.5], [0, 0, 2.3])); // tail tip
  legs(g, '#F2C230', [-0.05, 0.15], 0.55, 0.5);
  return g;
}

const BUILDERS: Record<PalId, () => THREE.Group> = { bebek, merpati, ayam, domba, monyet, kepiting, hiu, camar };

// ── Rendering to sprites ─────────────────────────────────────────────────────

/** Copies the render cropped to its visible pixels (+ small margin). */
function trimmed(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  const tctx = tmp.getContext('2d', { willReadFrequently: true })!;
  tctx.drawImage(src, 0, 0);
  const d = tctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return tmp;
  const m = 6;
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(W - 1, x1 + m);
  y1 = Math.min(H - 1, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(tmp, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

let cache: Promise<Record<PalId, HTMLCanvasElement>> | null = null;

/** Renders every pal once (3/4 view, transparent). Cached for the session. */
export function palSprites(size = 512): Promise<Record<PalId, HTMLCanvasElement>> {
  cache ??= new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8c7b66, 1.3));
      const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
      key.position.set(3, 5, 4);
      const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9);
      rim.position.set(-3, 2, -3);
      scene.add(key, rim);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      const out = {} as Record<PalId, HTMLCanvasElement>;
      for (const id of PAL_IDS) {
        seed = 7 + PAL_IDS.indexOf(id) * 131;
        const model = BUILDERS[id]();
        const holder = new THREE.Group();
        holder.add(model);
        holder.rotation.y = -0.55; // 3/4 view, facing viewer-right
        scene.add(holder);
        // Fit the camera to the model.
        const bb = new THREE.Box3().setFromObject(holder);
        const center = bb.getCenter(new THREE.Vector3());
        const sphere = bb.getBoundingSphere(new THREE.Sphere());
        const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.02;
        cam.position.set(center.x + dist * 0.15, center.y + dist * 0.2, center.z + dist);
        cam.lookAt(center);
        renderer.render(scene, cam);
        out[id] = trimmed(canvas);
        scene.remove(holder);
        holder.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | undefined;
          mat?.dispose();
        });
      }
      renderer.dispose();
      renderer.forceContextLoss();
      resolve(out);
    } catch (e) {
      cache = null;
      reject(e);
    }
  });
  return cache;
}

