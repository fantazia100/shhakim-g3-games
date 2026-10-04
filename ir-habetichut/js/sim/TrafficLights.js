import * as THREE from 'three';
import { toWorld } from '../coords.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Israeli signal sequence: green -> flashing green -> yellow -> red -> red+yellow -> green.
// Group A = east-west (main road), group B = north-south. Pedestrian groups:
//   EW_arm = crosswalks that cross the main road (walk while group B has green)
//   NS_arm = crosswalks that cross the N-S road   (walk while group A has green)
const G = 10, BL = 2.5, Y = 3, AR = 2, RY = 1.5;
const ACTIVE = G + BL + Y;                     // 15.5
export const CYCLE = 2 * (ACTIVE + AR + RY);   // 38 s
const B_START = ACTIVE + AR + RY;              // 19
const PED_GREEN = 11;

function approach(t) {        // t relative to start of this group's green
  if (t < G) return 'green';
  if (t < G + BL) return 'blink';
  if (t < ACTIVE) return 'yellow';
  if (t >= CYCLE - RY) return 'redyellow';
  return 'red';
}

export class TrafficLights {
  constructor(scene) {
    this.t = 2;                // start a little into group A green
    this.scene = scene;
    this.mats = {};
    this.group = new THREE.Group(); this.group.name = 'TrafficLights';
    scene.add(this.group);
    this._buildMaterials();
    this._buildHeads();
  }
  vehicle(group) {
    const t = group === 'A' ? this.t : (this.t - B_START + CYCLE) % CYCLE;
    return approach(t);
  }
  ped(group) {               // returns {state:'green'|'red', remaining}
    const start = group === 'NS_arm' ? 0 : B_START;
    const t = (this.t - start + CYCLE) % CYCLE;
    return t < PED_GREEN ? { state: 'green', remaining: PED_GREEN - t } : { state: 'red', remaining: 0 };
  }
  // may a vehicle that is `dist` metres before the stop line (speed v) proceed?
  mayPass(group, dist, v) {
    const s = this.vehicle(group);
    if (s === 'green' || s === 'blink') return true;
    if (s === 'yellow') return dist < (v * v) / (2 * 4.5) + 0.5;   // too close to stop safely
    return false;
  }
  update(dt) {
    this.t = (this.t + dt) % CYCLE;
    const blinkOn = Math.floor(this.t * 2) % 2 === 0;
    for (const g of ['A', 'B']) {
      const s = this.vehicle(g), m = this.mats[g];
      this._set(m.red, s === 'red' || s === 'redyellow');
      this._set(m.yellow, s === 'yellow' || s === 'redyellow');
      this._set(m.green, s === 'green' || (s === 'blink' && blinkOn));
    }
    for (const g of ['EW_arm', 'NS_arm']) {
      const p = this.ped(g), m = this.mats[g];
      this._set(m.red, p.state === 'red'); this._set(m.green, p.state === 'green');
    }
  }
  _set(m, on) { m.emissiveIntensity = on ? m.userData.on : 0.0; m.color.copy(on ? m.userData.cOn : m.userData.cOff); }
  _lamp(hex) {
    const c = new THREE.Color(hex);
    const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.15), emissive: c, emissiveIntensity: 0, roughness: 0.3 });
    m.userData = { on: 3.2, cOn: c.clone(), cOff: c.clone().multiplyScalar(0.12) };
    return m;
  }
  _buildMaterials() {
    for (const g of ['A', 'B']) this.mats[g] = { red: this._lamp(0xff2010), yellow: this._lamp(0xffb000), green: this._lamp(0x10ff60) };
    for (const g of ['EW_arm', 'NS_arm']) this.mats[g] = { red: this._lamp(0xff2010), green: this._lamp(0x10ff60) };
    this.pole = new THREE.MeshStandardMaterial({ color: 0x7a7d82, roughness: 0.45, metalness: 0.6 });
    this.housing = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5 });
    this.plate = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 });
    this.stripe = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  }
  _vehicleHead(group) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.3, 10), this.pole); pole.position.y = 1.65; g.add(pole);
    // Israeli poles often carry black/white bands near the base
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.25, 10), i % 2 ? this.plate : this.stripe);
      b.position.y = 0.3 + i * 0.25; g.add(b);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.25, 0.6), this.plate); plate.position.set(0.04, 2.9, 0); g.add(plate);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.05, 0.4), this.housing); box.position.set(0.2, 2.9, 0); g.add(box);
    const m = this.mats[group];
    [[m.red, 0.32], [m.yellow, 0], [m.green, -0.32]].forEach(([mat, dz]) => {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), mat);
      lamp.rotation.z = Math.PI / 2; lamp.position.set(0.36, 2.9 + dz, 0); g.add(lamp);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.3), this.housing); visor.position.set(0.44, 2.9 + dz + 0.14, 0); g.add(visor);
    });
    return g;
  }
  _pedHead(group) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.7, 10), this.pole); pole.position.y = 1.35; g.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.36), this.housing); box.position.set(0.16, 2.35, 0); g.add(box);
    const m = this.mats[group];
    const mk = (mat, y, walking) => {
      const sq = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.28), mat); sq.position.set(0.28, y, 0); g.add(sq);
      // tiny pictogram (standing / walking figure) made of dark bars
      const fig = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.17, walking ? 0.09 : 0.05), this.housing);
      fig.position.set(0.3, y - 0.02, 0); if (walking) fig.rotation.x = 0.35; g.add(fig);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.05), this.housing); head.position.set(0.3, y + 0.1, 0); g.add(head);
    };
    mk(m.red, 2.53, false); mk(m.green, 2.17, true);
    return g;
  }
  _place(obj, x, y, dirX, dirY, name) {
    obj.name = name;
    toWorld(x, y, 0.15, obj.position);
    obj.rotation.y = Math.atan2(dirY, dirX);
    this._staging.push(obj);
    const a = new THREE.Object3D(); a.name = name; a.position.copy(obj.position); a.rotation.copy(obj.rotation); this.anchors.push(a);
  }
  // merge all heads by material -> ~14 draw calls instead of ~250
  _merge() {
    const buckets = new Map();
    for (const obj of this._staging) {
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.deleteAttribute('uv');
        if (!buckets.has(o.material)) buckets.set(o.material, []);
        buckets.get(o.material).push(g);
      });
    }
    for (const [mat, geos] of buckets) {
      const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.name = 'TrafficLights_' + (mat.name || 'part');
      this.group.add(m);
    }
    this._staging = [];
  }
  _buildHeads() {
    this._staging = []; this.anchors = [];
    this._place(this._vehicleHead('A'), -7.9, -4.6, -1, 0, 'TL_Veh_Eastbound');
    this._place(this._vehicleHead('A'), 7.9, 4.6, 1, 0, 'TL_Veh_Westbound');
    this._place(this._vehicleHead('B'), 4.6, -7.9, 0, -1, 'TL_Veh_Northbound');
    this._place(this._vehicleHead('B'), -4.6, 7.9, 0, 1, 'TL_Veh_Southbound');
    // far-side repeaters (Israeli junctions usually have signals beyond the junction as well)
    this._place(this._vehicleHead('A'), 8.6, -5.0, -1, 0, 'TL_Veh_Eastbound_Far');
    this._place(this._vehicleHead('A'), -8.6, 5.0, 1, 0, 'TL_Veh_Westbound_Far');
    this._place(this._vehicleHead('B'), 5.0, 8.6, 0, -1, 'TL_Veh_Northbound_Far');
    this._place(this._vehicleHead('B'), -5.0, -8.6, 0, 1, 'TL_Veh_Southbound_Far');
    for (const sx of [-1, 1]) {
      this._place(this._pedHead('EW_arm'), sx * 7.3, 4.0, 0, -1, `TL_Ped_${sx > 0 ? 'E' : 'W'}_N`);
      this._place(this._pedHead('EW_arm'), sx * 7.3, -4.0, 0, 1, `TL_Ped_${sx > 0 ? 'E' : 'W'}_S`);
      this._place(this._pedHead('NS_arm'), 4.0, sx * 7.3, -1, 0, `TL_Ped_${sx > 0 ? 'N' : 'S'}_E`);
      this._place(this._pedHead('NS_arm'), -4.0, sx * 7.3, 1, 0, `TL_Ped_${sx > 0 ? 'N' : 'S'}_W`);
    }
    this._merge();
  }
}
