import * as THREE from 'three';

/**
 * HazardLayer - SEPARATE DATA LAYER for road-safety hazards / questions.
 * The environment ships with no hazards. A hazard pack is loaded per user (after login, the user's
 * grade/level decides which pack), and each hazard is attached to a named ANCHOR_* in the city.
 *
 *   const layer = RoadSafetyCity.hazards;
 *   layer.setResolver((user) => `data/hazards/grade-${user.grade}.json`);
 *   await layer.loadForUser({ id: '123', grade: 3, level: 2 });
 *   layer.registerType('kid_between_cars', (hazard, anchor, ctx) => { ...return THREE.Object3D });
 *
 * Pack format: see data/hazards/README.md
 */
export class HazardLayer extends EventTarget {
  constructor(scene, world, ctx = {}) {
    super();
    this.scene = scene; this.world = world; this.ctx = ctx;
    this.anchors = world.anchors;               // { ANCHOR_xx: Object3D }
    this.group = new THREE.Group(); this.group.name = 'HazardLayer'; scene.add(this.group);
    this.types = {}; this.active = []; this.pack = null;
    this.resolver = (user) => `data/hazards/grade-${user.grade ?? 'default'}.json`;
    this.markers = null;
  }
  listAnchors() {
    return Object.entries(this.anchors).map(([id, o]) => ({ id, type: o.userData.anchor_type, label: o.userData.label_he,
      position: o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) }));
  }
  setResolver(fn) { this.resolver = fn; }
  registerType(type, factory) { this.types[type] = factory; }
  async loadForUser(user) {
    const url = this.resolver(user);
    const res = await fetch(url); if (!res.ok) throw new Error(`hazard pack not found: ${url}`);
    return this.load(await res.json(), user);
  }
  load(pack, user = null) {
    this.clear();
    this.pack = pack;
    for (const h of pack.hazards || []) {
      const anchor = this.anchors[h.anchor];
      if (!anchor) { console.warn('[HazardLayer] unknown anchor', h.anchor); continue; }
      const factory = this.types[h.type];
      const holder = new THREE.Group(); holder.name = `Hazard_${h.id}`;
      anchor.getWorldPosition(holder.position); anchor.getWorldQuaternion(holder.quaternion);
      if (factory) { const obj = factory(h, anchor, this.ctx); if (obj) holder.add(obj); }
      this.group.add(holder);
      this.active.push({ def: h, holder });
    }
    this.dispatchEvent(new CustomEvent('loaded', { detail: { pack, user, count: this.active.length } }));
    return this.active.length;
  }
  clear() {
    for (const a of this.active) this.group.remove(a.holder);
    this.active = []; this.pack = null;
  }
  /** developer markers: pulsing rings + labels on every anchor (?dev=1 or key "A") */
  showAnchors(show) {
    if (show && !this.markers) {
      this.markers = new THREE.Group(); this.markers.name = 'AnchorMarkers';
      const ringGeo = new THREE.RingGeometry(1.1, 1.4, 40); ringGeo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff00aa, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });
      for (const [id, o] of Object.entries(this.anchors)) {
        const g = new THREE.Group(); o.getWorldPosition(g.position); g.position.y += 0.05;
        const ring = new THREE.Mesh(ringGeo, mat); ring.renderOrder = 10; g.add(ring);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), mat); arrow.rotation.x = Math.PI; arrow.position.y = 2.6; arrow.renderOrder = 10; g.add(arrow);
        g.add(this._label(id.replace('ANCHOR_', '')));
        this.markers.add(g);
      }
      this.scene.add(this.markers);
    }
    if (this.markers) this.markers.visible = show;
  }
  _label(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(20,0,30,0.8)'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#fff'; g.font = '700 40px Rubik, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); s.scale.set(5, 0.95, 1); s.position.y = 3.6; s.renderOrder = 11;
    return s;
  }
  update(t) { if (this.markers && this.markers.visible) this.markers.children.forEach((g, i) => { g.children[1].position.y = 2.6 + Math.sin(t * 3 + i) * 0.25; }); }
}
