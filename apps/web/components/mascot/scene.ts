/**
 * Real-time 3D buddies (three.js). Chunky low-poly, cel-shaded with an ink
 * outline — a PS2-era character-select look that matches the sticker style.
 * Every model is built from primitives here (no model files to download).
 *
 * Loaded lazily (dynamic import) so three.js never weighs on pages that don't
 * show a buddy.
 */
import * as THREE from 'three';
import type { MascotId } from '@/lib/mascots';

const INK = 0x1a1410;

// ── Materials ────────────────────────────────────────────────────────────────

let gradient: THREE.DataTexture | null = null;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

function toon(color: number | string) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
}
function flat(color: number | string) {
  return new THREE.MeshBasicMaterial({ color });
}
const outlineMat = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

/** Mesh + back-face "inverted hull" outline. */
function part(geo: THREE.BufferGeometry, color: number | string, outline = 1.06, basic = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, basic ? flat(color) : toon(color));
  if (outline > 1) {
    const o = new THREE.Mesh(geo, outlineMat());
    o.scale.setScalar(outline);
    o.renderOrder = -1;
    m.add(o);
  }
  return m;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

// ── Rig ──────────────────────────────────────────────────────────────────────

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  hand: THREE.Mesh;
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
}

function arm(side: -1 | 1, sleeve: string, skin: string): Arm {
  const shoulder = at(new THREE.Group(), 0.45 * side, 1.3, 0);
  const upper = at(part(new THREE.CapsuleGeometry(0.11, 0.2, 4, 10), sleeve), 0, -0.16, 0);
  shoulder.add(upper);
  const elbow = at(new THREE.Group(), 0, -0.32, 0);
  shoulder.add(elbow);
  const fore = at(part(new THREE.CapsuleGeometry(0.1, 0.18, 4, 10), sleeve), 0, -0.15, 0);
  elbow.add(fore);
  const hand = at(part(new THREE.SphereGeometry(0.12, 12, 10), skin), 0, -0.33, 0);
  elbow.add(hand);
  return { shoulder, elbow, hand };
}

function pose(a: Arm, s: [number, number, number], e: [number, number, number] = [0, 0, 0]) {
  a.shoulder.rotation.set(...s);
  a.elbow.rotation.set(...e);
}

function baseRig(o: { skin: string; shirt: string; sleeve?: string; pants: string; shoes: string; ears?: boolean }): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  for (const side of [-1, 1] as const) {
    body.add(at(part(new THREE.CapsuleGeometry(0.13, 0.3, 4, 10), o.pants), 0.17 * side, 0.38, 0));
    const shoe = at(part(new THREE.SphereGeometry(0.16, 12, 10), o.shoes), 0.17 * side, 0.09, 0.06);
    shoe.scale.set(1, 0.6, 1.4);
    body.add(shoe);
  }
  const torso = at(part(new THREE.CapsuleGeometry(0.38, 0.42, 6, 16), o.shirt), 0, 1.0, 0);
  torso.scale.set(1, 1, 0.82);
  body.add(torso);

  const head = at(new THREE.Group(), 0, 1.78, 0);
  body.add(head);
  head.add(part(new THREE.SphereGeometry(0.5, 24, 18), o.skin, 1.04));
  if (o.ears !== false) for (const side of [-1, 1]) head.add(at(part(new THREE.SphereGeometry(0.1, 10, 8), o.skin), 0.49 * side, -0.02, 0));
  const eyes = new THREE.Group();
  head.add(eyes);

  const armL = arm(-1, o.sleeve ?? o.shirt, o.skin);
  const armR = arm(1, o.sleeve ?? o.shirt, o.skin);
  body.add(armL.shoulder, armR.shoulder);
  pose(armL, [0, 0, -0.18]);
  pose(armR, [0, 0, 0.18]);
  return { root, body, head, eyes, armL, armR, props: {} };
}

// ── Face pieces ──────────────────────────────────────────────────────────────

function eyePair(rig: Rig, o: { size?: number; pupil?: number; dx?: number; dy?: number; y?: number } = {}) {
  const size = o.size ?? 0.11;
  for (const side of [-1, 1]) {
    const g = at(new THREE.Group(), 0.17 * side, o.y ?? 0.05, 0.43);
    const white = part(new THREE.SphereGeometry(size, 14, 12), '#FFFDF6', 1.12);
    white.scale.set(1, 1.15, 0.55);
    g.add(white);
    const pupil = at(new THREE.Mesh(new THREE.SphereGeometry(o.pupil ?? size * 0.5, 12, 10), flat(INK)), o.dx ?? 0, o.dy ?? -0.005, size * 0.42);
    pupil.scale.set(1, 1.1, 0.5);
    g.add(pupil);
    const glint = at(new THREE.Mesh(new THREE.SphereGeometry((o.pupil ?? size * 0.5) * 0.32, 8, 6), flat('#FFFFFF')), (o.dx ?? 0) + size * 0.16, (o.dy ?? 0) + size * 0.2, size * 0.6);
    g.add(glint);
    rig.eyes.add(g);
  }
}

