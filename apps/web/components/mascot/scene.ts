/**
 * Real-time 3D buddies (three.js) — "PS2 / Xbox-360 avatar" quality pass.
 *
 * Same four original characters, poses and gags as before, rebuilt with:
 *  - PBR materials + procedural fabric textures (knit tee, denim, khaki
 *    twill, chiffon hijab, suit wool) generated on small canvases;
 *  - real eyes (iris + pupil + double catch-light + lashes), nose, lips,
 *    five-finger hands, neck, collars, cuffs, belts, sneakers with laces,
 *    a printed tee, clumped hair with a sheen band;
 *  - three-point lighting with a rim light, a soft room environment for
 *    reflections, ACES tone mapping and a PS2-style blob shadow.
 * Everything is built from primitives at runtime: no model files to download
 * (zero egress), ~30–45k triangles per character, fine on an iPad.
 *
 * Loaded lazily (dynamic import) so three.js never weighs on pages that don't
 * show a buddy.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { MascotId } from '@/lib/mascots';

const INK = 0x1a1410;

// ── Procedural textures ──────────────────────────────────────────────────────

const texCache = new Map<string, THREE.CanvasTexture>();

function canvasTex(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Seeded noise speckles (fabric fibre / skin grain). */
function speckle(ctx: CanvasRenderingContext2D, s: number, amount: number, alpha: number, seed = 7) {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < amount; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

const TEX = {
  knit: () =>
    canvasTex('knit', 256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.045)';
        ctx.fillRect(x, 0, 2, s);
      }
      speckle(ctx, s, 3000, 0.08);
    }, [3, 3]),
  denim: () =>
    canvasTex('denim', 256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1.2;
      for (let i = -s; i < s * 2; i += 5) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s, s);
        ctx.stroke();
      }
      // faded highlights
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 4000, 0.12, 3);
    }, [2, 2]),
  twill: () =>
    canvasTex('twill', 256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      for (let i = -s; i < s * 2; i += 3) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + s * 0.6, s);
        ctx.stroke();
      }
      speckle(ctx, s, 2500, 0.07, 11);
    }, [3, 3]),
  wool: () =>
    canvasTex('wool', 256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 9000, 0.1, 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let y = 0; y < s; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s, y + 2);
        ctx.stroke();
      }
    }, [3, 3]),
  chiffon: () =>
    canvasTex('chiffon', 256, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#ffffff' : '#ECE7DD');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 1500, 0.04, 9);
    }, [2, 1]),
  skin: () =>
    canvasTex('skin', 128, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 900, 0.035, 13);
    }, [2, 2]),
  hair: () =>
    canvasTex('hair', 256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      let x = 17;
      const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 260; i++) {
        const px = rnd() * s;
        ctx.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
        ctx.lineWidth = 0.6 + rnd();
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.bezierCurveTo(px + 6, s * 0.3, px - 6, s * 0.7, px + rnd() * 4, s);
        ctx.stroke();
      }
      // "Angel ring" sheen band (classic PS2 hair highlight).
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0.3, 'rgba(255,255,255,0)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, [3, 1]),
  stubble: () =>
    canvasTex('stubble', 256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 14000, 0.35, 21);
    }, [2, 2]),
  leather: () =>
    canvasTex('leather', 128, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, 2500, 0.15, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(6, 6, s - 12, s - 12); // stitching
    }),
  book: () =>
    canvasTex('book', 256, (ctx, s) => {
      ctx.fillStyle = '#2747C9';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#FFD43B';
      ctx.font = 'bold 54px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ZINE', s / 2, s * 0.45);
      ctx.fillStyle = '#FF9BD2';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.68, 26, 0, Math.PI * 2);
      ctx.fill();
    }),
  /** Tee graphic: a retro camera badge with "VOKS 98" (like an avatar tee print). */
  teePrint: () =>
    canvasTex('teePrint', 256, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#C4201A';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.44, s * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1A1410';
      ctx.fillRect(s * 0.27, s * 0.33, s * 0.46, s * 0.26);
      ctx.fillRect(s * 0.36, s * 0.27, s * 0.12, s * 0.07);
      ctx.fillStyle = '#9ED8FF';
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.46, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s * 0.47, s * 0.43, s * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `900 ${s * 0.14}px "Arial Black", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD43B';
      ctx.fillText('VOKS 98', s / 2, s * 0.94);
    }),
  /** Iris disc: gradient iris, limbal ring, pupil, two catch-lights. */
  iris: (color: string) =>
    canvasTex(`iris-${color}`, 128, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const c = s / 2;
      const g = ctx.createRadialGradient(c, c * 0.9, 2, c, c, c);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, color);
      g.addColorStop(0.85, color);
      g.addColorStop(1, '#0b0705');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let a = 0; a < Math.PI * 2; a += 0.22) {
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * c * 0.3, c + Math.sin(a) * c * 0.3);
        ctx.lineTo(c + Math.cos(a) * c * 0.85, c + Math.sin(a) * c * 0.85);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0705';
      ctx.beginPath();
      ctx.arc(c, c, c * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c * 1.32, c * 0.66, c * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(c * 0.72, c * 1.3, c * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }),
  blob: () =>
    canvasTex('blob', 128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(20,12,6,0.55)');
      g.addColorStop(0.55, 'rgba(20,12,6,0.25)');
      g.addColorStop(1, 'rgba(20,12,6,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }),
};

// ── Materials ────────────────────────────────────────────────────────────────

type MatKind = 'skin' | 'cloth' | 'denim' | 'twill' | 'wool' | 'chiffon' | 'hair' | 'stubble' | 'rubber' | 'plastic' | 'metal' | 'leather' | 'gloss' | 'flat';

const matCache = new Map<string, THREE.Material>();
function mat(kind: MatKind, color: number | string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.Material {
  const key = `${kind}|${color}|${JSON.stringify(extra)}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  switch (kind) {
    case 'flat':
      m = new THREE.MeshBasicMaterial({ color });
      break;
    case 'skin':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0, map: TEX.skin(), ...extra });
      break;
    case 'hair':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05, map: TEX.hair(), ...extra });
      break;
    case 'stubble':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, map: TEX.stubble(), ...extra });
      break;
    case 'cloth':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.88, map: TEX.knit(), ...extra });
      break;
    case 'denim':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, map: TEX.denim(), ...extra });
      break;
    case 'twill':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, map: TEX.twill(), ...extra });
      break;
    case 'wool':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, map: TEX.wool(), ...extra });
      break;
    case 'chiffon':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, map: TEX.chiffon(), ...extra });
      break;
    case 'rubber':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
      break;
    case 'leather':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, map: TEX.leather(), ...extra });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.95, ...extra });
      break;
    case 'gloss':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0, ...extra });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, ...extra });
  }
  matCache.set(key, m);
  return m;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, m);
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function rot<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.rotation.set(x, y, z);
  return o;
}

