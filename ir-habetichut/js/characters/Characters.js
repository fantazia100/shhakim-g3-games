import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Rigged cartoon characters (assets/characters.glb, built by blender/characters.py).
 *  - two skeletons: RIG_Kid (K_* bones) and RIG_Adult (A_* bones)
 *  - body variants (Kid_Boy, Kid_BoyKippah, Kid_Girl, Kid_GirlBraids, Adult_Man, Adult_ManKippah, Adult_Woman, Adult_WomanScarf)
 *    and extras (Kid_Backpack, *_Helmet, Adult_Vest, Adult_Paddle) are merged into ONE skinned mesh per character (1 draw call)
 *  - colours come from a 16x1 palette texture -> each character gets its own tiny palette (recolouring without new meshes)
 *  - clips: Idle Walk Run Look Wave Sit Swing Slide Pedal Talk WalkHand Paddle, played through an AnimationMixer with cross-fades
 */
export const CELL = { skin: 0, hair: 1, shirt: 2, pants: 3, shoes: 4, bag: 5, white: 6, black: 7, mouth: 8, cheek: 9, kippah: 10,
  vest: 11, red: 12, tights: 13, strap: 14, helmet: 15 };
const FIXED = { white: '#ffffff', black: '#1b1820', mouth: '#b8404c', cheek: '#ff9aa8', vest: '#ff7a14', red: '#d42020', strap: '#f6c430' };

const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
export const PALETTES = {
  skin: ['#f6d2b4', '#efc29c', '#e2ad84', '#c98e62', '#a8714a', '#7d5236'],
  hair: ['#3b2618', '#22170f', '#5c3a1e', '#8a5a2b', '#c99a5b', '#e0bf6e', '#9c4a22'],
  kidTop: ['#ffffff', '#4f8ff7', '#42b883', '#ffb238', '#ff6f61', '#8e7cf0', '#3ec7e0', '#ff8fb1', '#f4e04d'],
  boyPants: ['#24345e', '#3a3f4a', '#1f4f7a', '#5a4632', '#2b2f38'],
  girlSkirt: ['#24345e', '#5b6b8c', '#7a4a8c', '#3d6e9e', '#8c3b4a', '#4a5560', '#2f6f6a'],
  tights: ['#2b3354', '#6f6f7a', '#f2f2f2', '#40315a', '#8a8f99'],
  adultTop: ['#ffffff', '#cfe3ff', '#e9e4d8', '#9cc3e6', '#c7d9b8', '#f0c9c9', '#d9cdea', '#37506e'],
  manPants: ['#23272f', '#2e3a4f', '#4a4036', '#33363d'],
  womanSkirt: ['#24345e', '#4a3b5c', '#2f4f4f', '#6b4a3a', '#3f4b63', '#5c2f3f'],
  shoes: ['#2d2d36', '#5a3b28', '#e9e9ee', '#d23b3b', '#2c5ccf', '#1f8a5c'],
  bag: ['#e5484d', '#3e7bfa', '#35b26f', '#ffb020', '#9b5de5', '#f15bb5', '#00bbf9'],
  kippah: ['#1d2c6b', '#111111', '#f4f4f4', '#2b6cb0', '#7b3fa0', '#2e7d4f'],
  scarf: ['#7a4a8c', '#2f6f6a', '#c25b52', '#3d6e9e', '#d9a441', '#55627a', '#9c5c7c'],
  helmet: ['#ffd23f', '#3ec7e0', '#ff6f61', '#42b883', '#ffffff'],
};