function closedEyes(rig: Rig, y = 0.04) {
  for (const side of [-1, 1]) {
    const arc = at(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 14, Math.PI), flat(INK)), 0.17 * side, y, 0.465);
    arc.rotation.z = Math.PI; // ‿ shape
    rig.eyes.add(arc);
  }
  rig.closedEyes = true;
}

function brows(rig: Rig, y: number, tiltL: number, tiltR: number, color: number | string = INK) {
  for (const [side, tilt] of [[-1, tiltL], [1, tiltR]] as const) {
    const b = at(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.03), flat(color)), 0.17 * side, y, 0.43);
    b.rotation.z = tilt;
    rig.head.add(b);
    rig.props[side < 0 ? 'browL' : 'browR'] = b;
  }
}

function mouthArc(rig: Rig, o: { r?: number; smile: boolean; x?: number; y?: number; tilt?: number; arc?: number }) {
  const m = at(new THREE.Mesh(new THREE.TorusGeometry(o.r ?? 0.08, 0.02, 6, 16, o.arc ?? Math.PI), flat(INK)), o.x ?? 0, o.y ?? -0.18, 0.465);
  m.rotation.z = (o.smile ? Math.PI : 0) + (o.tilt ?? 0);
  rig.head.add(m);
  rig.props.mouth = m;
}

function mouthO(rig: Rig, w: number, h: number, y = -0.2) {
  const m = at(part(new THREE.SphereGeometry(1, 14, 10), '#5B1210', 1.1, true), 0, y, 0.455);
  m.scale.set(w, h, 0.04);
  rig.head.add(m);
  rig.props.mouth = m;
}

function cheeks(rig: Rig, color = '#FF9BD2') {
  for (const side of [-1, 1]) {
    const c = at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), flat(color)), 0.29 * side, -0.09, 0.4);
    c.scale.set(1.2, 0.7, 0.3);
    (c.material as THREE.MeshBasicMaterial).transparent = true;
    (c.material as THREE.MeshBasicMaterial).opacity = 0.7;
    rig.head.add(c);
  }
}

/** Top-of-head hair cap. */
function hairCap(rig: Rig, color: string, cover = 0.42, r = 0.525, tiltX = -0.25) {
  const cap = part(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI * cover), color, 1.03);
  cap.rotation.x = tiltX;
  rig.head.add(cap);
  return cap;
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

function buildBokek(): Rig {
  const rig = baseRig({ skin: '#F1C7A1', shirt: '#2B2F3A', pants: '#3A3F4B', shoes: '#1A1410' });
  // Shirt V under the jacket
  const v = at(part(new THREE.ConeGeometry(0.16, 0.34, 3), '#B9BEC6', 1), 0, 1.32, 0.29);
  v.rotation.set(Math.PI, 0, 0);
  rig.body.add(v);
  // Swept side-parted hair
  hairCap(rig, '#5A3A22', 0.4, 0.53, -0.35);
  const swoop = at(part(new THREE.SphereGeometry(0.24, 14, 10), '#5A3A22', 1.04), -0.14, 0.33, 0.22);
  swoop.scale.set(1.4, 0.5, 0.9);
  swoop.rotation.z = 0.25;
  rig.head.add(swoop);
  eyePair(rig, { size: 0.1, dy: -0.03 });
  // Droopy lids
  for (const side of [-1, 1]) {
    const lid = at(part(new THREE.SphereGeometry(0.105, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#E8B993', 1), 0.17 * side, 0.06, 0.435);
    lid.scale.set(1.05, 0.9, 0.62);
    lid.rotation.x = 0.35;
    rig.eyes.add(lid);
  }
  brows(rig, 0.21, 0.38, -0.38, '#3A2414');
  mouthArc(rig, { smile: false, r: 0.06, y: -0.2 });
  const tear = at(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), flat('#9ED8FF')), -0.24, -0.06, 0.44);
  tear.scale.set(0.8, 1.3, 0.6);
  rig.head.add(tear);
  rig.props.tear = tear;
  rig.head.rotation.x = 0.18; // looking down at the wallet

  // Arms forward holding the open (empty) wallet
  pose(rig.armL, [-0.9, 0, 0.35], [-0.5, 0, 0]);
  pose(rig.armR, [-0.9, 0, -0.35], [-0.5, 0, 0]);
  const wallet = at(new THREE.Group(), 0, 0.98, 0.62);
  for (const side of [-1, 1]) {
    const half = at(part(new THREE.BoxGeometry(0.26, 0.2, 0.035), '#7A4A22', 1.08), 0.12 * side, 0, 0);
    half.rotation.y = -0.45 * side;
    const inner = at(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.01), flat('#A0683A')), 0, 0, 0.022);
    half.add(inner);
    wallet.add(half);
  }
  wallet.rotation.x = -0.5;
  rig.body.add(wallet);
  rig.props.wallet = wallet;
  // Moth that flies out of the empty wallet (emote)
  const moth = at(new THREE.Group(), 0, 1.02, 0.66);
  for (const side of [-1, 1]) {
    const wing = at(new THREE.Mesh(new THREE.CircleGeometry(0.07, 3), new THREE.MeshBasicMaterial({ color: '#EDE6D6', side: THREE.DoubleSide })), 0.05 * side, 0, 0);
    wing.rotation.z = side < 0 ? Math.PI : 0;
    moth.add(wing);
    rig.props[side < 0 ? 'wingL' : 'wingR'] = wing;
  }
  moth.visible = false;
  rig.body.add(moth);
  rig.props.moth = moth;
  // Wristwatch
  const watch = at(part(new THREE.TorusGeometry(0.1, 0.03, 6, 14), '#C9CED6', 1.1), 0, -0.24, 0);
  watch.rotation.x = Math.PI / 2;
  rig.armL.elbow.add(watch);
  return rig;
}