function scl<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.scale.set(x, y, z);
  return o;
}

/** Tapered sleeve / leg tube (open cylinder with rounded look). */
function tube(rTop: number, rBottom: number, h: number, m: THREE.Material, seg = 20) {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 3), m);
}

function ring(r: number, thick: number, m: THREE.Material, seg = 28) {
  const o = mesh(new THREE.TorusGeometry(r, thick, 8, seg), m);
  o.rotation.x = Math.PI / 2;
  return o;
}

// ── Rig ──────────────────────────────────────────────────────────────────────

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Object3D;
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Group;
  armL: Arm;
  armR: Arm;
  props: Record<string, THREE.Object3D>;
  /** Eyes are drawn closed (no blinking). */
  closedEyes?: boolean;
  /** Torso group (breathing). */
  chest?: THREE.Object3D;
}

interface Outfit {
  skin: string;
  /** Sleeve material + colour; `short` shows skin forearms. */
  top: { kind: MatKind; color: string; sleeves: 'long' | 'short' };
  bottom: { kind: MatKind; color: string };
  shoes: { upper: string; sole: string; laces: string };
  belt?: string;
  collar?: 'crew' | 'none' | 'shirt';
  ears?: boolean;
}

/** Five-finger hand (relaxed curl). Fingers point down (-y). */
function hand(skin: string, side: -1 | 1, fist = false): THREE.Group {
  const g = new THREE.Group();
  const m = mat('skin', skin);
  const palm = scl(mesh(new THREE.SphereGeometry(0.085, 16, 12), m), 1, 1.15, 0.62);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    at(f, (-0.045 + i * 0.03) * side * -1, -0.075, 0.005);
    const len = [0.07, 0.08, 0.076, 0.062][i];
    const seg = at(mesh(new THREE.CapsuleGeometry(0.0145, len, 3, 8), m), 0, -len / 2, 0);
    f.add(seg);
    f.rotation.x = fist ? 1.6 : 0.35 + i * 0.05;
    g.add(f);
  }
  const thumb = new THREE.Group();
  at(thumb, 0.065 * side * -1, -0.02, 0.03);
  thumb.add(at(mesh(new THREE.CapsuleGeometry(0.017, 0.055, 3, 8), m), 0, -0.035, 0));
  thumb.rotation.set(0.5, 0, 0.55 * side * -1);
  g.add(thumb);
  return g;
}

function arm(side: -1 | 1, o: Outfit): Arm {
  const sleeveMat = mat(o.top.kind, o.top.color);
  const skinMat = mat('skin', o.skin);
  const shoulder = at(new THREE.Group(), 0.43 * side, 1.34, 0);
  // Shoulder ball (smooth join with the torso)
  shoulder.add(mesh(new THREE.SphereGeometry(0.135, 18, 14), sleeveMat));
  const upperLen = 0.3;
  if (o.top.sleeves === 'short') {
    shoulder.add(at(tube(0.135, 0.125, 0.18, sleeveMat), 0, -0.09, 0));
    shoulder.add(at(ring(0.126, 0.012, sleeveMat), 0, -0.18, 0)); // hem
    shoulder.add(at(tube(0.1, 0.092, upperLen - 0.14, skinMat), 0, -0.23, 0));
  } else {
    shoulder.add(at(tube(0.13, 0.11, upperLen, sleeveMat), 0, -upperLen / 2, 0));
  }
  const elbow = at(new THREE.Group(), 0, -upperLen - 0.01, 0);
  shoulder.add(elbow);
  elbow.add(mesh(new THREE.SphereGeometry(o.top.sleeves === 'short' ? 0.092 : 0.11, 14, 12), o.top.sleeves === 'short' ? skinMat : sleeveMat));
  const foreLen = 0.27;
  if (o.top.sleeves === 'short') {
    elbow.add(at(tube(0.09, 0.07, foreLen, skinMat), 0, -foreLen / 2, 0));
  } else {
    elbow.add(at(tube(0.108, 0.092, foreLen, sleeveMat), 0, -foreLen / 2, 0));
    elbow.add(at(ring(0.094, 0.016, sleeveMat), 0, -foreLen + 0.01, 0)); // cuff
    elbow.add(at(tube(0.068, 0.066, 0.05, skinMat), 0, -foreLen - 0.02, 0)); // wrist
  }
  const h = at(hand(o.skin, side), 0, -foreLen - 0.09, 0);
  elbow.add(h);
  return { shoulder, elbow, hand: h };
}

function pose(a: Arm, s: [number, number, number], e: [number, number, number] = [0, 0, 0]) {
  a.shoulder.rotation.set(...s);
  a.elbow.rotation.set(...e);
}