export class CharacterLib {
  static async load(url, metaUrl, onProgress) {
    const [gltf, meta] = await Promise.all([
      new GLTFLoader().loadAsync(url, (e) => onProgress && e.total && onProgress(e.loaded / e.total)),
      fetch(metaUrl).then((r) => r.json()),
    ]);
    return new CharacterLib(gltf, meta);
  }
  constructor(gltf, meta) {
    this.meta = meta; this.rigs = {}; this.clips = {}; this.templates = new Map(); this._masked = new Map();
    for (const name of ['Kid', 'Adult']) {
      const root = gltf.scene.getObjectByName('RIG_' + name);
      root.position.set(0, 0, 0); root.updateMatrixWorld(true);
      const meshes = {};
      root.traverse((o) => { if (o.isSkinnedMesh) meshes[o.name] = o; });
      this.rigs[name] = { root, meshes, m: meta.rigs[name] };
      this.clips[name] = {};
      for (const c of gltf.animations) if (c.name.startsWith(name + '_')) this.clips[name][c.name.slice(name.length + 1)] = c;
    }
    const m = this.rigs.Kid.meshes.Kid_Boy.material;
    this.baseMap = m.map;
  }
  /** walking speed (m/s) at timeScale 1 for a rig - used to sync legs with movement (no foot sliding) */
  walkSpeed(rig) { const m = this.rigs[rig].m; return m.walkCycleDistance / m.walkCycleSeconds; }
  runSpeed(rig) { const m = this.rigs[rig].m; return m.runCycleDistance / m.runCycleSeconds; }
  clip(rig, name, mask) {
    const c = this.clips[rig][name];
    if (!mask) return c;
    const key = rig + name + mask;
    if (!this._masked.has(key)) {   // 'noR' = everything except the right arm; 'onlyR' = right arm only (same for L)
      const side = mask.slice(-1), re = new RegExp(`(UpperArm${side}|ForeArm${side}|Hand${side})\\.`);
      const tracks = c.tracks.filter((t) => (mask.startsWith('only') ? re.test(t.name) : !re.test(t.name)));
      this._masked.set(key, new THREE.AnimationClip(c.name + '#' + mask, c.duration, tracks));
    }
    return this._masked.get(key);
  }
  _template(rig, variant, extras) {
    const key = [variant, ...extras].join('+');
    if (this.templates.has(key)) return this.templates.get(key);
    const R = this.rigs[rig];
    const t = SkeletonUtils.clone(R.root);
    const meshes = []; t.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const keep = meshes.find((o) => o.name === variant);
    const geos = [variant, ...extras].map((n) => {
      const g = R.meshes[n].geometry.clone();
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(a)) g.deleteAttribute(a);
      return g;
    });
    keep.geometry = mergeGeometries(geos, false);
    keep.geometry.computeBoundingSphere();
    keep.geometry.boundingSphere.radius += 0.6;     // arms raised / paddle
    for (const o of meshes) if (o !== keep) o.parent.remove(o);
    keep.name = 'Body';
    this.templates.set(key, t);
    return t;
  }
  /** opts: { rig, variant, extras:[], colors:{cell:'#hex'}, rand } */
  create(opts) {
    const t = this._template(opts.rig, opts.variant, opts.extras || []);
    const obj = SkeletonUtils.clone(t);
    obj.name = opts.name || opts.variant;
    let body = null; obj.traverse((o) => { if (o.isSkinnedMesh) body = o; });
    const data = new Uint8Array(64);
    const tex = new THREE.DataTexture(data, 16, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.68, metalness: 0.0 });
    body.material = mat; body.castShadow = true; body.receiveShadow = false; body.frustumCulled = true;
    const ch = new Character(this, opts.rig, obj, body, tex);
    ch.setColors(Object.assign({}, FIXED, opts.colors || {}));
    return ch;
  }
  /** a random, kid-friendly, modest outfit */
  randomLook(kind, rand = Math.random) {
    const P = PALETTES, c = { skin: pick(P.skin, rand), hair: pick(P.hair, rand), shoes: pick(P.shoes, rand), bag: pick(P.bag, rand), helmet: pick(P.helmet, rand) };
    let variant, rig;
    if (kind === 'kid') {
      rig = 'Kid';
      variant = pick(['Kid_Boy', 'Kid_BoyKippah', 'Kid_BoyKippah', 'Kid_Girl', 'Kid_GirlBraids'], rand);
      c.shirt = pick(P.kidTop, rand);
      if (variant.includes('Girl')) { c.pants = pick(P.girlSkirt, rand); c.tights = pick(P.tights, rand); }
      else { c.pants = pick(P.boyPants, rand); c.kippah = pick(P.kippah, rand); if (variant === 'Kid_BoyKippah' && rand() < 0.5) c.shirt = '#ffffff'; }
    } else {
      rig = 'Adult';
      variant = pick(['Adult_Man', 'Adult_ManKippah', 'Adult_ManKippah', 'Adult_Woman', 'Adult_WomanScarf', 'Adult_WomanScarf'], rand);
      c.shirt = pick(P.adultTop, rand);
      if (variant.includes('Woman')) { c.pants = pick(P.womanSkirt, rand); c.kippah = pick(P.scarf, rand); c.tights = c.pants; }
      else { c.pants = pick(P.manPants, rand); c.kippah = pick(P.kippah, rand); }
    }
    return { rig, variant, colors: c };
  }
}

