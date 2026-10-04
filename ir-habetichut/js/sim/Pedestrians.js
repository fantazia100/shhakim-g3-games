import * as THREE from 'three';
import { PED_NODES, PED_EDGES, BIKE_NODES, BIKE_EDGES, ZEBRAS } from './Network.js';
import { toWorld, onRoad, angleLerp, lerp } from '../coords.js';

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
const KIDS = ['Kid_Red', 'Kid_Blue', 'Kid_Green', 'Kid_Pink'];
const ADULTS = ['Adult_White', 'Adult_Blue', 'Adult_Dark'];

class Walker {
  constructor(mgr, proto, graph, opts) {
    this.mgr = mgr; this.graph = graph;
    this.speed = opts.speed; this.cyclist = !!opts.cyclist; this.halfLen = this.cyclist ? 0.8 : 0.3;
    this.keepRight = opts.keepRight;
    this.obj = proto.clone(true); this.obj.name = opts.name;
    this.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    mgr.group.add(this.obj);
    this.phase = Math.random() * 10; this.hh = 0.15; this.active = true;
    const nodes = graph.walkable;
    // start somewhere along a random non-crossing edge
    for (let k = 0; k < 20; k++) {
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      const e = graph.adj[a].find((x) => !x.crossing);
      if (e) { this._begin(a, e, Math.random()); break; }
    }
  }
  _begin(from, edge, frac = 0) {
    this.from = from; this.edge = edge; this.to = edge.to;
    const [ax, ay] = this.graph.nodes[from], [bx, by] = this.graph.nodes[edge.to];
    this.ax = ax; this.ay = ay; this.bx = bx; this.by = by;
    this.len = Math.hypot(bx - ax, by - ay); this.d = frac * this.len;
    this.dir = Math.atan2(by - ay, bx - ax);
    this.state = 'walk';
    this.h = this.h ?? this.dir;
  }
  _chooseNext() {
    const opts = this.graph.adj[this.to].filter((e) => e.to !== this.from);
    const e = opts.length ? opts[Math.floor(Math.random() * opts.length)] : this.graph.adj[this.to][0];
    const from = this.to;
    this._begin(from, e, 0);
    if (e.crossing) this.state = 'wait';
  }
  get onCrossing() { return !!this.edge.crossing && this.state === 'walk'; }
  update(dt) {
    if (this.state === 'wait') {
      if (this.mgr.mayCross(this, this.edge.crossing)) this.state = 'walk';
    } else {
      this.d += this.speed * dt;
      if (this.d >= this.len) { this.d = this.len; this._chooseNext(); }
    }
    const t = this.len ? this.d / this.len : 0;
    const off = this.keepRight;                              // keep to the right-hand side of the path
    this.x = lerp(this.ax, this.bx, t) + Math.sin(this.dir) * off;
    this.y = lerp(this.ay, this.by, t) - Math.cos(this.dir) * off;
    const targetH = this.cyclist ? (onRoad(this.x, this.y) ? 0.0 : 0.17) : (onRoad(this.x, this.y) ? 0.0 : 0.15);
    this.hh = lerp(this.hh, targetH, Math.min(1, dt * 10));
    this.h = angleLerp(this.h, this.dir, Math.min(1, dt * 6));
    const moving = this.state === 'walk';
    if (moving) this.phase += dt * this.speed * (this.cyclist ? 2 : 6);
    const bob = this.cyclist ? 0 : (moving ? Math.abs(Math.sin(this.phase)) * 0.06 : 0);
    toWorld(this.x, this.y, this.hh + bob, this.obj.position);
    this.obj.rotation.set(0, this.h, moving && !this.cyclist ? Math.sin(this.phase) * 0.06 : 0);
  }
}