function sneaker(o: Outfit['shoes'], side: -1 | 1): THREE.Group {
  const g = new THREE.Group();
  const sole = scl(at(mesh(new THREE.CapsuleGeometry(0.1, 0.2, 6, 16), mat('rubber', o.sole)), 0, 0.035, 0.05), 1.05, 0.38, 1);
  sole.rotation.x = Math.PI / 2;
  g.add(sole);
  const upper = scl(at(mesh(new THREE.SphereGeometry(0.13, 20, 14), mat('leather', o.upper)), 0, 0.085, 0.03), 0.82, 0.62, 1.35);
  g.add(upper);
  const toe = scl(at(mesh(new THREE.SphereGeometry(0.08, 16, 10), mat('rubber', o.sole)), 0, 0.06, 0.16), 1.05, 0.55, 0.7);
  g.add(toe);
  const collar = at(ring(0.075, 0.018, mat('rubber', o.upper)), 0, 0.15, -0.03);
  g.add(collar);
  for (let i = 0; i < 3; i++) {
    const lace = at(mesh(new THREE.BoxGeometry(0.075, 0.012, 0.014), mat('cloth', o.laces)), 0, 0.14 - i * 0.012, 0.06 + i * 0.03);
    lace.rotation.x = -0.6;
    g.add(lace);
  }
  // little side stripe
  const stripe = at(mesh(new THREE.BoxGeometry(0.01, 0.03, 0.12), mat('plastic', side < 0 ? '#C4201A' : '#C4201A')), 0.105 * side, 0.08, 0.02);
  g.add(stripe);
  return g;
}

function baseRig(o: Outfit): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat('skin', o.skin);
  const topMat = mat(o.top.kind, o.top.color);
  const bottomMat = mat(o.bottom.kind, o.bottom.color);

  // Legs + shoes
  for (const side of [-1, 1] as const) {
    body.add(at(tube(0.155, 0.118, 0.66, bottomMat, 24), 0.155 * side, 0.47, 0));
    body.add(at(ring(0.119, 0.012, bottomMat), 0.155 * side, 0.15, 0)); // hem roll
    body.add(at(sneaker(o.shoes, side), 0.155 * side, 0, 0.02));
  }
  // Hips
  body.add(scl(at(mesh(new THREE.SphereGeometry(0.34, 28, 18), bottomMat), 0, 0.8, 0), 1, 0.62, 0.8));
  if (o.belt) {
    body.add(scl(at(ring(0.325, 0.028, mat('leather', o.belt)), 0, 0.9, 0), 1, 0.8, 1));
    body.add(at(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), mat('metal', '#D8DCE2')), 0, 0.9, 0.262));
  }

  // Torso (chest group breathes)
  const chest = at(new THREE.Group(), 0, 1.12, 0);
  body.add(chest);
  const torso = scl(mesh(new THREE.CapsuleGeometry(0.33, 0.26, 8, 28), topMat), 1, 0.92, 0.78);
  chest.add(torso);
  // Neck + collar
  body.add(at(tube(0.085, 0.095, 0.16, skin), 0, 1.5, 0));
  if (o.collar !== 'none') body.add(scl(at(ring(0.105, o.collar === 'shirt' ? 0.03 : 0.022, topMat), 0, 1.44, 0), 1, 0.9, 1));

  // Head
  const head = at(new THREE.Group(), 0, 1.83, 0);
  body.add(head);
  head.add(scl(mesh(new THREE.SphereGeometry(0.46, 40, 30), skin), 1, 1.04, 0.98));
  // Jaw / cheeks volume
  head.add(scl(at(mesh(new THREE.SphereGeometry(0.33, 28, 20), skin), 0, -0.17, 0.08), 1, 0.72, 0.9));
  if (o.ears !== false) {
    for (const side of [-1, 1]) {
      const ear = scl(at(mesh(new THREE.SphereGeometry(0.085, 14, 10), skin), 0.445 * side, -0.02, 0.0), 0.55, 1, 0.8);
      head.add(ear);
      head.add(scl(at(mesh(new THREE.SphereGeometry(0.04, 10, 8), mat('skin', shade(o.skin, -0.12))), 0.46 * side, -0.02, 0.02), 0.4, 0.9, 0.6));
    }
  }
  // Nose
  head.add(scl(at(mesh(new THREE.SphereGeometry(0.05, 14, 10), skin), 0, -0.08, 0.455), 1, 0.8, 0.85));
  const eyes = new THREE.Group();
  head.add(eyes);

  const armL = arm(-1, o);
  const armR = arm(1, o);
  body.add(armL.shoulder, armR.shoulder);
  pose(armL, [0, 0, -0.12]);
  pose(armR, [0, 0, 0.12]);

  // PS2 blob shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: TEX.blob(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  root.add(shadow);

  return { root, body, head, eyes, armL, armR, props: { shadow }, chest };
}