function buildKaget(): Rig {
  const rig = baseRig({ skin: '#7A4B2C', shirt: '#F7F3EA', pants: '#2C3E66', shoes: '#F7F3EA' });
  hairCap(rig, '#1A1410', 0.36, 0.515, -0.3);
  eyePair(rig, { size: 0.14, pupil: 0.035, y: 0.06 });
  brows(rig, 0.3, -0.15, 0.15);
  mouthO(rig, 0.11, 0.13, -0.2);
  // Hands on the head
  pose(rig.armL, [0, 0, -2.35], [0, 0, -1.55]);
  pose(rig.armR, [0, 0, 2.35], [0, 0, 1.55]);
  // Sweat drop
  const drop = at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), flat('#9ED8FF')), 0.36, 0.28, 0.3);
  drop.scale.set(0.8, 1.3, 0.6);
  rig.head.add(drop);
  rig.props.drop = drop;
  return rig;
}

function buildNgantuk(): Rig {
  const rig = baseRig({ skin: '#F3D2B6', shirt: '#7FB2E6', pants: '#7FB2E6', shoes: '#2B2F3A', ears: false });
  // Headscarf: a larger shell behind the head leaves an oval face opening.
  const scarf = at(part(new THREE.SphereGeometry(0.6, 28, 20), '#F8F5EE', 1.03), 0, 0.03, -0.2);
  scarf.scale.set(1, 1.06, 1);
  rig.head.add(scarf);
  const drape = at(part(new THREE.ConeGeometry(0.5, 0.5, 24, 1), '#F8F5EE', 1.04), 0, 1.4, -0.06);
  rig.body.add(drape);
  closedEyes(rig, 0.03);
  cheeks(rig);
  mouthO(rig, 0.045, 0.05, -0.19);
  rig.head.rotation.set(0.12, 0, 0.12);
  // Book in the left hand, green pen in the right
  pose(rig.armL, [-0.85, 0, 0.3], [-0.6, 0, 0]);
  pose(rig.armR, [-0.75, 0, -0.3], [-0.7, 0, 0]);
  const book = at(new THREE.Group(), -0.05, 0.92, 0.6);
  const cover = part(new THREE.BoxGeometry(0.42, 0.04, 0.3), '#2747C9', 1.06);
  const pages = at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.28), flat('#FFFDF6')), 0, 0.03, 0);
  book.add(cover, pages);
  book.rotation.x = 0.35;
  rig.body.add(book);
  const pen = at(part(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8), '#3F9A4F', 1.12), 0, -0.4, 0.05);
  pen.rotation.x = 0.9;
  rig.armR.elbow.add(pen);
  const z = textSprite('Z', '#9ED8FF', 0.32);
  at(z, 0.45, 0.55, 0.1);
  rig.head.add(z);
  rig.props.z = z;
  return rig;
}