// School crossing guard: steps into the road with the stop paddle when children want to cross.
class CrossingGuard {
  constructor(obj, mgr) {
    this.obj = obj; this.mgr = mgr; this.active = !!obj;
    this.curb = [14.5, 4.4]; this.road = [14.5, 0.0];   // road centre: both lanes' drivers see the guard
    this.x = this.curb[0]; this.y = this.curb[1]; this.state = 'curb'; this.idle = 0; this.halfLen = 0.3; this.cool = 0; this.blocked = 0;
  }
  // kids may cross once every nearby car has stopped and none is standing on the stripes
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
  // step out only if no eastbound car is already between the junction and the crossing (it would stop inside the junction)
  canStepOut() {
    if (!this.mgr.zebraClear('school', 9)) return false;
    if (this.cool > 0) return false;
    return !this.mgr.vehicles.list.some((v) => v.active && v.y < 0 && v.y > -3.6 && Math.cos(v.h) > 0.5 && v.x + v.halfLen > -24 && v.x - v.halfLen < 15);
  }
  get onRoad() { return this.state !== 'curb'; }
  update(dt, demand) {
    if (!this.obj) return;
    const sp = 1.6 * dt;
    if (this.state === 'curb' && demand && this.canStepOut()) this.state = 'out';
    if (this.state === 'out') { this.y -= sp; if (this.y <= this.road[1]) { this.y = this.road[1]; this.state = 'road'; this.idle = 0; } }
    if (this.cool > 0) this.cool -= dt;
    if (this.state === 'road') {
      this.idle = demand ? 0 : this.idle + dt;
      this.blocked = this.ready ? 0 : this.blocked + dt;
      if (this.idle > 2.5) this.state = 'back';
      else if (this.blocked > 6) { this.state = 'back'; this.cool = 8; }   // traffic can't clear: step back, let it flow
    }
    if (this.state === 'back') { this.y += sp; if (this.y >= this.curb[1]) { this.y = this.curb[1]; this.state = 'curb'; } }
    const walking = this.state === 'out' || this.state === 'back';
    const hh = this.y > 3.5 ? 0.15 : 0.0;
    toWorld(this.x, this.y, hh + (walking ? Math.abs(Math.sin(performance.now() / 160)) * 0.05 : 0), this.obj.position);
    const face = this.state === 'road' ? Math.PI : (this.state === 'out' ? -Math.PI / 2 : this.state === 'back' ? Math.PI / 2 : -Math.PI / 2);
    this.obj.rotation.y = angleLerp(this.obj.rotation.y, face, Math.min(1, dt * 5));
  }
}

export class Pedestrians {
  constructor(scene, protos, lights, vehicles, guardObj) {
    this.group = new THREE.Group(); this.group.name = 'Pedestrians'; scene.add(this.group);
    this.protos = protos; this.lights = lights; this.vehicles = vehicles;
    this.walkers = []; this.cyclists = []; this.serial = 0;
    this.guard = new CrossingGuard(guardObj, this);
    this.obstacles = []; this._pool = [];
  }
  setCount(peds, cyclists) {
    while (this.walkers.length < peds) {
      const kid = Math.random() < 0.7;
      const kind = kid ? KIDS[this.serial % 4] : ADULTS[this.serial % 3];
      this.walkers.push(new Walker(this, this.protos[kind], PED_GRAPH,
        { speed: (kid ? 1.25 : 1.35) + Math.random() * 0.3, keepRight: 0.2 + Math.random() * 0.5, name: `Ped_${kind}_${this.serial++}` }));
    }
    while (this.walkers.length > peds) this.group.remove(this.walkers.pop().obj);
    while (this.cyclists.length < cyclists) {
      this.cyclists.push(new Walker(this, this.protos.Cyclist, BIKE_GRAPH,
        { speed: 4.0 + Math.random(), keepRight: 0.45, cyclist: true, name: `Cyclist_${this.serial++}` }));
    }
    while (this.cyclists.length > cyclists) this.group.remove(this.cyclists.pop().obj);
  }
  get schoolBusy() { return this.schoolDemand || this.guard.state !== 'curb'; }
  zebraClear(id, radius = 13) {
    const [zx, zy] = ZEBRAS[id];
    for (const v of this.vehicles.list) {
      if (!v.active) continue;
      const dx = zx - v.x, dy = zy - v.y, d = Math.hypot(dx, dy);
      if (d < 7.5) return false;                                          // a car is on / waiting right at the crossing
      if (d < radius && v.v > 0.8 && (dx * Math.cos(v.h) + dy * Math.sin(v.h)) > 0) return false;   // approaching
    }
    return true;
  }
  mayCross(w, crossing) {
    const [kind, id] = crossing.split(':');
    if (kind === 'light') {
      const p = this.lights.ped(id);
      return p.state === 'green' && p.remaining > w.len / w.speed + 0.5;
    }
    if (id === 'school' && this.guard.ready) return true;
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
    for (const w of [...this.walkers, ...this.cyclists]) {
      w.update(dt);
      if (w.edge.crossing === 'zebra:school') schoolDemand = true;
      if (w.onCrossing) { this.obstacles.push(w, lead(w)); }
    }
    this.schoolDemand = schoolDemand;
    this.guard.update(dt, schoolDemand);
    if (this.guard.onRoad) this.obstacles.push(this.guard);
  }
}
