import * as THREE from 'three';
import { ROUTES } from './Network.js';
import { SIM } from '../config.js';
import { toWorld, angleLerp } from '../coords.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- Route (polyline with arc-length)
class Route {
  constructor(name, def) {
    this.name = name; this.pts = def.pts; this.weight = def.w;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1], [bx, by] = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    this.length = this.cum[this.cum.length - 1];
    this.stops = def.stops.map((st) => ({ ...st, s: this.project(st.at) })).sort((a, b) => a.s - b.s);
    // heading per metre, for curvature-based speed limits
    this.head = [];
    const p = {};
    for (let s = 0; s <= this.length; s += 1) { this.sample(s, p); this.head.push(p.h); }
  }
  project([x, y]) {
    let best = 1e9, bs = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1], [bx, by] = this.pts[i];
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
      if (d < best) { best = d; bs = this.cum[i - 1] + t * Math.sqrt(L2); }
    }
    return bs;
  }
  sample(s, out) {
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const [ax, ay] = this.pts[i - 1], [bx, by] = this.pts[i];
    const L = this.cum[i] - this.cum[i - 1] || 1, t = (s - this.cum[i - 1]) / L;
    out.x = ax + (bx - ax) * t; out.y = ay + (by - ay) * t; out.h = Math.atan2(by - ay, bx - ax);
    return out;
  }
  isTurningAhead(s, look = 9) {
    const i0 = Math.max(0, Math.floor(s)), i1 = Math.min(this.head.length - 1, Math.floor(s + look));
    const h0 = this.head[i0];
    for (let i = i0; i <= i1; i++) {
      let d = Math.abs(this.head[i] - h0); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > 0.2) return true;
    }
    return false;
  }
}

const CAR_KINDS = ['Car_Red', 'Car_Blue', 'Car_Yellow', 'Car_White', 'Car_Taxi', 'Car_Blue', 'Car_Red', 'Car_Yellow'];
const tmp = {};