function buildLicik(): Rig {
  const rig = baseRig({ skin: '#D9A47A', shirt: '#B99D6B', pants: '#6B5A3A', shoes: '#1A1410' });
  // Uniform pocket + shoulder straps
  rig.body.add(at(part(new THREE.BoxGeometry(0.16, 0.14, 0.03), '#A88B5B', 1.08), 0.16, 1.18, 0.31));
  for (const side of [-1, 1]) {
    const strap = at(part(new THREE.BoxGeometry(0.2, 0.04, 0.1), '#A88B5B', 1.08), 0.36 * side, 1.42, 0);
    strap.rotation.z = -0.4 * side;
    rig.body.add(strap);
  }
  // Buzz cut + tuft
  hairCap(rig, '#4A4540', 0.4, 0.512, -0.15);
  for (let i = 0; i < 4; i++) {
    const tuft = at(part(new THREE.ConeGeometry(0.08, 0.2, 6), '#1A1410', 1.06), 0, 0.5 - i * 0.02, 0.18 - i * 0.12);
    tuft.rotation.x = -0.5 + i * 0.25;
    rig.head.add(tuft);
  }
  // Side-eye with half lids
  eyePair(rig, { size: 0.1, dx: 0.045, dy: -0.01 });
  for (const side of [-1, 1]) {
    const lid = at(part(new THREE.SphereGeometry(0.105, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#C89068', 1), 0.17 * side, 0.055, 0.435);
    lid.scale.set(1.05, 0.95, 0.62);
    lid.rotation.x = 0.55;
    rig.eyes.add(lid);
  }
  brows(rig, 0.22, 0.28, 0.05);
  mouthArc(rig, { smile: true, r: 0.07, x: 0.06, y: -0.17, tilt: 0.45, arc: Math.PI * 0.8 });
  rig.head.rotation.set(0.05, -0.18, -0.06);
  // Pencil to the chin, other hand on hip
  pose(rig.armR, [-0.6, 0, -0.2], [-1.9, 0, 0.2]);
  pose(rig.armL, [0, 0, -0.55], [0, 0, 1.4]);
  const pencil = at(new THREE.Group(), 0, -0.38, 0.06);
  pencil.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), '#FFD43B', 1.12));
  pencil.add(at(part(new THREE.ConeGeometry(0.03, 0.08, 6), '#F1C7A1', 1.12), 0, 0.21, 0));
  pencil.add(at(part(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 6), '#FF9BD2', 1.12), 0, -0.19, 0));
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
  rig.body.position.y = bob * 0.025;
  rig.body.scale.set(1 + bob * 0.006, 1 - bob * 0.006, 1);
  // Blink every ~3.5s
  if (!rig.closedEyes) {
    const blink = t % 3.6 < 0.12 ? 0.12 : 1;
    rig.eyes.scale.y = blink;
    rig.eyes.position.y = blink < 1 ? 0.04 : 0;
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
      rig.props.tear.position.y = -0.06 - ((t * 0.25) % 0.2);
      rig.head.rotation.x = 0.18 + k * 0.15;
      break;
    }
    case 'kaget': {
      rig.root.position.y = k * 0.55;
      const s = 1 + k * 0.45;
      rig.eyes.children.forEach((g) => g.scale.setScalar(s));
      const mouth = rig.props.mouth;
      mouth.scale.y = 0.13 * (1 + k * 0.6);
      rig.props.drop.position.y = 0.28 - ((t * 0.3) % 0.25);
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
      rig.props.browL.position.y = 0.22 + Math.max(0, Math.sin(t * 6)) * 0.02 * (1 + k * 3);
      rig.head.rotation.y = -0.18 + k * 0.3;
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

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) {
      const map = (mat as THREE.SpriteMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
  });
}

function makePedestal() {
  const g = new THREE.Group();
  const top = at(part(new THREE.CylinderGeometry(0.95, 1.05, 0.22, 40), '#E6DECB', 1.02), 0, -0.11, 0);
  const ring = at(new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.035, 8, 48), flat('#FFD43B')), 0, 0.005, 0);
  ring.rotation.x = Math.PI / 2;
  const glow = at(new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ color: '#9ED8FF', transparent: true, opacity: 0.55 })), 0, 0.006, 0);
  glow.rotation.x = -Math.PI / 2;
  g.add(top, ring, glow);
  return g;
}

function frameCamera(cam: THREE.PerspectiveCamera, framing: 'full' | 'bust', pedestal: boolean) {
  if (framing === 'bust') {
    cam.position.set(0, 1.85, 3.9);
    cam.lookAt(0, 1.62, 0);
  } else {
    cam.position.set(0, 1.5, pedestal ? 7.2 : 6.6);
    cam.lookAt(0, pedestal ? 1.05 : 1.15, 0);
  }
}

export function createStage(canvas: HTMLCanvasElement, initial: MascotId, opts: StageOptions = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8170, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(3, 5, 4);
  scene.add(sun);

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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8170, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  cam.position.set(0, 1.8, 4.1);
  cam.lookAt(0, 1.55, 0);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const rig = buildMascot(id);
    rig.root.rotation.y = -0.3;
    animate(rig, id, 1, null);
    scene.add(rig.root);
    renderer.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(rig.root);
    disposeTree(rig.root);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
