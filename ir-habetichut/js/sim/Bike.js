import * as THREE from 'three';

// Simple low-poly bicycle (front = +X) with spinning wheels and a crank that turns with the rider's Pedal clip.
let shared = null;
function mats() {
  if (shared) return shared;
  shared = {
    frame: new THREE.MeshStandardMaterial({ color: 0xe0413a, roughness: 0.45, metalness: 0.2 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.7 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7 }),
    wheel: new THREE.TorusGeometry(0.33, 0.035, 6, 20),
    spoke: new THREE.BoxGeometry(0.62, 0.012, 0.012),
    tube: new THREE.CylinderGeometry(0.022, 0.022, 1, 6),
  };
  return shared;
}
function tube(g, M, a, b, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(M.tube, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.scale.set(1, A.distanceTo(B), 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.add(m); m.castShadow = true;
  return m;
}
export function makeBike(scale = 1) {
  const M = mats(), group = new THREE.Group(), inner = new THREE.Group(); inner.scale.setScalar(scale); group.add(inner);
  const wheels = [];
  for (const x of [-0.53, 0.53]) {
    const w = new THREE.Group(); w.position.set(x, 0.36, 0);
    const t = new THREE.Mesh(M.wheel, M.tire); t.castShadow = true; w.add(t);
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(M.spoke, M.metal); s.rotation.z = (k * Math.PI) / 3; w.add(s); }
    inner.add(w); wheels.push(w);
  }
  const crankC = [0.02, 0.33, 0], seatP = [-0.24, 0.86, 0], head = [0.4, 0.86, 0];
  tube(inner, M, [-0.53, 0.36, 0.05], crankC, M.frame); tube(inner, M, [-0.53, 0.36, -0.05], crankC, M.frame);
  tube(inner, M, crankC, [-0.22, 0.8, 0], M.frame);              // seat tube
  tube(inner, M, [-0.22, 0.78, 0], [0.38, 0.8, 0], M.frame);      // top tube
  tube(inner, M, crankC, [0.38, 0.76, 0], M.frame);               // down tube
  tube(inner, M, [-0.53, 0.36, 0], [-0.22, 0.78, 0], M.frame);     // seat stay
  tube(inner, M, [0.53, 0.36, 0], head, M.frame);                  // fork
  tube(inner, M, head, [0.36, 1.02, 0], M.metal);                  // stem
  tube(inner, M, [0.36, 1.02, -0.26], [0.36, 1.02, 0.26], M.metal);  // handlebar
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.13), M.seat); seat.position.set(...seatP); inner.add(seat);
  const crank = new THREE.Group(); crank.position.set(...crankC); inner.add(crank);
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(M.tube, M.metal); arm.scale.set(1, 0.17, 1); arm.position.set(0, s * 0.085, s * 0.07); crank.add(arm);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.08), M.seat); ped.position.set(0, s * 0.17, s * 0.1); crank.add(ped);
  }
  const R = 0.36 * scale;
  return {
    group, seat: new THREE.Vector3(seatP[0] * scale, (seatP[1] + 0.03) * scale, 0),
    crankPerMetre: 1 / (2 * Math.PI * R * 2.0),           // one crank turn per two wheel turns
    update(dist, crankRevs) {
      for (const w of wheels) w.rotation.z -= dist / R;
      crank.rotation.z = -crankRevs * Math.PI * 2 + 0.3;
      for (const p of crank.children) if (p.geometry.type === 'BoxGeometry') p.rotation.z = -crank.rotation.z;
    },
  };
}