// ---------------------------------------------------------------- Vehicle
class Vehicle {
  constructor(mgr, proto, kind) {
    this.mgr = mgr; this.kind = kind;
    this.isBus = kind === 'Bus';
    this.halfLen = this.isBus ? 6.1 : (kind === 'Car_Taxi' ? 2.2 : 2.1);
    this.vmax = (this.isBus ? SIM.busSpeed : SIM.carSpeed) * (this.isBus ? 1 : 0.9 + Math.random() * 0.2);
    this.obj = proto.clone(true);
    this.id = mgr.serial; this.obj.name = `Vehicle_${kind}_${mgr.serial++}`; this.ignore = null; this.ignoreT = 0;
    // brake / tail lights (own material so each car can light up independently)
    this.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.25, roughness: 0.4 });
    const parts = [-0.62, 0.62].map((z) => new THREE.BoxGeometry(0.06, 0.16, 0.34)
      .translate(-this.halfLen + 0.02, this.isBus ? 0.9 : 0.72, z * (this.isBus ? 1.6 : 1)));
    this.obj.add(new THREE.Mesh(mergeGeometries(parts), this.tail));
    this.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.obj.visible = false;
    mgr.group.add(this.obj);
    this.active = false; this.x = 0; this.y = 0; this.h = 0; this.v = 0; this.fade = 0;
  }
  start(route, s = 0, v = 0) {
    this.route = route; this.s = s; this.v = v; this.active = true; this.leaving = false;
    this.fade = s > 0 ? 1 : 0;
    this.stopState = route.stops.map((st) => ({ done: st.s < s + this.halfLen - 0.5, timer: 0, committed: false }));
    route.sample(s, tmp); this.x = tmp.x; this.y = tmp.y; this.h = tmp.h;
    this.obj.visible = true; this._apply(0);
  }
  // distance along MY future path to the nearest body point of any obstacle (works through turns and merges)
  _scanPath(list, radius, isVehicle) {
    const P = this.mgr.pathBuf, n = this.mgr.pathN;
    let best = Infinity; this._hit = null;
    const r2 = radius * radius;
    for (const o of list) {
      if (o === this || o.active === false || o === this.ignore) continue;
      if (Math.abs(o.x - this.x) > 40 || Math.abs(o.y - this.y) > 40) continue;
      const oc = Math.cos(o.h || 0), os = Math.sin(o.h || 0), hl = isVehicle ? o.halfLen * 0.9 : 0;
      for (let k = isVehicle ? -1 : 0; k <= (isVehicle ? 1 : 0); k++) {
        const bx = o.x + oc * hl * k, by = o.y + os * hl * k;
        for (let i = 1; i < n; i++) {
          const p = P[i]; if (p.d >= best) break;
          const dx = p.x - bx, dy = p.y - by;
          if (dx * dx + dy * dy < r2) { best = p.d; this._hit = o; break; }
        }
      }
    }
    return best;
  }
  update(dt, lights, others, pedObs) {
    if (!this.active) return;
    const r = this.route;
    // --- sample my path ahead
    const P = this.mgr.pathBuf; let n = 0;
    for (let d = 0; d <= 36; d += 1.5) { const p = P[n++]; r.sample(this.s + d, p); p.d = d; }
    this.mgr.pathN = n;
    if (this.ignoreT > 0) { this.ignoreT -= dt; if (this.ignoreT <= 0) this.ignore = null; }
    const vehAlong = this._scanPath(others, 1.35, true);
    this.blockedBy = this.v < 0.2 ? this._hit : null;
    // deadlock breaker: two stopped cars that block each other -> the newer one gives way by ignoring the other briefly
    if (this.blockedBy && this.blockedBy.blockedBy === this && this.id > this.blockedBy.id) { this.ignore = this.blockedBy; this.ignoreT = 2.5; }
    const pedAlong = this._scanPath(pedObs, 1.9, false);
    const freeAhead = vehAlong - this.halfLen;            // free road in front of my bumper
    let dLim = Math.min(freeAhead - 1.8, pedAlong - this.halfLen - 1.4);
    let vCap = r.isTurningAhead(this.s + this.halfLen) ? SIM.turnSpeed : this.vmax;
    // --- traffic control
    for (let i = 0; i < r.stops.length; i++) {
      const st = r.stops[i], ss = this.stopState[i];
      if (ss.done) continue;
      const dist = st.s - (this.s + this.halfLen);
      if (dist < -1.5) { ss.done = true; continue; }
      if (dist > 70) break;
      // "keep clear": never enter a junction / crosswalk without room to leave it
      const roomBeyond = freeAhead > dist + (st.clear || 0) + 2 * this.halfLen + 1;
      if (st.kind === 'light') {
        if (ss.committed) continue;
        // a 12 m bus cannot fit between the junction and the school crossing: wait while that crossing is busy
        const busBlocked = this.isBus && st.group === 'A' && this.mgr.schoolBusy() && dist > 0.3;
        if (lights.mayPass(st.group, dist, this.v) && (roomBeyond || dist < 0.3) && !busBlocked) { if (dist < 2.5) ss.committed = true; }
        else dLim = Math.min(dLim, dist);
      } else if (st.kind === 'keepclear') {
        if (dist < 0.3) ss.done = true; else if (!roomBeyond) dLim = Math.min(dLim, dist);
      } else if (st.kind === 'stop') {                     // full stop, then go when clear
        dLim = Math.min(dLim, dist);
        if (dist < 1.5 && this.v < 0.3) {
          ss.timer += dt;
          if (ss.timer > 1.6 && roomBeyond && this.mgr.checks[st.check](this)) ss.done = true;
        }
      } else if (st.kind === 'yield') {                    // slow down, stop only if needed
        if (dist < 16) vCap = Math.min(vCap, 3.5);
        const ok = this.mgr.checks[st.check](this) && roomBeyond;
        if (ok && dist < 5) ss.done = true; else if (!ok) dLim = Math.min(dLim, dist);
      } else if (st.kind === 'bus') {
        dLim = Math.min(dLim, dist);
        if (dist < 1.2 && this.v < 0.3) {
          if (ss.timer === 0) this.mgr.emit('busStop', this);
          ss.timer += dt;
          if (ss.timer > st.dwell) { ss.done = true; this.mgr.emit('busGo', this); }
        }
      }
    }
    // --- speed control
    const vT = dLim <= 0.15 ? 0 : Math.min(vCap, Math.sqrt(2 * SIM.comfortBrake * Math.max(0, dLim - 0.15)));
    const braking = vT < this.v - 0.05;
    this.v = braking ? Math.max(vT, this.v - SIM.brake * dt) : Math.min(vT, this.v + SIM.accel * dt);
    this.tail.emissiveIntensity = braking || this.v < 0.2 ? 2.8 : 0.25;
    this.s += this.v * dt;
    this.stopT = this.v < 0.1 ? (this.stopT || 0) + dt : 0;
    if (this.stopT > 90) this.leaving = true;      // watchdog: never allow a permanent gridlock
    r.sample(this.s, tmp);
    this.x = tmp.x; this.y = tmp.y; this.h = angleLerp(this.h, tmp.h, Math.min(1, dt * 8));
    // fade in / out at the ends of the road
    if (this.s >= r.length - 0.5) this.leaving = true;
    this.fade = this.leaving ? this.fade - dt * 2 : Math.min(1, this.fade + dt * 2);
    if (this.leaving && this.fade <= 0) { this.active = false; this.obj.visible = false; this.mgr.onFinished(this); return; }
    this._apply(dt);
  }
  _apply() {
    toWorld(this.x, this.y, 0, this.obj.position);
    this.obj.rotation.y = this.h;
    const k = Math.max(0.001, this.fade);
    this.obj.scale.setScalar(k);
  }
}

