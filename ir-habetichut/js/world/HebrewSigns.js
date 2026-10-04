import * as THREE from 'three';

// Hebrew texts for SIGN_* anchors exported from Blender (key -> text / colours).
const SHOP = {
  grocery: ['מכולת השכונה', '#1f7a3a'], falafel: ['פלאפל הגיבורים', '#c2410c'], barber: ['מספרה', '#334155'],
  pizza: ['פיצה', '#b91c1c'], bakery: ['מאפייה', '#92400e'], pharmacy: ['בית מרקחת', '#047857'],
  toys: ['צעצועים', '#7c3aed'], books: ['ספרים', '#1d4ed8'], cafe: ['קפה', '#6b4f3a'], shoes: ['נעליים', '#0f766e'],
  kiosk: ['קיוסק', '#e11d48'],
};
const STREETS = { herzl: 'רחוב הרצל', bengurion: "שד' בן גוריון", hazayit: 'רחוב הזית', hagefen: 'רחוב הגפן' };

function makeTexture(text, bg, fg, w, h, opts = {}) {
  const W = 1024, H = Math.max(96, Math.round((W * h) / w));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = H * 0.08; g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H * 0.12 > 0 ? H - H * 0.12 : H); }
  g.fillStyle = fg; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = H * 0.62;
  g.font = `700 ${size}px Rubik, "Noto Sans Hebrew", Arial, sans-serif`;
  while (g.measureText(text).width > W * 0.9 && size > 10) { size *= 0.92; g.font = `700 ${size}px Rubik, Arial, sans-serif`; }
  g.fillText(text, W / 2, H / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

export async function buildHebrewSigns(signNodes) {
  try { await document.fonts.load('700 64px Rubik'); } catch (e) { /* fallback font */ }
  for (const node of signNodes) {
    const ex = node.userData || {};
    const kind = ex.sign_kind || 'shop', key = ex.sign_key || node.name.replace('SIGN_', '');
    const w = ex.w || 2, h = ex.h || 0.6;
    let text, bg, fg = '#ffffff', both = false, border = null;
    if (kind === 'shop') { [text, bg] = SHOP[key] || [key, '#444']; }
    else if (kind === 'school') { text = 'בית ספר יסודי "הדקל"'; bg = '#1559b5'; border = '#ffd23f'; }
    else if (kind === 'bus') { text = 'תחנת אוטובוס'; bg = '#ffffff'; fg = '#0b3b8c'; }
    else if (kind.startsWith('street:')) { text = STREETS[kind.split(':')[1]] || ''; bg = '#0d3f8f'; both = true; border = '#ffffff'; }
    const tex = makeTexture(text, bg, fg, w, h, { border });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 });
    const geo = new THREE.PlaneGeometry(w * 0.97, h * 0.9);
    const front = new THREE.Mesh(geo, mat); front.rotation.y = Math.PI / 2; front.position.x = 0.03; front.name = node.name + '_Face';
    node.add(front);
    if (both) { const back = new THREE.Mesh(geo, mat); back.rotation.y = -Math.PI / 2; back.position.x = -0.06; node.add(back); }
  }
}
