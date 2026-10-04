import * as THREE from 'three';
import { PED_NODES, PED_EDGES, BIKE_NODES, BIKE_EDGES, ZEBRAS } from './Network.js';
import { toWorld, onRoad, angleLerp, lerp } from '../coords.js';
import { makeBike } from './Bike.js';

class Graph {
  constructor(nodes, edges) {
    this.nodes = nodes; this.adj = {};
    for (const k of Object.keys(nodes)) this.adj[k] = [];
    for (const [a, b, crossing] of edges) {
      this.adj[a].push({ to: b, crossing: crossing || null });
      this.adj[b].push({ to: a, crossing: crossing || null });
    }
    this.walkable = Object.keys(nodes).filter((k) => this.adj[k].length > 0);
  }
}
const PED_GRAPH = new Graph(PED_NODES, PED_EDGES);
const BIKE_GRAPH = new Graph(BIKE_NODES, BIKE_EDGES);
const LOOK_TS = 1.15;            // Look clip (left-right-left) speed at the curb
const HAND_OFFSET = 0.78;         // child walks this far to the right of the adult, holding hands

/**
 * A pedestrian (optionally with a child holding their hand) or a cyclist walking a graph.
 * Crossing etiquette: stop at the curb -> look left-right-left -> wait for green / a clear road -> (look again if the wait was long) -> walk across.
 */
