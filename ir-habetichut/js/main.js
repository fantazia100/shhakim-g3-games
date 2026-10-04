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
    this.world = await loadWorld(this.scene, 'assets/city_env.glb', (p) => this.ui.progress(p * 0.9, 'טוען את העיר…'));
    this.ui.progress(0.95, 'מפעיל רמזורים ותנועה…');
    this.lights = new TrafficLights(this.scene);
    this.vehicles = new Vehicles(this.scene, this.world.protos, this.lights);
    this.peds = new Pedestrians(this.scene, this.world.protos, this.lights, this.vehicles, this.world.anim.CrossingGuard);
    this.vehicles.schoolBusy = () => this.peds.schoolBusy;
    this.vehicles.guardAtCurb = () => this.peds.guard.state === 'curb';
    this.ambient = new Ambient(this.scene, this.world, this.world.protos);
    this.hazards = new HazardLayer(this.scene, this.world, { app: this, THREE });
    this.vehicles.on('busStop', (v) => { if (this.camera.position.distanceTo(v.obj.position) < 70) this.audio.busBrake(); });
    this.setQuality(this.qualityKey);
    // warm-up so traffic is flowing on the first frame
    const warm = parseFloat(params.get('warm') || '12');
    for (let t = 0; t < warm; t += 1 / 30) this.step(1 / 30, true);
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
      else if (params.get('intro') === '0') this.enterExplore(params.get('view') || 'overview', true);
      else this.playIntro();
    };
    // initial camera for the loader background
    this.rig.seekIntro(0); this.rig.mode = 'idle';
    if (params.get('autostart') === '1') start(); else this.ui.ready(start);
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
    this.vehicles.setCount(q.cars); this.peds.setCount(q.peds, q.cyclists); this.ambient.setCounts(q.birds, q.clouds);
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
app.init().catch((e) => { console.error(e); document.getElementById('load-text').textContent = 'שגיאה בטעינה: ' + e.message; });