export class Character {
  constructor(lib, rig, obj, body, tex) {
    this.lib = lib; this.rig = rig; this.obj = obj; this.body = body; this.tex = tex;
    this.mixer = new THREE.AnimationMixer(obj);
    this.actions = new Map(); this.current = null; this.currentName = ''; this.overlay = null; this.overlayName = ''; this.overlaySide = 'R';
    this.acc = 0; this.visible = true;
  }
  setColors(cols) {
    const d = this.tex.image.data;
    for (const [k, v] of Object.entries(cols)) {
      const i = CELL[k]; if (i === undefined || !v) continue;
      const hex = v.replace('#', '');      // palette bytes are sRGB (texture is tagged sRGB)
      d[i * 4] = parseInt(hex.slice(0, 2), 16); d[i * 4 + 1] = parseInt(hex.slice(2, 4), 16); d[i * 4 + 2] = parseInt(hex.slice(4, 6), 16); d[i * 4 + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }
  _action(name, mask) {
    const key = name + (mask || '');
    let a = this.actions.get(key);
    if (!a) { a = this.mixer.clipAction(this.lib.clip(this.rig, name, mask)); this.actions.set(key, a); }
    return a;
  }
  /** cross-fade to a clip. opts: fade (s), timeScale, once (play once and hold last frame), time (start offset) */
  play(name, opts = {}) {
    const fade = opts.fade ?? 0.3;
    const mask = this.overlay ? 'no' + this.overlaySide : null;
    const a = this._action(name, mask);
    if (this.current === a) { if (opts.timeScale !== undefined) a.timeScale = opts.timeScale; return a; }
    a.reset(); a.enabled = true;
    a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = !!opts.once;
    a.timeScale = opts.timeScale ?? 1; a.setEffectiveWeight(1);
    if (opts.time !== undefined) a.time = opts.time;
    else if (opts.randomStart) a.time = Math.random() * a.getClip().duration;
    a.play();
    if (this.current && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current) this.current.stop();
    this.current = a; this.currentName = name;
    return a;
  }
  setTimeScale(ts) { if (this.current) this.current.timeScale = ts; }
  /** right-arm overlay (e.g. crossing guard holds the paddle up while walking) */
  setOverlay(name, opts = {}) {
    if ((name || '') === this.overlayName) return;
    if (opts.side) this.overlaySide = opts.side;
    const fade = opts.fade ?? 0.35;
    const base = this.currentName;
    if (this.overlay) { this.overlay.fadeOut(fade); }
    this.overlay = null; this.overlayName = name || '';
    if (name) {
      const o = this._action(name, 'only' + this.overlaySide); o.reset(); o.enabled = true;
      o.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); o.clampWhenFinished = !!opts.once;
      o.setEffectiveWeight(1); o.play(); if (fade) o.fadeIn(fade);
      this.overlay = o;
    }
    if (base) { const t = this.current ? this.current.time : 0, ts = this.current ? this.current.timeScale : 1; const prev = this.current; this.current = null;
      const a = this.play(base, { fade, time: t, timeScale: ts }); if (prev && prev !== a) prev.fadeOut(fade); }
  }
  get clipTime() { return this.current ? this.current.time : 0; }
  get clipDone() { const a = this.current; return !a || (a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-3); }
}

/**
 * Updates every character's mixer with a distance / visibility / quality based rate cap
 * (far or off-screen characters animate at a lower rate; cheap on phones).
 */
export class CharacterSystem {
  constructor(camera) { this.camera = camera; this.list = []; this.maxRate = 60; this._f = new THREE.Frustum(); this._m = new THREE.Matrix4(); this._s = new THREE.Sphere(); this._p = new THREE.Vector3(); }
  add(ch) { this.list.push(ch); return ch; }
  remove(ch) { const i = this.list.indexOf(ch); if (i >= 0) this.list.splice(i, 1); ch.mixer.stopAllAction(); }
  setQuality(key) { this.maxRate = key === 'low' ? 24 : key === 'medium' ? 40 : 60; this.far = key === 'low' ? 0.6 : 1; }
  update(dt) {
    const cam = this.camera;
    this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this._f.setFromProjectionMatrix(this._m);
    for (const ch of this.list) {
      ch.acc += dt;
      ch.obj.getWorldPosition(this._p);
      const d = this._p.distanceTo(cam.position) * (this.far ? 1 / this.far : 1);
      this._s.center.copy(this._p); this._s.radius = 1.6;
      const vis = this._f.intersectsSphere(this._s);
      let rate = this.maxRate;
      if (!vis) rate = 4; else if (d > 90) rate = 8; else if (d > 55) rate = 15; else if (d > 30) rate = Math.min(rate, 30);
      if (ch.acc >= 1 / rate - 1e-4) { ch.mixer.update(ch.acc); ch.acc = 0; }
    }
  }
}
