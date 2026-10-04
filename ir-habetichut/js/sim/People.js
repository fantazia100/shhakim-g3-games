import * as THREE from 'three';
import { toWorld, lerp, clamp, angleLerp } from '../coords.js';

// Playground kids (swings, slide, seesaw, running games) and idle townspeople (chatting, waving, sitting on benches).
const SLAB = 0.15, SAND = 0.175;
const ease = (t) => t * t;

export class PlayAndChat {
  constructor(amb) {
    this.amb = amb; this.lib = amb.lib; this.sys = amb.sys; this.group = amb.group; this.anim = amb.anim;
    this.items = []; this.t = 0;
    const lib = this.lib, A = this.anim;
    const make = (kind, over = {}) => {
      const look = lib.randomLook(kind); Object.assign(look, over);
      if (over.colors) look.colors = Object.assign(lib.randomLook(kind).colors, over.colors);
      const ch = this.sys.add(lib.create(look)); return ch;
    };
    this.make = make;
    const kidPelvis = lib.rigs.Kid.m.hipHeight - 0.054, adultPelvis = lib.rigs.Adult.m.hipHeight - 0.094;
    // ---- swings: phase-locked to the swinging seats (legs out at the front, tucked at the back)
    [['Swing_0', 0, 'Kid_Girl'], ['Swing_1', 1.7, 'Kid_BoyKippah']].forEach(([n, ph, variant]) => {
      const seat = A[n]; if (!seat) return;
      const ch = make('kid', { variant }); ch.obj.position.set(0, -1.57 - kidPelvis, 0.04); ch.obj.rotation.y = -Math.PI / 2; seat.add(ch.obj);
      const a = ch.play('Swing', { fade: 0 }); a.timeScale = 0;
      this.items.push({ update: (dt, t) => { const p = (((t * 2.1 + ph - 1.5 * Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); a.time = (p / (2 * Math.PI)) * a.getClip().duration; } });
    });
    // ---- seesaw: two kids sitting at the ends
    if (A.Seesaw) {
      [-1.4, 1.4].forEach((x, i) => {
        const ch = make('kid', { variant: i ? 'Kid_GirlBraids' : 'Kid_Boy' });
        ch.obj.position.set(x, 0.04 - kidPelvis, 0); ch.obj.rotation.y = i ? Math.PI : 0; A.Seesaw.add(ch.obj);
        ch.play('Sit', { fade: 0, randomStart: true });
        this.items.push({ update: (dt, t) => { const up = Math.sin(t * 1.6) * (i ? 1 : -1) > 0.12; ch.setOverlay(up ? 'Wave' : null, { side: 'R', fade: 0.35 }); } });
      });
    }
    // ---- slide loop: run to the ladder, climb, sit, whoosh down, cheer, run back
    this.items.push(new Slider(this, make('kid', { variant: 'Kid_Girl' }), 0, kidPelvis));
    this.items.push(new Slider(this, make('kid', { variant: 'Kid_BoyKippah' }), 4.2, kidPelvis));
    // ---- running games (Run clip synced to speed)
    this.runners = [[28.5, -25.5, 2.3, 0.75], [31.5, -21.5, 1.5, -1.05], [21.2, -30.6, 1.15, 1.3]].map(([cx, cy, r, w], i) => {
      const ch = make('kid', i === 1 ? { variant: 'Kid_GirlBraids' } : {}); this.group.add(ch.obj);
      const sp = Math.abs(r * w); ch.play('Run', { fade: 0, timeScale: sp / lib.runSpeed('Kid'), randomStart: true });
      const it = { ch, update: (dt, t) => { const ang = i * 2 + t * w; toWorld(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, SAND, ch.obj.position); ch.obj.rotation.y = ang + Math.sign(w) * Math.PI / 2; } };
      this.items.push(it); return it;
    });
    // ---- benches
    const sitAt = (ch, x, y, h, heading, pelvis) => { toWorld(x, y, h - pelvis, ch.obj.position); ch.obj.rotation.y = heading; this.group.add(ch.obj); ch.play('Sit', { fade: 0, randomStart: true }); };
    const grandpa = make('adult', { variant: 'Adult_ManKippah', colors: { hair: '#d8d8d8', shirt: '#ffffff', pants: '#2e3a4f' } });
    const grandma = make('adult', { variant: 'Adult_WomanScarf', colors: { shirt: '#d9cdea' } });
    sitAt(grandpa, 16.08, -14.05, SLAB + 0.49, 0.25, adultPelvis);
    sitAt(grandma, 16.08, -14.95, SLAB + 0.49, -0.2, adultPelvis);
    this.items.push({ update: (dt, t) => { const talk = (t % 10) < 5; grandpa.setOverlay(talk ? 'Talk' : null, { side: 'R' }); grandma.setOverlay(!talk ? 'Talk' : null, { side: 'R' }); } });
    const busSitter = make('adult', { variant: 'Adult_Woman' });
    sitAt(busSitter, 31.8, -5.95, SLAB + 0.49, Math.PI / 2, adultPelvis);
    // ---- standing people: kid waving at the bus stop, parents chatting near the kiosk, goodbye wave at the school gate
    const stand = (ch, x, y, heading, clip) => { toWorld(x, y, SLAB, ch.obj.position); ch.obj.rotation.y = heading; this.group.add(ch.obj); ch.play(clip, { fade: 0, randomStart: true }); return ch; };
    const busKid = stand(make('kid', { extras: ['Kid_Backpack'] }), 29.3, -4.45, Math.PI / 2 + 0.3, 'Idle');
    this.items.push({ update: (dt, t) => busKid.play((t % 8) < 3 ? 'Wave' : (t % 8) < 5.5 ? 'Look' : 'Idle', { fade: 0.35, once: (t % 8) >= 3 && (t % 8) < 5.5 }) });
    const c1 = stand(make('adult', { variant: 'Adult_WomanScarf' }), 30.3, 9.7, Math.PI / 2, 'Talk');
    const c2 = stand(make('adult', { variant: 'Adult_ManKippah' }), 30.3, 11.1, -Math.PI / 2, 'Idle');
    this.items.push({ update: (dt, t) => { const k = (t + 1.3) % 9; c1.play(k < 4.5 ? 'Talk' : 'Idle', { fade: 0.5 }); c2.play(k < 4.5 ? 'Idle' : 'Talk', { fade: 0.5 }); } });
    const mom = stand(make('adult', { variant: 'Adult_Woman' }), 12.4, 5.85, Math.PI / 2 - 0.35, 'Wave');
    const kid = stand(make('kid', { variant: 'Kid_GirlBraids', extras: ['Kid_Backpack'] }), 15.0, 10.9, -Math.PI / 2 - 0.4, 'Wave');
    this.items.push({ update: (dt, t) => { const k = t % 7; mom.play(k < 3.5 ? 'Wave' : 'Idle', { fade: 0.4 }); kid.play(k < 4 ? 'Wave' : 'Idle', { fade: 0.4 }); } });
  }
  update(dt, t) { for (const it of this.items) it.update(dt, t); }
}

// one child playing on the slide (map coords: slide at x=18, y=-19; ladder on the west side, ramp going east)
class Slider {
  constructor(pc, ch, delay, pelvis) {
    this.ch = ch; this.pc = pc; this.pelvis = pelvis; this.t = -delay; pc.group.add(ch.obj);
    this.rs = pc.lib.runSpeed('Kid'); this.ws = pc.lib.walkSpeed('Kid');
    this.path = [[22.6, -20.6], [16.9, -20.6], [16.95, -19.0]];
    this.seg = this.path.slice(1).map((p, i) => Math.hypot(p[0] - this.path[i][0], p[1] - this.path[i][1]));
    this.runLen = this.seg.reduce((a, b) => a + b, 0);
    this.phase = 0; this.pt = 0; ch.obj.visible = delay === 0;
    toWorld(...this.path[0], SAND, ch.obj.position); ch.play('Idle', { fade: 0 });
  }
  _go(p) { this.phase = p; this.pt = 0; }
  update(dt) {
    const ch = this.ch, o = ch.obj;
    if (this.t < 0) { this.t += dt; if (this.t >= 0) o.visible = true; else return; }
    this.pt += dt; let h = 0;
    const RUN_V = 2.0, ramp = (x) => 0.85 + (1.95 - (x - 18)) * Math.tan(0.4887) + 0.045 + SLAB;
    switch (this.phase) {
      case 0: {      // run to the ladder
        let d = this.pt * RUN_V, i = 0;
        if (d >= this.runLen) { this._go(1); d = this.runLen; }
        while (i < this.seg.length - 1 && d > this.seg[i]) { d -= this.seg[i]; i++; }
        const a = this.path[i], b = this.path[i + 1], k = clamp(d / this.seg[i], 0, 1);
        toWorld(lerp(a[0], b[0], k), lerp(a[1], b[1], k), SAND, o.position);
        o.rotation.set(0, angleLerp(o.rotation.y, Math.atan2(b[1] - a[1], b[0] - a[0]), Math.min(1, dt * 10)), 0);
        ch.play('Run', { timeScale: RUN_V / this.rs, fade: 0.25 });
        break;
      }
      case 1: {      // climb the ladder
        const k = clamp(this.pt / 1.5, 0, 1);
        toWorld(lerp(16.95, 17.2, k), -19, lerp(SAND, SLAB + 1.65, k), o.position); o.rotation.set(0, angleLerp(o.rotation.y, 0, Math.min(1, dt * 8)), 0);
        ch.play('Walk', { timeScale: 1.1, fade: 0.2 });
        if (k >= 1) this._go(2);
        break;
      }
      case 2: {      // onto the platform
        const k = clamp(this.pt / 0.9, 0, 1);
        toWorld(lerp(17.2, 18.25, k), -19, SLAB + 1.65, o.position);
        ch.play('Walk', { timeScale: (1.05 / 0.9) / this.ws, fade: 0.2 });
        if (k >= 1) this._go(3);
        break;
      }
      case 3: {      // sit at the top
        const k = clamp(this.pt / 0.45, 0, 1);
        toWorld(lerp(18.25, 18.5, k), -19, lerp(SLAB + 1.65, ramp(18.5) - this.pelvis, k), o.position);
        o.rotation.set(0, 0, lerp(0, -0.4887, k));
        ch.play('Slide', { fade: 0.3 });
        if (this.pt > 0.7) this._go(4);
        break;
      }
      case 4: {      // whoosh!
        const k = ease(clamp(this.pt / 1.25, 0, 1)), x = lerp(18.5, 21.25, k);
        toWorld(x, -19, ramp(x) - this.pelvis * Math.cos(0.4887), o.position);
        o.rotation.set(0, 0, -0.4887);
        if (k >= 1) this._go(5);
        break;
      }
      case 5: {      // land, stand up and cheer
        const k = clamp(this.pt / 0.35, 0, 1);
        toWorld(lerp(21.25, 21.9, k), -19, SAND, o.position); o.rotation.set(0, 0, lerp(-0.4887, 0, k));
        ch.play(this.pt < 0.35 ? 'Idle' : 'Wave', { fade: 0.3 });
        if (this.pt > 1.8) this._go(6);
        break;
      }
      case 6: {      // trot back to the start
        const k = clamp(this.pt / 0.6, 0, 1);
        toWorld(lerp(21.9, 22.6, k), lerp(-19, -20.6, k), SAND, o.position);
        o.rotation.set(0, angleLerp(o.rotation.y, Math.atan2(-1.6, 0.7), Math.min(1, dt * 8)), 0);
        ch.play('Run', { timeScale: (1.75 / 0.6) / this.rs, fade: 0.25 });
        if (k >= 1) this._go(0);
        break;
      }
    }
  }
}
