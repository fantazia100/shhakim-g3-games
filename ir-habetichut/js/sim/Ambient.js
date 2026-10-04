import * as THREE from 'three';
import { toWorld, lerp, clamp, smooth } from '../coords.js';
import { PlayAndChat } from './People.js';

// Ambient life: swaying trees, waving flag, swings / seesaw with kids, playground runners, birds, clouds.
export class Ambient {
  constructor(scene, world, chars) {
    this.scene = scene; this.t = 0;
    this.trees = world.trees.map((o) => ({ o, ph: Math.random() * 6.28, base: o.rotation.clone(), amp: o.name.startsWith('Palm') ? 0.035 : 0.02 }));
    this.anim = world.anim;
    this.group = new THREE.Group(); this.group.name = 'Ambient'; scene.add(this.group);
    this.lib = chars.lib; this.sys = chars.sys;
    this.people = new PlayAndChat(this);
    this.birds = []; this.clouds = [];
  }
  setCounts(flocks, clouds) {
    while (this.birds.length < flocks) this.birds.push(this._flock(this.birds.length));
    while (this.birds.length > flocks) this.group.remove(this.birds.pop().g);
    while (this.clouds.length < clouds) this.clouds.push(this._cloud());
    while (this.clouds.length > clouds) this.group.remove(this.clouds.pop());
  }
  _flock(i) {
    const g = new THREE.Group(); this.group.add(g);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, side: THREE.DoubleSide, roughness: 0.8 });
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0.15, 0, 0, -0.2, 0, 0, -0.05, 0, 0.65], 3));
    wing.computeVertexNormals();
    const birds = [];
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), mat); body.rotation.z = -Math.PI / 2; b.add(body);
      const wl = new THREE.Mesh(wing, mat), wr = new THREE.Mesh(wing, mat);
      wl.rotation.x = 0; wr.rotation.x = Math.PI;
      const pl = new THREE.Group(), pr = new THREE.Group(); pl.add(wl); pr.add(wr);
      b.add(pl, pr);
      b.position.set(-k * 0.9 + Math.random() * 0.4, Math.random() * 0.6, (k % 2 ? 1 : -1) * k * 0.6);
      g.add(b); birds.push({ b, pl, pr, ph: Math.random() * 6 });
    }
    return { g, birds, r: 30 + i * 14, h: 22 + i * 6, w: 0.12 + i * 0.03, ph: i * 2.1, cx: i * 10 - 5, cy: i * -8 };
  }
  _cloud() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.25 });
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + Math.random() * 4, 0), mat);
      s.position.set(i * 5 - n * 2.5, Math.random() * 2, Math.random() * 6 - 3); s.scale.y = 0.55; g.add(s);
    }
    g.position.set(Math.random() * 320 - 160, 55 + Math.random() * 25, Math.random() * 260 - 130);
    g.userData.v = 1.2 + Math.random() * 1.5;
    this.group.add(g);
    return g;
  }
  update(dt) {
    const t = (this.t += dt);
    for (const tr of this.trees) {
      tr.o.rotation.x = tr.base.x + Math.sin(t * 1.3 + tr.ph) * tr.amp;
      tr.o.rotation.z = tr.base.z + Math.cos(t * 1.1 + tr.ph) * tr.amp;
    }
    const a = this.anim;
    if (a.Flag) { a.Flag.rotation.y = Math.sin(t * 2.2) * 0.25 + Math.sin(t * 5.3) * 0.06; }
    if (a.Swing_0) a.Swing_0.rotation.x = Math.sin(t * 2.1) * 0.55;
    if (a.Swing_1) a.Swing_1.rotation.x = Math.sin(t * 2.1 + 1.7) * 0.45;
    if (a.Seesaw) a.Seesaw.rotation.z = Math.sin(t * 1.6) * 0.16;
    this.people.update(dt, t);
    for (const f of this.birds) {
      const ang = f.ph + t * f.w;
      f.g.position.set(f.cx + Math.cos(ang) * f.r, f.h + Math.sin(t * 0.4 + f.ph) * 3, f.cy + Math.sin(ang) * f.r);
      const sg = Math.sign(f.w), vx = -Math.sin(ang) * sg, vz = Math.cos(ang) * sg;
      f.g.rotation.y = Math.atan2(-vz, vx);
      for (const b of f.birds) {
        const flap = Math.sin(t * 9 + b.ph) * 0.7;
        b.pl.rotation.x = flap; b.pr.rotation.x = -flap;
      }
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.v * dt; if (c.position.x > 170) c.position.x = -170;
      if (this.camera) c.visible = c.position.distanceTo(this.camera.position) > 48;   // never fly through a cloud
    }
  }
}