class Walker {
  constructor(mgr, graph, opts) {
    this.mgr = mgr; this.graph = graph; this.opts = opts;
    this.speed = opts.speed; this.cyclist = !!opts.cyclist; this.halfLen = this.cyclist ? 0.8 : 0.3;
    this.keepRight = opts.keepRight;
    const lib = mgr.lib;
    this.ch = mgr.sys.add(lib.create(Object.assign({ name: opts.name }, opts.look)));
    this.rigSpeed = lib.walkSpeed(this.ch.rig);
    if (this.cyclist) {
      const kid = this.ch.rig === 'Kid';
      this.bike = makeBike(kid ? 0.62 : 1.0);
      this.obj = new THREE.Group(); this.obj.name = opts.name;
      this.obj.add(this.bike.group, this.ch.obj);
      const m = lib.rigs[this.ch.rig].m;
      this.ch.obj.position.set(this.bike.seat.x - 0.02, this.bike.seat.y - (m.hipHeight - (kid ? 0.054 : 0.094)), 0);
      this.ch.play('Pedal', { fade: 0, randomStart: true });
    } else {
      this.obj = this.ch.obj;
      this.ch.play(opts.companion ? 'WalkHand' : 'Walk', { fade: 0, randomStart: true });
      if (opts.companion) {        // child holding the adult's right hand
        this.kid = mgr.sys.add(lib.create(Object.assign({ name: opts.name + '_child' }, opts.companion)));
        this.kid.setOverlay('WalkHand', { side: 'L', fade: 0 });
        this.ch.setOverlay('WalkHand', { side: 'R', fade: 0 });
        this.kidSpeed = lib.walkSpeed('Kid');
        this.kidObs = { x: 0, y: 0, halfLen: 0.3 };
        mgr.group.add(this.kid.obj);
      }
    }
    mgr.group.add(this.obj);
    this.hh = 0.15; this.active = true; this.stateT = 0; this.waited = 0;
    const nodes = graph.walkable;
    for (let k = 0; k < 20; k++) {
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      const e = graph.adj[a].find((x) => !x.crossing);
      if (e) { this._begin(a, e, Math.random()); break; }
    }
  }
  dispose() {
    this.mgr.group.remove(this.obj); this.mgr.sys.remove(this.ch);
    if (this.kid) { this.mgr.group.remove(this.kid.obj); this.mgr.sys.remove(this.kid); }
  }
  _begin(from, edge, frac = 0) {
    this.from = from; this.edge = edge; this.to = edge.to;
    const [ax, ay] = this.graph.nodes[from], [bx, by] = this.graph.nodes[edge.to];
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.len = Math.hypot(bx - ax, by - ay); this.d = frac * this.len;
    this.dir = Math.atan2(by - ay, bx - ax);
    this._set('walk');
    this.h = this.h ?? this.dir;
  }
  _set(s) { this.state = s; this.stateT = 0; }
  _chooseNext() {
    const opts = this.graph.adj[this.to].filter((e) => e.to !== this.from);
    const e = opts.length ? opts[Math.floor(Math.random() * opts.length)] : this.graph.adj[this.to][0];
    const from = this.to;
    this._begin(from, e, 0);
    if (e.crossing) { this._set(this.cyclist ? 'wait' : 'look'); this.waited = 0; }
  }
  get onCrossing() { return !!this.edge.crossing && this.state === 'walk'; }
  get waitingAtCurb() { return !!this.edge.crossing && this.state !== 'walk'; }
  _anim(name, opts) { this.ch.play(name, opts); if (this.kid) this.kid.play(name, opts); }
  update(dt) {
    this.stateT += dt;
    const lookDur = this.mgr.lib.clip(this.ch.rig, 'Look').duration / LOOK_TS;
    switch (this.state) {
      case 'look':       // first look left-right-left at the curb
        if (this.stateT >= lookDur) { if (this.mgr.mayCross(this, this.edge.crossing)) this._set('walk'); else this._set('wait'); }
        break;
      case 'wait':
        this.waited += dt;
        if (this.mgr.mayCross(this, this.edge.crossing)) {
          if (!this.cyclist && this.waited > 3) this._set('look2'); else this._set('walk');
        }
        break;
      case 'look2':      // quick second look after a long wait (the light just turned green / the guard stopped the cars)
        if (this.stateT >= lookDur / 1.8) this._set('walk');
        break;
      default:
        // a vehicle stopped across the crossing (queue spill-back): wait in front of it instead of walking through it
        this.held = !!this.edge.crossing && this.mgr.blockedAhead(this, 1.3);
        if (!this.held) this.d += this.speed * dt;
        if (this.d >= this.len) { this.d = this.len; this._chooseNext(); }
    }
    // ---- animation state
    if (this.cyclist) {
      const ts = this.state === 'walk' ? this.speed * this.bike.crankPerMetre * 0.8 * 1.0 : 0;
      this.ch.setTimeScale(ts);
      this.bike.update(this.state === 'walk' ? this.speed * dt : 0, this.ch.clipTime / 0.8);
    } else if (this.state === 'look') this._anim('Look', { once: true, timeScale: LOOK_TS, fade: 0.25 });
    else if (this.state === 'look2') this._anim('Look', { once: true, timeScale: LOOK_TS * 1.8, fade: 0.2 });
    else if (this.state === 'wait' || this.held) this._anim('Idle', { fade: 0.4 });
    else {
      this.ch.play(this.kid ? 'WalkHand' : 'Walk', { fade: 0.3, timeScale: this.speed / this.rigSpeed });
      if (this.kid) this.kid.play('Walk', { fade: 0.3, timeScale: this.speed / this.kidSpeed });
    }
    // ---- placement
    const t = this.len ? this.d / this.len : 0;
    const off = this.keepRight;                              // keep to the right-hand side of the path
    this.x = lerp(this.ax, this.bx, t) + Math.sin(this.dir) * off;
    this.y = lerp(this.ay, this.by, t) - Math.cos(this.dir) * off;
    if (this.kid && this.waitingAtCurb) { this.x -= Math.cos(this.dir) * 0.35; this.y -= Math.sin(this.dir) * 0.35; }   // step back a little from the edge
    const targetH = onRoad(this.x, this.y) ? 0.0 : 0.15;
    this.hh = lerp(this.hh, targetH, Math.min(1, dt * 10));
    this.h = angleLerp(this.h, this.dir, Math.min(1, dt * 6));
    toWorld(this.x, this.y, this.hh, this.obj.position);
    this.obj.rotation.set(0, this.h, 0);
    if (this.kid) {
      const kx = this.x + Math.sin(this.h) * HAND_OFFSET, ky = this.y - Math.cos(this.h) * HAND_OFFSET;
      const kh = lerp(this.kidH ?? 0.15, onRoad(kx, ky) ? 0 : 0.15, Math.min(1, dt * 10)); this.kidH = kh;
      toWorld(kx, ky, kh, this.kid.obj.position); this.kid.obj.rotation.set(0, this.h, 0);
      this.kidObs.x = kx; this.kidObs.y = ky;
    }
  }
}