/** Lightens (+) / darkens (-) a hex colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(Math.min(255, Math.max(0, amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

// ── Face pieces ──────────────────────────────────────────────────────────────

function eyePair(rig: Rig, o: { size?: number; iris?: string; irisScale?: number; dx?: number; dy?: number; y?: number; lashes?: boolean } = {}) {
  const size = o.size ?? 0.1;
  const iris = o.iris ?? '#5A3A22';
  for (const side of [-1, 1]) {
    const g = at(new THREE.Group(), 0.16 * side, o.y ?? 0.04, 0.418);
    const white = scl(mesh(new THREE.SphereGeometry(size, 24, 18), mat('gloss', '#FBF8F2')), 1, 1.12, 0.5);
    g.add(white);
    const ir = mesh(new THREE.CircleGeometry(size * 0.62 * (o.irisScale ?? 1), 28), new THREE.MeshStandardMaterial({ map: TEX.iris(iris), transparent: true, roughness: 0.1 }));
    at(ir, (o.dx ?? 0) * 1, (o.dy ?? 0) - size * 0.05, size * 0.5 + 0.002);
    ir.scale.y = 1.08;
    g.add(ir);
    if (o.lashes !== false) {
      const lash = at(mesh(new THREE.TorusGeometry(size * 0.98, size * 0.06, 6, 20, Math.PI * 0.7), mat('flat', INK)), 0, size * 0.02, size * 0.3);
      lash.rotation.z = Math.PI * 0.15;
      lash.scale.set(1, 1.1, 0.5);
      g.add(lash);
      // outer flick
      const flick = at(mesh(new THREE.CapsuleGeometry(size * 0.05, size * 0.3, 2, 6), mat('flat', INK)), side * size * 0.95, size * 0.45, size * 0.25);
      flick.rotation.z = side * -0.9;
      g.add(flick);
    }
    rig.eyes.add(g);
  }
}

function closedEyes(rig: Rig, y = 0.03) {
  for (const side of [-1, 1]) {
    const arc = at(mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 18, Math.PI), mat('flat', INK)), 0.16 * side, y, 0.43);
    arc.rotation.z = Math.PI; // ‿ shape
    rig.eyes.add(arc);
    // Lash flicks
    for (const k of [0.3, 0.7]) {
      const l = at(mesh(new THREE.CapsuleGeometry(0.006, 0.03, 2, 4), mat('flat', INK)), 0.16 * side + (k - 0.5) * 0.12, y - 0.07, 0.43);
      l.rotation.z = (k - 0.5) * -1.2;
      rig.eyes.add(l);
    }
  }
  rig.closedEyes = true;
}

/** Half lids over the eyes (sleepy / sly). */
function lids(rig: Rig, skin: string, tilt: number, y = 0.05) {
  for (const side of [-1, 1]) {
    const lid = scl(at(mesh(new THREE.SphereGeometry(0.106, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('skin', shade(skin, -0.06))), 0.16 * side, y, 0.405), 1.05, 0.92, 0.6);
    lid.rotation.x = tilt;
    rig.eyes.add(lid);
  }
}

function brows(rig: Rig, y: number, tiltL: number, tiltR: number, color: string = '#2A1A10') {
  for (const [side, tilt] of [[-1, tiltL], [1, tiltR]] as const) {
    const b = at(mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 8), mat('hair', color)), 0.16 * side, y, 0.43);
    b.rotation.z = Math.PI / 2 + tilt;
    b.scale.set(1, 1, 0.6);
    rig.head.add(b);
    rig.props[side < 0 ? 'browL' : 'browR'] = b;
  }
}

function lips(rig: Rig, o: { smile: boolean; r?: number; x?: number; y?: number; tilt?: number; arc?: number; color?: string }) {
  const m = at(mesh(new THREE.TorusGeometry(o.r ?? 0.075, 0.018, 8, 20, o.arc ?? Math.PI), mat('skin', o.color ?? '#B5655A')), o.x ?? 0, o.y ?? -0.2, 0.43);
  m.rotation.z = (o.smile ? Math.PI : 0) + (o.tilt ?? 0);
  m.scale.z = 0.6;
  rig.head.add(m);
  rig.props.mouth = m;
}

function mouthO(rig: Rig, w: number, h: number, y = -0.21) {
  const m = at(mesh(new THREE.SphereGeometry(1, 20, 14), mat('gloss', '#4A0E0C')), 0, y, 0.425);
  m.scale.set(w, h, 0.05);
  rig.head.add(m);
  // Tongue + lip rim
  const tongue = scl(at(mesh(new THREE.SphereGeometry(1, 14, 10), mat('gloss', '#D8636A')), 0, -0.45, 0.5), 0.6, 0.4, 0.5);
  m.add(tongue);
  const rim = at(mesh(new THREE.TorusGeometry(1, 0.16, 8, 24), mat('skin', '#B5655A')), 0, 0, 0.3);
  m.add(rim);
  rig.props.mouth = m;
}

function cheeks(rig: Rig, color = '#FF9BD2') {
  for (const side of [-1, 1]) {
    const c = at(mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 })), 0.28 * side, -0.1, 0.37);
    c.scale.set(1.3, 0.7, 0.3);
    rig.head.add(c);
  }
}

/** Hair cap shell. */
function hairCap(rig: Rig, color: string, cover = 0.42, r = 0.49, tiltX = -0.25, kind: MatKind = 'hair') {
  const cap = mesh(new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI * cover), mat(kind, color));
  cap.rotation.x = tiltX;
  cap.scale.set(1, 1.04, 1);
  rig.head.add(cap);
  return cap;
}

/** Hair clump (tapered, slightly curved spike). */
function clump(color: string, len: number, r: number): THREE.Mesh {
  const g = new THREE.ConeGeometry(r, len, 10, 4);
  // bend the tip a little
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = (y + len / 2) / len;
    p.setZ(i, p.getZ(i) + t * t * len * 0.25);
  }
  g.computeVertexNormals();
  return mesh(g, mat('hair', color));
}

function textSprite(text: string, color: string, size = 0.35) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#1A1410';
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

// ── Characters ───────────────────────────────────────────────────────────────