// ---------------------------------------------------------------- manager
export class Vehicles {
  constructor(scene, protos, lights) {
    this.group = new THREE.Group(); this.group.name = 'Vehicles'; scene.add(this.group);
    this.protos = protos; this.lights = lights; this.serial = 0;
    this.routes = Object.fromEntries(Object.entries(ROUTES).map(([k, d]) => [k, new Route(k, d)]));
    this.carRoutes = Object.values(this.routes).filter((r) => r.name !== 'BUS');
    this.totalW = this.carRoutes.reduce((a, r) => a + r.weight, 0);
    this.list = []; this.waiting = []; this.listeners = {};
    this.schoolBusy = () => false; this.guardAtCurb = () => true;   // wired to Pedestrians in main.js
    this.pathBuf = Array.from({ length: 30 }, () => ({ x: 0, y: 0, h: 0, d: 0 })); this.pathN = 0;
    this.target = 0;
    this.bus = new Vehicle(this, protos.Bus, 'Bus'); this.list.push(this.bus);
    this.bus.start(this.routes.BUS, 30, 6);
    const self = this;
    this.checks = {
      // stop sign on side street N: wait for a gap in westbound traffic coming from the east
      // (cars queued at the light further west do not block; cars in the merge zone or approaching do)
      sideN: (me) => !self.list.some((o) => { const fx = o.x + Math.cos(o.h) * o.halfLen, bx = o.x - Math.cos(o.h) * o.halfLen;
        return o !== me && o.active && o.y > 0 && o.y < 3.6 && Math.cos(o.h) < -0.5 &&
          ((bx > 17.5 && fx < 25) || (fx >= 17.5 && fx < (me.stopT > 20 ? 33 : 45) && o.v > 1)); }) && self.guardAtCurb(),
      // yield on side street S: wait for a gap in eastbound traffic coming from the west
      sideS: (me) => !self.list.some((o) => { const fx = o.x + Math.cos(o.h) * o.halfLen, bx = o.x - Math.cos(o.h) * o.halfLen;
        return o !== me && o.active && o.y < 0 && o.y > -3.6 && Math.cos(o.h) > 0.5 &&
          ((fx > -21 && bx < -12.5) || (fx <= -12.5 && fx > (me.stopT > 20 ? -31 : -43) && o.v > 1)); }),
    };
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, v) { (this.listeners[ev] || []).forEach((f) => f(v)); }
  setCount(n) {
    this.target = n;
    while (this.list.length - 1 < n) {
      const kind = CAR_KINDS[this.serial % CAR_KINDS.length];
      const v = new Vehicle(this, this.protos[kind] || this.protos.Car_Red, kind);
      this.list.push(v);
      if (!this._seed(v)) this.waiting.push({ v, t: Math.random() * 3 });
    }
  }
  _pickRoute() {
    let r = Math.random() * this.totalW;
    for (const route of this.carRoutes) { r -= route.weight; if (r <= 0) return route; }
    return this.carRoutes[0];
  }
  _clearAt(x, y, d) { return !this.list.some((o) => o.active && Math.hypot(o.x - x, o.y - y) < d); }
  _seed(v) {   // place a new car somewhere along a straight route so the city starts busy
    const straight = ['EB', 'WB', 'NB', 'SB'];
    for (let k = 0; k < 40; k++) {
      const r = this.routes[straight[k % 4]];
      const s = 6 + Math.random() * (r.length - 20);
      r.sample(s, tmp);
      if (Math.abs(tmp.x) < 10 && Math.abs(tmp.y) < 10) continue;
      if (Math.abs(tmp.x - 12) < 4 && Math.abs(tmp.y) < 4) continue;
      if (!this._clearAt(tmp.x, tmp.y, 13)) continue;
      v.start(r, s, v.vmax * 0.6);
      return true;
    }
    return false;
  }
  onFinished(v) {
    if (v.isBus) { this.waiting.push({ v, t: 3 }); return; }
    if (this.list.length - 1 > this.target) {        // quality lowered: retire this car
      this.list.splice(this.list.indexOf(v), 1); this.group.remove(v.obj); return;
    }
    this.waiting.push({ v, t: 0.5 + Math.random() * 2.5 });
  }
  update(dt, pedObs) {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i]; w.t -= dt;
      if (w.t > 0) continue;
      const r = w.v.isBus ? this.routes.BUS : this._pickRoute();
      const [x, y] = r.pts[0];
      if (this._clearAt(x, y, 15)) { w.v.start(r, 0, w.v.vmax * 0.8); this.waiting.splice(i, 1); }
      else w.t = 0.7;
    }
    for (const v of this.list) v.update(dt, this.lights, this.list, pedObs);
  }
}
