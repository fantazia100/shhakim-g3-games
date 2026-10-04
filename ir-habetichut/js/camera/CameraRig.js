import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { INTRO, VIEWS, BOUNDS } from '../config.js';
import { toWorld, clamp, smooth } from '../coords.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    const c = (this.controls = new OrbitControls(camera, dom));
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.screenSpacePanning = false;            // pan along the ground
    c.minDistance = 5; c.maxDistance = 150;
    c.maxPolarAngle = THREE.MathUtils.degToRad(80); c.minPolarAngle = THREE.MathUtils.degToRad(8);
    c.rotateSpeed = 0.55; c.zoomSpeed = 1.1; c.panSpeed = 1.0;
    c.zoomToCursor = true;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.autoRotateSpeed = 0.35;
    c.enabled = false;
    this.mode = 'idle'; this.idle = 0;
    c.addEventListener('start', () => { this.idle = 0; c.autoRotate = false; if (this.mode === 'fly') this.mode = 'free'; });
    this.posCurve = new THREE.CatmullRomCurve3(INTRO.pos.map(([x, y, h]) => toWorld(x, y, h)), false, 'centripetal');
    this.tgtCurve = new THREE.CatmullRomCurve3(INTRO.tgt.map(([x, y, h]) => toWorld(x, y, h)), false, 'centripetal');
    this._tmp = new THREE.Vector3();
    this.onIntroEnd = null; this.onIntroProgress = null;
  }
  /** portrait screens need a wider view: push the camera back */
  get distScale() { const a = this.camera.aspect; return a < 1 ? clamp(0.72 / a, 1.05, 1.55) : 1; }
  viewPose(name) {
    const v = VIEWS[name] || VIEWS.overview;
    const target = toWorld(...v.target);
    const pos = toWorld(...v.pos).sub(target).multiplyScalar(this.distScale).add(target);
    return { target, pos };
  }
  playIntro(onEnd) {
    this.mode = 'intro'; this.p = 0; this.controls.enabled = false; this.onIntroEnd = onEnd;
  }
  seekIntro(p) { this.mode = 'intro-frozen'; this.p = p; this._applyIntro(p); }
  skipIntro() { if (this.mode.startsWith('intro')) this._endIntro(); }
  _applyIntro(p) {
    const e = ease(clamp(p, 0, 1));
    const pos = this.posCurve.getPoint(e), tgt = this.tgtCurve.getPoint(e);
    // on portrait screens pull back a little from the look-at point
    if (this.distScale > 1) pos.sub(tgt).multiplyScalar(1 + (this.distScale - 1) * 0.6).add(tgt);
    this.camera.position.copy(pos); this.camera.lookAt(tgt);
    this.controls.target.copy(tgt);
  }
  _endIntro() {
    const { target, pos } = this.viewPose('overview');
    this.flyTo(null, 1.4, { target, pos });
    const cb = this.onIntroEnd; this.onIntroEnd = null; cb && cb();
  }
  flyTo(name, dur = 2.0, pose = null) {
    const to = pose || this.viewPose(name);
    this.fly = { t: 0, dur, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: to.pos, t1: to.target };
    this.mode = 'fly'; this.controls.enabled = true; this.controls.autoRotate = false; this.idle = 0;
  }
  /** fly so that `point` (three.js coords) becomes the orbit centre, zooming in a bit */
  focusPoint(point) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = clamp(off.length() * 0.6, 12, 60);
    off.setLength(len);
    const target = point.clone(); target.y = 0;
    this.flyTo(null, 1.2, { target, pos: target.clone().add(off) });
  }
  update(dt) {
    if (this.mode === 'intro') {
      this.p += dt / INTRO.duration;
      this._applyIntro(this.p);
      this.onIntroProgress && this.onIntroProgress(this.p);
      if (this.p >= 1) this._endIntro();
      return;
    }
    if (this.mode === 'intro-frozen') return;
    if (this.mode === 'fly') {
      const f = this.fly; f.t += dt;
      const k = smooth(clamp(f.t / f.dur, 0, 1));
      this.camera.position.lerpVectors(f.p0, f.p1, k);
      // arc upwards while flying for a cinematic move
      this.camera.position.y += Math.sin(k * Math.PI) * Math.min(18, f.p0.distanceTo(f.p1) * 0.15);
      this.controls.target.lerpVectors(f.t0, f.t1, k);
      this.camera.lookAt(this.controls.target);
      if (k >= 1) this.mode = 'free';
      return;
    }
    if (this.mode === 'free') {
      const t = this.controls.target;
      t.x = clamp(t.x, BOUNDS.min, BOUNDS.max); t.z = clamp(t.z, BOUNDS.min, BOUNDS.max); t.y = clamp(t.y, 0, 6);
      this.controls.update();
      if (this.camera.position.y < 1.5) this.camera.position.y = 1.5;
      this.idle += dt;
      if (this.idle > 45) this.controls.autoRotate = true;     // attract mode on smart boards
    }
  }
}