/** Si Bokek — navy suit jacket over a grey V-neck, side-parted hair, empty wallet. */
function buildBokek(): Rig {
  const SKIN = '#F1C7A1';
  const rig = baseRig({ skin: SKIN, top: { kind: 'wool', color: '#262B37', sleeves: 'long' }, bottom: { kind: 'wool', color: '#323846' }, shoes: { upper: '#1A1410', sole: '#3A2A20', laces: '#1A1410' }, belt: '#2A1A10', collar: 'none' });
  // Grey V-neck shirt + lapels
  const v = at(mesh(new THREE.ConeGeometry(0.15, 0.34, 3), mat('cloth', '#B9BEC6')), 0, 1.3, 0.255);
  v.rotation.set(Math.PI, 0, 0);
  v.scale.z = 0.4;
  rig.body.add(v);
  for (const side of [-1, 1]) {
    const lapel = at(mesh(new THREE.BoxGeometry(0.09, 0.32, 0.02), mat('wool', '#1D212B')), 0.1 * side, 1.26, 0.27);
    lapel.rotation.set(-0.15, 0, 0.32 * side);
    rig.body.add(lapel);
  }
  for (const y of [1.06, 0.94]) rig.body.add(at(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12), mat('metal', '#BFA46A')), 0.03, y, 0.27).rotateX(Math.PI / 2));
  rig.body.add(at(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.01), mat('cloth', '#FFFDF6')), -0.17, 1.2, 0.265)); // pocket square

  // Swept side-parted hair with clumps
  hairCap(rig, '#5A3A22', 0.5, 0.495, -0.28);
  const swoop = scl(at(mesh(new THREE.SphereGeometry(0.24, 24, 14), mat('hair', '#5A3A22')), -0.12, 0.31, 0.2), 1.45, 0.5, 0.95);
  swoop.rotation.z = 0.25;
  rig.head.add(swoop);
  for (let i = 0; i < 7; i++) {
    const c = clump('#5A3A22', 0.24, 0.06);
    at(c, -0.25 + i * 0.08, 0.36 - Math.abs(i - 3) * 0.02, 0.12 - i * 0.02);
    c.rotation.set(-0.9, 0, 1.2 - i * 0.12);
    rig.head.add(c);
  }
  for (const side of [-1, 1]) rig.head.add(scl(at(mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('hair', '#5A3A22')), 0.43 * side, 0.08, 0.06), 0.4, 1.6, 0.8)); // sideburns

  eyePair(rig, { size: 0.095, dy: -0.025, iris: '#6B4423' });
  lids(rig, SKIN, 0.35, 0.055);
  brows(rig, 0.2, 0.38, -0.38, '#3A2414');
  lips(rig, { smile: false, r: 0.055, y: -0.22 });
  const tear = at(mesh(new THREE.SphereGeometry(0.04, 14, 10), mat('gloss', '#9ED8FF', { transparent: true, opacity: 0.85 })), -0.22, -0.07, 0.4);
  tear.scale.set(0.8, 1.3, 0.6);
  rig.head.add(tear);
  rig.props.tear = tear;
  rig.head.rotation.x = 0.18; // looking down at the wallet

  // Arms forward holding the open (empty) wallet
  pose(rig.armL, [-0.95, 0, 0.32], [-0.55, 0, 0]);
  pose(rig.armR, [-0.95, 0, -0.32], [-0.55, 0, 0]);
  const wallet = at(new THREE.Group(), 0, 0.98, 0.6);
  for (const side of [-1, 1]) {
    const half = at(mesh(new THREE.BoxGeometry(0.26, 0.2, 0.03), mat('leather', '#7A4A22')), 0.12 * side, 0, 0);
    half.rotation.y = -0.45 * side;
    half.add(at(mesh(new THREE.BoxGeometry(0.22, 0.16, 0.008), mat('leather', '#A0683A')), 0, 0, 0.018));
    // empty card slots
    for (let i = 0; i < 2; i++) half.add(at(mesh(new THREE.BoxGeometry(0.2, 0.004, 0.01), mat('flat', '#5E3A1A')), 0, 0.04 - i * 0.04, 0.024));
    wallet.add(half);
  }
  wallet.rotation.x = -0.5;
  rig.body.add(wallet);
  rig.props.wallet = wallet;
  // Moth that flies out of the empty wallet (emote)
  const moth = at(new THREE.Group(), 0, 1.02, 0.66);
  moth.add(scl(mesh(new THREE.SphereGeometry(0.02, 8, 6), mat('cloth', '#8C8170')), 1, 1, 2));
  for (const side of [-1, 1]) {
    const wing = at(mesh(new THREE.CircleGeometry(0.07, 5), new THREE.MeshStandardMaterial({ color: '#EDE6D6', side: THREE.DoubleSide, roughness: 0.9 })), 0.05 * side, 0, 0);
    wing.rotation.z = side < 0 ? Math.PI : 0;
    moth.add(wing);
    rig.props[side < 0 ? 'wingL' : 'wingR'] = wing;
  }
  moth.visible = false;
  rig.body.add(moth);
  rig.props.moth = moth;
  // Wristwatch (metal band + glass face)
  const watch = at(new THREE.Group(), 0, -0.25, 0);
  watch.add(ring(0.098, 0.022, mat('metal', '#C9CED6')));
  watch.add(at(rot(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), mat('gloss', '#E8F4FF')), Math.PI / 2, 0, 0), 0, 0, 0.1));
  rig.armL.elbow.add(watch);
  return rig;
}

/** Si Kaget — white printed tee, jeans, white sneakers, hands on head. */
function buildKaget(): Rig {
  const SKIN = '#7A4B2C';
  const rig = baseRig({ skin: SKIN, top: { kind: 'cloth', color: '#F7F3EA', sleeves: 'short' }, bottom: { kind: 'denim', color: '#3A5A96' }, shoes: { upper: '#FBFBF8', sole: '#E9E4DA', laces: '#FFFFFF' }, belt: '#3A2A20', collar: 'crew' });
  // Tee print (decal on the chest)
  const print = at(mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshStandardMaterial({ map: TEX.teePrint(), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })), 0, 1.12, 0.268);
  rig.body.add(print);
  // Short curly crop: cap + curls
  hairCap(rig, '#151110', 0.38, 0.475, -0.3);
  let n = 0;
  for (let ring2 = 0; ring2 < 3; ring2++) {
    const count = 14 - ring2 * 3;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 0.36 - ring2 * 0.12;
      const curl = at(mesh(new THREE.SphereGeometry(0.06 - ring2 * 0.004, 10, 8), mat('hair', n++ % 3 ? '#151110' : '#2A1F1A')), Math.cos(a) * r, 0.33 + ring2 * 0.07, Math.sin(a) * r * 0.95 - 0.02);
      if (Math.sin(a) * r > 0.25 && ring2 === 0) continue; // keep the forehead clear
      rig.head.add(curl);
    }
  }
  eyePair(rig, { size: 0.13, iris: '#3B2414', irisScale: 0.6, y: 0.06 });
  brows(rig, 0.29, -0.15, 0.15, '#151110');
  mouthO(rig, 0.1, 0.12, -0.21);
  // Hands on the head
  pose(rig.armL, [0, 0, -2.4], [0, 0, -1.5]);
  pose(rig.armR, [0, 0, 2.4], [0, 0, 1.5]);
  // Sweat drop
  const drop = at(mesh(new THREE.SphereGeometry(0.05, 14, 10), mat('gloss', '#9ED8FF', { transparent: true, opacity: 0.85 })), 0.34, 0.26, 0.28);
  drop.scale.set(0.8, 1.3, 0.6);
  rig.head.add(drop);
  rig.props.drop = drop;
  return rig;
}

