import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildHebrewSigns } from './HebrewSigns.js';

const FLAT = new Set(['Grass', 'Grass_Light', 'Asphalt', 'Paint_White', 'Paint_Yellow', 'BikeLane_Red', 'Sand',
  'Park_Path', 'School_Yard', 'Hills_Olive', 'Sidewalk']);

/**
 * Loads the static city (GLB exported from Blender) and sorts its top-level nodes:
 *   PROTO_*  -> prototypes cloned by the simulation (vehicles, people)
 *   ANCHOR_* -> hazard anchors (empty slots for the per-user hazard layer)
 *   SIGN_*   -> Hebrew sign anchors (canvas textures)
 *   ANIM_*   -> animated props (swings, seesaw, flag, crossing guard)
 *   Tree_* / Palm_* -> swaying trees
 * Everything else is merged by material into a few static draw calls.
 */
export async function loadWorld(scene, url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => onProgress && e.total && onProgress(e.loaded / e.total));
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const world = { root, protos: {}, anchors: {}, signs: [], anim: {}, trees: [], staticGroup: new THREE.Group() };
  world.staticGroup.name = 'City_Static';
  const keep = new THREE.Group(); keep.name = 'City_Dynamic';
  const toMerge = [];
  for (const node of [...root.children]) {
    const n = node.name;
    if (n.startsWith('PROTO_')) { node.position.set(0, 0, 0); node.updateMatrixWorld(true); world.protos[n.slice(6)] = node; root.remove(node); continue; }
    if (n.startsWith('ANCHOR_')) { world.anchors[n] = node; keep.add(node); continue; }
    if (n.startsWith('SIGN_')) { world.signs.push(node); keep.add(node); continue; }
    if (n.startsWith('ANIM_')) { world.anim[n.slice(5)] = node; keep.add(node); continue; }
    if (/^(Tree_|Palm_)/.test(n)) { world.trees.push(node); keep.add(node); continue; }
    toMerge.push(node);
  }
  // ---- merge static meshes per material
  const buckets = new Map();
  for (const node of toMerge) {
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      if (g.index) { /* keep */ } else g.setIndex([...Array(g.attributes.position.count).keys()]);
      const key = o.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] });
      buckets.get(key).geos.push(g);
    });
  }
  for (const { mat, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    const m = new THREE.Mesh(merged, mat);
    m.name = 'Static_' + mat.name;
    m.receiveShadow = true;
    m.castShadow = !FLAT.has(mat.name);
    if (mat.name.startsWith('Window_Glass')) { mat.envMapIntensity = 1.6; mat.roughness = 0.08; }
    world.staticGroup.add(m);
  }
  keep.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(world.staticGroup, keep);
  world.dynamicGroup = keep;
  world.drawStats = { mergedMaterials: buckets.size };
  await buildHebrewSigns(world.signs);
  return world;
}

/** Stylised gradient sky with sun glow (cheap, friendly, predictable on every device). */
function makeSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f86de) }, mid: { value: new THREE.Color(0x8cc8f2) },
      bottom: { value: new THREE.Color(0xdcebf5) }, sunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top, mid, bottom, sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(mid, top, pow(clamp(h, 0.0, 1.0), 0.55));
        c = mix(bottom, c, smoothstep(-0.03, 0.18, h));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.75) * pow(s, 600.0) * 3.0 + vec3(1.0, 0.85, 0.6) * pow(s, 10.0) * 0.22;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.name = 'Sky'; sky.frustumCulled = false; sky.renderOrder = -1;
  return sky;
}

/** Sky, sun, hemisphere light, fog, environment map. */
export function setupLighting(renderer, scene, camera) {
  const el = THREE.MathUtils.degToRad(36), az = THREE.MathUtils.degToRad(-28);   // morning sun, east-south-east (map coords)
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az));
  const sky = makeSky(sunDir);
  scene.add(sky);
  sky.onBeforeRender = (r, sc, cam) => sky.position.copy(cam.position);
  // environment (reflections + ambient fill) from the same sky
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = makeSky(sunDir); envSky.material.uniforms.bottom.value.set(0x8a9a70);
  envScene.add(envSky);
  scene.environment = pm.fromScene(envScene, 0, 0.1, 2000).texture;
  scene.environmentIntensity = 0.6;
  pm.dispose();

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a7a45, 0.85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.position.copy(sunDir).multiplyScalar(120); sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const sc = sun.shadow.camera; sc.left = -72; sc.right = 72; sc.top = 72; sc.bottom = -72; sc.near = 10; sc.far = 300;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.fog = new THREE.Fog(0xdcebf5, 110, 320);
  return { sun, hemi, sky, sunDir };
}