// School crossing guard (vest + STOP paddle): raises the paddle, steps into the road, holds it up while the children cross.
class CrossingGuard {
  constructor(mgr) {
    this.mgr = mgr; this.active = true;
    const lib = mgr.lib;
    this.ch = mgr.sys.add(lib.create({ name: 'CrossingGuard', rig: 'Adult', variant: 'Adult_WomanScarf', extras: ['Adult_Vest', 'Adult_Paddle'],
      colors: { skin: '#e9b892', shirt: '#ffffff', pants: '#24345e', tights: '#24345e', kippah: '#2f6f6a', shoes: '#2d2d36' } }));
    this.obj = this.ch.obj; mgr.group.add(this.obj);
    this.rigSpeed = lib.walkSpeed('Adult');
    this.curb = [14.5, 4.4]; this.road = [14.5, 0.0];   // road centre: both lanes' drivers see the guard
    this.x = this.curb[0]; this.y = this.curb[1]; this.state = 'curb'; this.idle = 0; this.halfLen = 0.3; this.cool = 0; this.blocked = 0; this.t = 0;
    this.ch.play('Idle', { fade: 0 });
    this.obj.rotation.y = -Math.PI / 2;
  }
  get ready() {
    if (this.state !== 'road') return false;
    for (const v of this.mgr.vehicles.list) {
      if (!v.active) continue;
      const c = Math.abs(Math.cos(v.h)), front = v.x + Math.cos(v.h) * v.halfLen, back = v.x - Math.cos(v.h) * v.halfLen;
      const lo = Math.min(front, back), hi = Math.max(front, back);
      if (Math.abs(v.y) < 3.5 && c > 0.5 && hi > 14.8 && lo < 18.2) return false;            // on the crosswalk
      if (Math.hypot(v.x - 16.5, v.y) < 12 && v.v > 0.4) return false;                      // still moving nearby
    }
    return true;
  }
  canStepOut() {
    if (!this.mgr.zebraClear('school', 9)) return false;
    if (this.cool > 0) return false;
    return !this.mgr.vehicles.list.some((v) => v.active && v.v > 1.0 && v.y < 0 && v.y > -3.6 && Math.cos(v.h) > 0.5 && v.x + v.halfLen > -24 && v.x - v.halfLen < 13);
  }
  get onRoad() { return this.state !== 'curb' && this.state !== 'raise'; }
  update(dt, demand) {
    const sp = 1.45 * dt; this.t += dt;
    if (this.state === 'curb' && demand && this.canStepOut()) { this.state = 'raise'; this.raiseT = 0; this.ch.setOverlay('Paddle', { side: 'R', once: true, fade: 0.2 }); }
    if (this.state === 'raise') { this.raiseT += dt; if (this.raiseT > 0.55) this.state = 'out'; }
    if (this.state === 'out') { this.y -= sp; if (this.y <= this.road[1]) { this.y = this.road[1]; this.state = 'road'; this.idle = 0; } }
    if (this.cool > 0) this.cool -= dt;
    if (this.state === 'road') {
      this.idle = demand ? 0 : this.idle + dt;
      this.blocked = this.ready ? 0 : this.blocked + dt;
      if (this.idle > 2.5) this.state = 'back';
      else if (this.blocked > 6) { this.state = 'back'; this.cool = 8; }   // traffic can't clear: step back, let it flow
    }
    if (this.state === 'back') { this.y += sp; if (this.y >= this.curb[1]) { this.y = this.curb[1]; this.state = 'curb'; this.ch.setOverlay(null, { fade: 0.5 }); } }
    const walking = this.state === 'out' || this.state === 'back';
    if (walking) this.ch.play('Walk', { timeScale: 1.45 / this.rigSpeed, fade: 0.25 });
    else if (this.state === 'curb') {
      // at the curb: idle, now and then checking the traffic
      const cyc = this.t % 9;
      if (cyc < 2.6) this.ch.play('Look', { once: true, fade: 0.3 }); else this.ch.play('Idle', { fade: 0.4 });
    } else this.ch.play('Idle', { fade: 0.3 });
    const hh = this.y > 3.5 ? 0.15 : 0.0;
    toWorld(this.x, this.y, hh, this.obj.position);
    // walking: face the direction of travel; in the road: face the oncoming (eastbound) traffic; at the curb: face the road
    const face = this.state === 'road' ? Math.PI : (this.state === 'back' ? Math.PI / 2 : -Math.PI / 2);
    this.obj.rotation.y = angleLerp(this.obj.rotation.y, face, Math.min(1, dt * 5));
  }
}