/** Si Ngantuk — white chiffon hijab, light-blue outfit, book + green pen. */
function buildNgantuk(): Rig {
  const SKIN = '#F3D2B6';
  const rig = baseRig({ skin: SKIN, top: { kind: 'cloth', color: '#7FB2E6', sleeves: 'long' }, bottom: { kind: 'twill', color: '#6FA0D6' }, shoes: { upper: '#2B2F3A', sole: '#FBFBF8', laces: '#FBFBF8' }, collar: 'none', ears: false });
  const scarfMat = mat('chiffon', '#F8F5EE');
  // Headscarf shell, face opening rim, inner cap peeking at the forehead
  const scarf = scl(at(mesh(new THREE.SphereGeometry(0.52, 40, 30), scarfMat), 0, 0.03, -0.13), 1, 1.07, 1);
  rig.head.add(scarf);
  const rim = scl(at(mesh(new THREE.TorusGeometry(0.39, 0.06, 14, 40), scarfMat), 0, -0.03, 0.28), 0.95, 1.12, 0.7);
  rig.head.add(rim);
  rig.head.add(scl(at(mesh(new THREE.SphereGeometry(0.42, 30, 14, 0, Math.PI * 2, 0, Math.PI * 0.2), mat('cloth', '#EFE9DF')), 0, 0.07, 0.03), 1, 1, 1).rotateX(0.5));
  const drape = at(mesh(new THREE.ConeGeometry(0.5, 0.5, 40, 2, true), scarfMat), 0, 1.42, -0.02);
  (drape.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  rig.body.add(drape);
  rig.body.add(at(mesh(new THREE.SphereGeometry(0.025, 12, 10), mat('gloss', '#FF9BD2')), 0.2, 1.45, 0.37)); // pin
  closedEyes(rig, 0.03);
  cheeks(rig);
  mouthO(rig, 0.04, 0.045, -0.2);
  rig.head.rotation.set(0.12, 0, 0.12);
  // Book in the left hand, green pen in the right
  pose(rig.armL, [-0.85, 0, 0.3], [-0.6, 0, 0]);
  pose(rig.armR, [-0.75, 0, -0.3], [-0.7, 0, 0]);
  const book = at(new THREE.Group(), -0.05, 0.92, 0.58);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.3), [mat('plastic', '#2747C9'), mat('plastic', '#2747C9'), new THREE.MeshStandardMaterial({ map: TEX.book(), roughness: 0.6 }), mat('plastic', '#1A2C8F'), mat('plastic', '#2747C9'), mat('plastic', '#2747C9')]);
  const pages = at(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.28), mat('cloth', '#FFFDF6')), 0, 0.03, 0);
  book.add(cover, pages);
  book.rotation.x = 0.35;
  rig.body.add(book);
  const pen = at(new THREE.Group(), 0, -0.4, 0.05);
  pen.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 12), mat('gloss', '#3F9A4F')));
  pen.add(at(mesh(new THREE.ConeGeometry(0.022, 0.05, 12), mat('metal', '#D8DCE2')), 0, -0.175, 0).rotateX(Math.PI));
  pen.add(at(mesh(new THREE.BoxGeometry(0.008, 0.1, 0.02), mat('metal', '#D8DCE2')), 0.025, 0.08, 0)); // clip
  pen.rotation.x = 0.9;
  rig.armR.elbow.add(pen);
  const z = textSprite('Z', '#9ED8FF', 0.32);
  at(z, 0.45, 0.55, 0.1);
  rig.head.add(z);
  rig.props.z = z;
  return rig;
}

