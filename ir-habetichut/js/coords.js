import * as THREE from 'three';
// map (Blender) coords -> three.js: (x, y, h) -> (x, h, -y)
export const toWorld = (x, y, h = 0, out = new THREE.Vector3()) => out.set(x, h, -y);
// map heading (radians, CCW from +X) -> three.js rotation.y (identical because Blender Z-up -> three Y-up)
export const headingToRotY = (h) => h;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const smooth = (t) => t * t * (3 - 2 * t);
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
// is (x,y) on asphalt (used for pedestrian height)
export function onRoad(x, y) {
  if (Math.abs(y) < 3.5 || Math.abs(x) < 3.5) return true;
  if (y > 0 && x > 21 && x < 27) return true;
  if (y < 0 && x > -27 && x < -21) return true;
  return false;
}