export class Pedestrians {
  constructor(scene, chars, lights, vehicles) {
    this.group = new THREE.Group(); this.group.name = 'Pedestrians'; scene.add(this.group);
    this.lib = chars.lib; this.sys = chars.sys; this.lights = lights; this.vehicles = vehicles;
    this.walkers = []; this.cyclists = []; this.serial = 0;
    this.guard = new CrossingGuard(this);
    this.obstacles = []; this._pool = [];
  }
  setCount(peds, cyclists, pairs = 0) {
    const lib = this.lib;
    const want = peds + pairs;
    while (this.walkers.length < want) {
      const n = this.serial++;
      const isPair = this.walkers.filter((w) => w.kid).length < pairs;
      const kid = !isPair && Math.random() < 0.62;
      const look = lib.randomLook(kid ? 'kid' : 'adult');
      if (kid && Math.random() < 0.8) look.extras = ['Kid_Backpack'];
      const opts = { look, speed: kid ? 0.95 + Math.random() * 0.3 : 1.15 + Math.random() * 0.3, keepRight: 0.25 + Math.random() * 0.45, name: `Ped_${look.variant}_${n}` };
      if (isPair) { const c = lib.randomLook('kid'); c.extras = ['Kid_Backpack']; opts.companion = c; opts.speed = 1.0 + Math.random() * 0.15; opts.keepRight = 0.1; }
      this.walkers.push(new Walker(this, PED_GRAPH, opts));
    }
    while (this.walkers.length > want) this.walkers.pop().dispose();
    while (this.cyclists.length < cyclists) {
      const n = this.serial++;
      const look = lib.randomLook(n % 3 === 2 ? 'kid' : 'adult'); look.extras = [look.rig + '_Helmet'];
      if (look.variant.includes('Woman') || look.variant.includes('Girl')) { look.variant = look.rig === 'Kid' ? 'Kid_BoyKippah' : 'Adult_ManKippah'; }
      this.cyclists.push(new Walker(this, BIKE_GRAPH, { look, speed: 4.0 + Math.random(), keepRight: 0.45, cyclist: true, name: `Cyclist_${n}` }));
    }
    while (this.cyclists.length > cyclists) this.cyclists.pop().dispose();
  }
  get count() { return this.walkers.length + this.walkers.filter((w) => w.kid).length + this.cyclists.length + 1; }
  get schoolBusy() { return this.schoolDemand || this.guard.state !== 'curb'; }
  zebraClear(id, radius = 13) {
    const [zx, zy] = ZEBRAS[id];
    for (const v of this.vehicles.list) {
      if (!v.active) continue;
      const dx = zx - v.x, dy = zy - v.y, d = Math.hypot(dx, dy);
      if (d < 7.5) {                                                      // a car is on / right at the crossing
        const fx = v.x + Math.cos(v.h) * v.halfLen, fy = v.y + Math.sin(v.h) * v.halfLen;
        const ahead = (zx - fx) * Math.cos(v.h) + (zy - fy) * Math.sin(v.h);
        if (v.v < 0.3 && ahead > 1.0) continue;                           // ...stopped and waiting before the stripes: fine
        return false;
      }
      if (d < radius && v.v > 0.8 && (dx * Math.cos(v.h) + dy * Math.sin(v.h)) > 0) return false;   // approaching
    }
    return true;
  }
  /** is any vehicle body on the walker's path within `dist` metres ahead? */
  blockedAhead(w, dist) {
    const cx = Math.cos(w.dir), cy = Math.sin(w.dir);
    for (const v of this.vehicles.list) {
      if (!v.active) continue;
      if (Math.hypot(v.x - w.x, v.y - w.y) > dist + v.halfLen + 2) continue;
      const hx = Math.cos(v.h), hy = Math.sin(v.h);
      for (let s = 0.3; s <= dist; s += 0.5) {
        const px = w.x + cx * s - v.x, py = w.y + cy * s - v.y;
        if (Math.abs(px * hx + py * hy) < v.halfLen + 0.3 && Math.abs(-px * hy + py * hx) < 1.25) return true;
      }
    }
    return false;
  }
  mayCross(w, crossing) {
    if (this.blockedAhead(w, w.len)) return false;
    const [kind, id] = crossing.split(':');
    if (kind === 'light') {
      const p = this.lights.ped(id);
      return p.state === 'green' && p.remaining > (w.len / w.speed) * 0.6 + 1.2;   // finishing during the all-red clearance is fine
    }
    if (id === 'school' && this.guard.ready) return true;
    if (id === 'school' && this.guard.state !== 'curb') return false;       // the guard is out: wait for her signal
    return this.zebraClear(id);
  }
  update(dt) {
    let schoolDemand = false;
    this.obstacles.length = 0;
    let k = 0;
    const lead = (w) => {    // a point a few metres ahead of a crossing walker, so drivers anticipate them
      const o = (this._pool[k++] ||= { x: 0, y: 0, halfLen: 0.3 });
      o.x = w.x + Math.cos(w.dir) * 2.6; o.y = w.y + Math.sin(w.dir) * 2.6; return o;
    };
    for (const w of this.walkers) this._u(w, dt);
    for (const w of this.cyclists) this._u(w, dt);
    for (const w of this.walkers) {
      if (w.edge.crossing === 'zebra:school') schoolDemand = true;
      if (w.onCrossing) { this.obstacles.push(w); if (!w.held) this.obstacles.push(lead(w)); if (w.kid) this.obstacles.push(w.kidObs); }
    }
    for (const w of this.cyclists) if (w.onCrossing) this.obstacles.push(w, lead(w));
    // people walking over a zebra: virtual stop points on the lanes still ahead of them, so drivers wait until they are across
    for (const w of this.walkers) {
      if (!w.onCrossing || w.held || !w.edge.crossing.startsWith('zebra')) continue;
      const tw = w.len ? w.d / w.len : 0;
      for (const f of [0.3, 0.72]) {
        if (f < tw - 0.12) continue;          // already passed that lane
        const o = (this._pool[k++] ||= { x: 0, y: 0, halfLen: 0.3 }); o.x = lerp(w.ax, w.bx, f); o.y = lerp(w.ay, w.by, f); this.obstacles.push(o); }
    }
    this.schoolDemand = schoolDemand;
    this.guard.update(dt, schoolDemand);
    if (this.guard.onRoad) this.obstacles.push(this.guard);
  }
  _u(w, dt) { w.update(dt); }
}