/** Si Licik — khaki uniform with pocket & epaulettes, buzz cut + tuft, smirk, pencil. */
function buildLicik(): Rig {
  const SKIN = '#D9A47A';
  const rig = baseRig({ skin: SKIN, top: { kind: 'twill', color: '#B99D6B', sleeves: 'long' }, bottom: { kind: 'twill', color: '#6B5A3A' }, shoes: { upper: '#1A1410', sole: '#2A1A10', laces: '#1A1410' }, belt: '#1A1410', collar: 'shirt' });
  const darker = mat('twill', '#A88B5B');
  // Pocket with flap + button, epaulettes, placket buttons, name tag
  rig.body.add(at(mesh(new THREE.BoxGeometry(0.15, 0.14, 0.02), darker), 0.14, 1.16, 0.262));
  rig.body.add(at(mesh(new THREE.BoxGeometry(0.16, 0.04, 0.025), darker), 0.14, 1.23, 0.266));
  rig.body.add(at(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 10), mat('metal', '#BFA46A')).rotateX(Math.PI / 2), 0.14, 1.22, 0.282));
  rig.body.add(at(mesh(new THREE.BoxGeometry(0.15, 0.04, 0.01), mat('plastic', '#1A1410')), -0.14, 1.2, 0.262)); // name tag
  for (const y of [1.3, 1.16, 1.02, 0.9]) rig.body.add(at(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10), mat('metal', '#BFA46A')).rotateX(Math.PI / 2), 0, y, 0.266));
  for (const side of [-1, 1]) {
    const strap = at(mesh(new THREE.BoxGeometry(0.2, 0.035, 0.11), darker), 0.33 * side, 1.43, 0);
    strap.rotation.z = -0.4 * side;
    rig.body.add(strap);
  }
  // Buzz cut (stubble texture) + tuft
  hairCap(rig, '#4A4540', 0.44, 0.475, -0.12, 'stubble');
  for (let i = 0; i < 5; i++) {
    const t = clump('#1A1410', 0.22 - i * 0.02, 0.055);
    at(t, 0, 0.47 - i * 0.015, 0.2 - i * 0.1);
    t.rotation.x = -0.55 + i * 0.22;
    rig.head.add(t);
  }
  // Side-eye with half lids
  eyePair(rig, { size: 0.095, dx: 0.04, dy: -0.01, iris: '#4A2E14' });
  lids(rig, SKIN, 0.55, 0.05);
  brows(rig, 0.21, 0.28, 0.05, '#1A1410');
  lips(rig, { smile: true, r: 0.065, x: 0.05, y: -0.19, tilt: 0.45, arc: Math.PI * 0.8 });
  rig.head.rotation.set(0.05, -0.18, -0.06);
  // Pencil to the chin, other hand on hip
  pose(rig.armR, [-0.6, 0, -0.2], [-1.9, 0, 0.2]);
  pose(rig.armL, [0, 0, -0.55], [0, 0, 1.4]);
  const pencil = at(new THREE.Group(), 0, -0.4, 0.06);
  pencil.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.32, 6), mat('plastic', '#FFD43B')));
  pencil.add(at(mesh(new THREE.ConeGeometry(0.026, 0.07, 6), mat('skin', '#F1C7A1')), 0, 0.195, 0));
  pencil.add(at(mesh(new THREE.ConeGeometry(0.008, 0.02, 6), mat('flat', '#1A1410')), 0, 0.235, 0));
  pencil.add(at(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.035, 10), mat('metal', '#C9CED6')), 0, -0.175, 0));
  pencil.add(at(mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.04, 10), mat('rubber', '#FF9BD2')), 0, -0.21, 0));
  pencil.rotation.x = 1.2;
  rig.armR.elbow.add(pencil);
  return rig;
}

export function buildMascot(id: MascotId): Rig {
  switch (id) {
    case 'bokek':
      return buildBokek();
    case 'kaget':
      return buildKaget();
    case 'ngantuk':
      return buildNgantuk();
    case 'licik':
      return buildLicik();
  }
}

// ── Animation ────────────────────────────────────────────────────────────────

const EMOTE_S = 1.4;

function animate(rig: Rig, id: MascotId, t: number, emoteT: number | null) {
  const bob = Math.sin(t * 2.2);
  rig.body.position.y = bob * 0.02;
  // Breathing + idle weight shift
  if (rig.chest) rig.chest.scale.set(1 + bob * 0.012, 1 + bob * 0.008, 1 + bob * 0.015);
  rig.body.rotation.z = Math.sin(t * 0.7) * 0.012;
  const shadow = rig.props.shadow;
  if (shadow) shadow.scale.setScalar(1 - (rig.root.position.y + rig.body.position.y) * 0.5);
  // Blink every ~3.6 s
  if (!rig.closedEyes) {
    const blink = t % 3.6 < 0.12 ? 0.1 : 1;
    rig.eyes.scale.y = blink;
    rig.eyes.position.y = blink < 1 ? 0.035 : 0;
  }
  const e = emoteT === null ? -1 : Math.min(1, emoteT / EMOTE_S);
  const k = e >= 0 ? Math.sin(e * Math.PI) : 0;

  switch (id) {
    case 'bokek': {
      const w = rig.props.wallet;
      w.rotation.z = e >= 0 ? Math.sin(e * 40) * 0.18 * (1 - e) : Math.sin(t * 1.3) * 0.03;
      const moth = rig.props.moth;
      moth.visible = e >= 0 && e < 1;
      if (moth.visible) {
        moth.position.set(Math.sin(e * 9) * 0.25, 1.02 + e * 1.3, 0.66 + e * 0.2);
        const flap = Math.sin(t * 40) * 0.9;
        rig.props.wingL.rotation.y = flap;
        rig.props.wingR.rotation.y = -flap;
      }
      rig.props.tear.position.y = -0.07 - ((t * 0.25) % 0.2);
      rig.head.rotation.x = 0.18 + k * 0.15;
      break;
    }
    case 'kaget': {
      rig.root.position.y = k * 0.55;
      const s = 1 + k * 0.45;
      rig.eyes.children.forEach((g) => g.scale.setScalar(s));
      const mouth = rig.props.mouth;
      mouth.scale.y = 0.12 * (1 + k * 0.6);
      rig.props.drop.position.y = 0.26 - ((t * 0.3) % 0.25);
      rig.head.rotation.z = Math.sin(t * 13) * 0.02 * (1 + k * 4);
      break;
    }
    case 'ngantuk': {
      const nod = e >= 0 ? Math.sin(e * Math.PI * 3) * 0.3 : (Math.sin(t * 0.9) + 1) * 0.08;
      rig.head.rotation.x = 0.12 + nod;
      const z = rig.props.z as THREE.Sprite;
      const zt = (t * 0.5) % 1;
      z.position.set(0.45 + zt * 0.25, 0.55 + zt * 0.5, 0.1);
      z.material.opacity = Math.sin(zt * Math.PI);
      z.scale.setScalar(0.22 + zt * 0.2 + k * 0.2);
      break;
    }
    case 'licik': {
      rig.body.rotation.z = k * 0.18;
      rig.props.browL.position.y = 0.21 + Math.max(0, Math.sin(t * 6)) * 0.02 * (1 + k * 3);
      rig.head.rotation.y = -0.18 + k * 0.3 + Math.sin(t * 0.8) * 0.04;
      break;
    }
  }
}

