import * as THREE from 'three';
import { QUALITY } from './config.js';
import { toWorld } from './coords.js';
import { loadWorld, setupLighting } from './world/World.js';
import { TrafficLights } from './sim/TrafficLights.js';
import { Vehicles } from './sim/Vehicles.js';
import { Pedestrians } from './sim/Pedestrians.js';
import { Ambient } from './sim/Ambient.js';
import { CameraRig } from './camera/CameraRig.js';
import { AudioManager } from './audio/AudioManager.js';
import { HazardLayer } from './hazards/HazardLayer.js';
import { UI } from './ui/UI.js';
import { CharacterLib, CharacterSystem } from './characters/Characters.js';

// URL options: ?quality=low|medium|high  ?intro=0  ?autostart=1  ?introAt=0..1  ?view=school  ?warm=20  ?dev=1  ?paused=1
const params = new URLSearchParams(location.search);
const isTouchSmall = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1200);
    this.audio = new AudioManager();
    this.rig = new CameraRig(this.camera, this.canvas);
    this.clock = new THREE.Clock();
    this.qualityKey = params.get('quality') || localStorage.getItem('rsc_quality') || (isTouchSmall ? 'medium' : 'high');
    if (!QUALITY[this.qualityKey]) this.qualityKey = 'medium';
    this.ui = new UI(this);
    addEventListener('resize', () => this.resize());
    this.resize();
  }
  async init() {
    this.lighting = setupLighting(this.renderer, this.scene);
    let pw = 0, pc = 0;
    const prog = () => this.ui.progress((pw * 0.6 + pc * 0.4) * 0.9, 'טוֹעֵן אֶת הָעִיר…');
    const [world, lib] = await Promise.all([
      loadWorld(this.scene, 'assets/city_env.glb', (p) => { pw = p; prog(); }),
      CharacterLib.load('assets/characters.glb', 'data/characters.json', (p) => { pc = p; prog(); }),
    ]);
    this.world = world;
    this.chars = { lib, sys: new CharacterSystem(this.camera) };
    this.ui.progress(0.95, 'מַפְעִיל רַמְזוֹרִים וּתְנוּעָה…');
    this.lights = new TrafficLights(this.scene);
    this.vehicles = new Vehicles(this.scene, this.world.protos, this.lights);
    this.peds = new Pedestrians(this.scene, this.chars, this.lights, this.vehicles);
    this.vehicles.schoolBusy = () => this.peds.schoolBusy;
    this.vehicles.guardAtCurb = () => this.peds.guard.state === 'curb';
    this.ambient = new Ambient(this.scene, this.world, this.chars); this.ambient.camera = this.camera;
    this.hazards = new HazardLayer(this.scene, this.world, { app: this, THREE });
    this.vehicles.on('busStop', (v) => { if (this.camera.position.distanceTo(v.obj.position) < 70) this.audio.busBrake(); });
    this.setQuality(this.qualityKey);
    // warm-up so traffic is flowing on the first frame
    const warm = parseFloat(params.get('warm') || '12');
    for (let t = 0; t < warm; t += 1 / 30) this.step(1 / 30, true);
    // dev: keep simulating until an interesting moment (for screenshots): ?warmUntil=guard|look|pair
    const until = params.get('warmUntil');
    if (until) {
      const P = this.peds, near = (w) => Math.abs(w.x - 16.5) < 4 && Math.abs(w.y) < 7;
      const test = { guard: () => P.guard.state === 'road' && P.walkers.some((w) => w.edge.crossing === 'zebra:school' && w.onCrossing && w.d > 1.5 && w.d < 4),
        look: () => P.walkers.some((w) => w.state === 'look' && w.stateT > 0.4 && w.stateT < 0.9 && near(w)),
        pair: () => P.walkers.some((w) => w.kid && w.onCrossing && w.d > 2 && w.d < 5) }[until];
      for (let t = 0; t < 900 && test && !test(); t += 1 / 30) this.step(1 / 30, true);
    }
    // double-tap / double-click: focus the camera on that spot
    const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    const focusAt = (cx, cy) => {
      const r = this.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
      if (ray.ray.intersectPlane(ground, hit) && this.rig.mode !== 'intro') this.rig.focusPoint(hit);
    };
    this.canvas.addEventListener('dblclick', (e) => focusAt(e.clientX, e.clientY));
    let lastTap = 0;
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch') return;
      const now = performance.now(); if (now - lastTap < 300) focusAt(e.clientX, e.clientY); lastTap = now;
    });
    addEventListener('keydown', (e) => { if (e.key === 'a' || e.key === 'A') { this._anch = !this._anch; this.hazards.showAnchors(this._anch); } });
    if (params.get('dev') === '1') {
      this._anch = true; this.hazards.showAnchors(true);
      this.ui.devPanel(this.hazards.listAnchors(), (a) => this.rig.focusPoint(new THREE.Vector3(...a.position)));
    }
    // public API for the future game shell (login -> hazards)
    window.RoadSafetyCity = { app: this, THREE, scene: this.scene, world: this.world, hazards: this.hazards, lights: this.lights,
      vehicles: this.vehicles, pedestrians: this.peds, camera: this.rig, anchors: () => this.hazards.listAnchors() };
    window.dispatchEvent(new CustomEvent('city-ready', { detail: window.RoadSafetyCity }));
    this.renderer.setAnimationLoop(() => this.frame());
    const start = () => {
      this.ui.hideLoader(); this.audio.start();
      if (params.has('introAt')) { this.ui.introMode(true); const p = parseFloat(params.get('introAt')); this.rig.seekIntro(p); this.ui.introProgress(p); }
      else if (params.get('intro') === '0' || params.has('cam') || params.has('focus')) this.enterExplore(params.get('view') || 'overview', true);
      else this.playIntro();
      if (params.has('focus')) {   // dev: frame the walker that matched ?warmUntil (look / pair) from the front
        const f = params.get('focus'), P = this.peds;
        const w = f === 'bike' ? P.cyclists.find((x) => x.state === 'walk') : f === 'pair' ? P.walkers.find((x) => x.kid && x.onCrossing) : P.walkers.find((x) => x.state === 'look' && Math.abs(x.x - 16.5) < 4 && Math.abs(x.y) < 7);
        if (w) {
          const c = Math.cos(w.dir), s = Math.sin(w.dir), side = f === 'pair' ? -1 : 1;
          this.rig.mode = 'free'; this.rig.controls.enabled = true; this.ui.introMode(false);
          toWorld(w.x + c * 3.6 + s * 1.8 * side, w.y + s * 3.6 - c * 1.8 * side, 1.9, this.camera.position);
          toWorld(w.x - s * 0.4 * side, w.y + c * 0.4 * side, 0.7, this.rig.controls.target); this.rig.controls.update();
        }
      }
      if (params.has('cam')) {     // ?cam=px,py,ph,tx,ty,th (map coords) - close-ups for screenshots
        const c = params.get('cam').split(',').map(Number);
        this.rig.mode = 'free'; this.rig.controls.enabled = true; this.ui.introMode(false);
        toWorld(c[0], c[1], c[2], this.camera.position); toWorld(c[3], c[4], c[5], this.rig.controls.target); this.rig.controls.update();
      }
    };
    // initial camera for the loader background
    this.rig.seekIntro(0); this.rig.mode = 'idle';
    if (params.get('lineup') === '1') this._lineup();
    if (params.get('autostart') === '1') start(); else this.ui.ready(start);
  }
  /** ?lineup=1 : every character variant in a row (south of the playground) */
  _lineup() {
    for (const t of this.world.trees) if (t.position.x > 18 && t.position.x < 42 && -t.position.z < -33 && -t.position.z > -46) t.visible = false;
    const { lib, sys } = this.chars, clips = ['Wave', 'Idle', 'Look', 'Walk', 'Talk', 'Idle', 'Wave', 'Walk', 'Talk', 'Look', 'Idle', 'Wave'];
    const looks = [['Kid', 'Kid_BoyKippah', ['Kid_Backpack']], ['Kid', 'Kid_Girl', ['Kid_Backpack']], ['Kid', 'Kid_Boy', []], ['Kid', 'Kid_GirlBraids', ['Kid_Backpack']],
      ['Adult', 'Adult_ManKippah', []], ['Adult', 'Adult_WomanScarf', []], ['Adult', 'Adult_Man', []], ['Adult', 'Adult_Woman', []],
      ['Adult', 'Adult_WomanScarf', ['Adult_Vest', 'Adult_Paddle']], ['Kid', 'Kid_BoyKippah', ['Kid_Helmet']]];
    looks.forEach(([rig, variant, extras], i) => {
      const l = lib.randomLook(rig === 'Kid' ? 'kid' : 'adult');
      const ch = sys.add(lib.create({ rig, variant, extras, colors: l.colors }));
      toWorld(24 + i * 1.3, -34.5, 0.15, ch.obj.position); ch.obj.rotation.y = -Math.PI / 2;
      this.scene.add(ch.obj); ch.play(i === 8 ? 'Paddle' : clips[i], { fade: 0, once: i === 8, randomStart: i !== 8 });
    });
  }
  playIntro() {
    this.ui.introMode(true);
    this.rig.onIntroProgress = (p) => this.ui.introProgress(p);
    this.rig.playIntro(() => this.enterExplore(null));
  }
  enterExplore(view, instant = false) {
    this.ui.introMode(false); this.ui.showHintOnce();
    if (view) {
      if (instant) { const { target, pos } = this.rig.viewPose(view); this.camera.position.copy(pos); this.rig.controls.target.copy(target); this.rig.mode = 'free'; this.rig.controls.enabled = true; this.rig.controls.update(); }
      else this.rig.flyTo(view);
      this.ui.setActive(view);
    } else this.ui.setActive('overview');
  }
  setQuality(key) {
    const q = QUALITY[key]; this.qualityKey = key; localStorage.setItem('rsc_quality', key);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatioMax));
    this.renderer.shadowMap.enabled = q.shadows;
    const sun = this.lighting.sun; sun.castShadow = q.shadows;
    if (q.shadows) { sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
    this.vehicles.setCount(q.cars); this.peds.setCount(q.peds, q.cyclists, q.pairs); this.chars.sys.setQuality(key); this.ambient.setCounts(q.birds, q.clouds);
    this.resize(); this.ui.refresh();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h; this.camera.fov = w / h < 1 ? 62 : 50; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
  step(dt, warm = false) {
    this.lights.update(dt);
    this.peds.update(dt);
    this.vehicles.update(dt, this.peds.obstacles);
    this.ambient.update(dt);
  }
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (params.get('paused') !== '1') this.step(dt);
    this.rig.update(dt);
    this.camera.updateMatrixWorld();
    this.chars.sys.update(params.get('paused') === '1' ? 0 : dt);
    this.hazards.update(this.clock.elapsedTime);
    this.ui.signal(this.lights.vehicle('A'));
    // audio mix: traffic near the orbit target, signal ticks near the junction
    const tgt = this.rig.controls.target;
    let act = 0;
    for (const v of this.vehicles.list) if (v.active) act += Math.max(0, 1 - v.obj.position.distanceTo(this.camera.position) / 45) * (v.v / 9);
    const jd = Math.hypot(tgt.x, tgt.z) + this.camera.position.distanceTo(tgt) * 0.5;
    const pedG = this.lights.ped('EW_arm').state === 'green' || this.lights.ped('NS_arm').state === 'green';
    this.audio.update(dt, { activity: Math.min(1, act / 3), junctionProximity: Math.max(0, 1 - jd / 35), pedGreen: pedG });
    this.renderer.render(this.scene, this.camera);
  }
}

const app = new App();
app.init().catch((e) => { console.error(e); document.getElementById('load-text').textContent = 'שְׁגִיאָה בִּטְעִינָה: ' + e.message; });