// ── Stage ────────────────────────────────────────────────────────────────────

export interface StageOptions {
  spin?: boolean;
  pedestal?: boolean;
  /** 'full' body, or 'bust' (head + shoulders) for small guide avatars. */
  framing?: 'full' | 'bust';
  /** Let the user drag to rotate. */
  draggable?: boolean;
}

export interface Stage {
  setCharacter(id: MascotId): void;
  emote(): void;
  setSpin(spin: boolean): void;
  dispose(): void;
}

/** Disposes geometries only — materials/textures are shared caches. */
function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if ((c as THREE.Sprite).isSprite) {
      const sm = (c as THREE.Sprite).material;
      sm.map?.dispose();
      sm.dispose();
    }
  });
}

function makePedestal() {
  const g = new THREE.Group();
  // Glossy two-tier disc with a glowing ring (dashboard "My Style" plinth)
  g.add(at(mesh(new THREE.CylinderGeometry(1.0, 1.08, 0.16, 64), mat('gloss', '#E6DECB', { roughness: 0.18, metalness: 0.1 })), 0, -0.14, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.94, 0.98, 0.08, 64), mat('gloss', '#FFFCF4', { roughness: 0.08 })), 0, -0.03, 0));
  const glowRing = at(ring(0.985, 0.022, new THREE.MeshStandardMaterial({ color: '#FFD43B', emissive: '#FFB800', emissiveIntensity: 1.2 }), 72), 0, 0.012, 0);
  g.add(glowRing);
  const glow = at(mesh(new THREE.CircleGeometry(0.9, 64), new THREE.MeshBasicMaterial({ color: '#9ED8FF', transparent: true, opacity: 0.35 })), 0, 0.011, 0);
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);
  return g;
}

function frameCamera(cam: THREE.PerspectiveCamera, framing: 'full' | 'bust', pedestal: boolean) {
  if (framing === 'bust') {
    cam.position.set(0, 1.9, 3.9);
    cam.lookAt(0, 1.66, 0);
  } else {
    cam.position.set(0, 1.55, pedestal ? 7.2 : 6.6);
    cam.lookAt(0, pedestal ? 1.05 : 1.15, 0);
  }
}

/** Lights + tone mapping + soft room reflections (shared by stage + portraits). */
function setupRenderer(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();
  } catch {
    /* no PMREM on very old GPUs — lights alone still look fine */
  }
  scene.add(new THREE.HemisphereLight(0xe4eeff, 0x8c7b66, 0.9));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(3, 5, 4);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7);
  fill.position.set(-4, 2, 3);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(-1.5, 4, -5);
  const rim2 = new THREE.DirectionalLight(0xffd6ee, 1.1);
  rim2.position.set(3, 2, -4);
  scene.add(key, fill, rim, rim2);
}

export function createStage(canvas: HTMLCanvasElement, initial: MascotId, opts: StageOptions = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  setupRenderer(renderer, scene);

  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const framing = opts.framing ?? 'full';
  frameCamera(cam, framing, !!opts.pedestal);

  const turntable = new THREE.Group();
  scene.add(turntable);
  if (opts.pedestal) scene.add(makePedestal());

  let id = initial;
  let rig = buildMascot(id);
  turntable.add(rig.root);
  let spin = !!opts.spin;
  let emoteStart: number | null = null;
  let dragVel = 0;
  // Face the viewer slightly turned (3/4 view reads better than flat front).
  turntable.rotation.y = framing === 'bust' ? -0.25 : -0.35;

  const clock = new THREE.Clock();
  let raf = 0;
  let visible = true;
  let disposed = false;

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !raf) loop();
  });
  io.observe(canvas);
  const onVis = () => {
    if (!document.hidden && !raf) loop();
  };
  document.addEventListener('visibilitychange', onVis);

  // Drag to rotate
  let dragging = false;
  let lastX = 0;
  const down = (e: PointerEvent) => {
    if (!opts.draggable) return;
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    turntable.rotation.y += dx * 0.012;
    dragVel = dx * 0.012;
  };
  const up = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function loop() {
    raf = 0;
    if (disposed || !visible || document.hidden) return;
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    if (!dragging) {
      if (spin) turntable.rotation.y += dt * 0.7;
      else if (Math.abs(dragVel) > 0.0005) {
        turntable.rotation.y += dragVel;
        dragVel *= 0.92;
      }
    }
    const et = emoteStart === null ? null : t - emoteStart;
    if (et !== null && et > EMOTE_S) emoteStart = null;
    animate(rig, id, t, emoteStart === null ? null : et);
    renderer.render(scene, cam);
    raf = requestAnimationFrame(loop);
  }
  loop();

  return {
    setCharacter(next) {
      if (next === id) return;
      turntable.remove(rig.root);
      disposeTree(rig.root);
      id = next;
      rig = buildMascot(id);
      turntable.add(rig.root);
      emoteStart = clock.elapsedTime;
    },
    emote() {
      emoteStart = clock.elapsedTime;
    },
    setSpin(s) {
      spin = s;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      disposeTree(scene);
      scene.environment?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** One-off head-and-shoulders portraits (character grid), as data URLs. */
export function renderPortraits(ids: readonly MascotId[], size = 256): Record<string, string> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  setupRenderer(renderer, scene);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(0, 1.85, 4.1);
  cam.lookAt(0, 1.6, 0);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const rig = buildMascot(id);
    rig.root.rotation.y = -0.3;
    rig.props.shadow.visible = false;
    animate(rig, id, 1, null);
    scene.add(rig.root);
    renderer.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(rig.root);
    disposeTree(rig.root);
  }
  scene.environment?.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
