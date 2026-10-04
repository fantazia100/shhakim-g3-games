import { VIEWS, QUALITY } from '../config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(app) {
    this.app = app;
    this.views = $('views');
    for (const [key, v] of Object.entries(VIEWS)) {
      const b = document.createElement('button'); b.textContent = v.label; b.dataset.view = key;
      b.onclick = () => { app.rig.flyTo(key); this.setActive(key); };
      this.views.appendChild(b);
    }
    $('btn-mute').onclick = () => { app.audio.start(); app.audio.setMuted(!app.audio.muted); this.refresh(); };
    $('btn-quality').onclick = () => {
      const keys = Object.keys(QUALITY), i = keys.indexOf(app.qualityKey);
      app.setQuality(keys[(i + 1) % keys.length]); this.refresh();
    };
    $('btn-intro').onclick = () => app.playIntro();
    $('btn-full').onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    };
    $('skip').onclick = () => app.rig.skipIntro();
    // help text (full nikud for young readers): touch vs mouse
    const touch = matchMedia('(pointer: coarse)').matches;
    $('hint').textContent = touch
      ? 'גִּרְרוּ בְּאֶצְבַּע לְסִבּוּב • צִבְטוּ לְהַגְדָּלָה • שְׁתֵּי אֶצְבָּעוֹת לְהַזָּזָה • הַקִּישׁוּ פַּעֲמַיִם כְּדֵי לְהִתְקָרֵב'
      : 'גִּרְרוּ לְסִבּוּב • גַּלְגֶּלֶת לְהַגְדָּלָה • לְחִיצָה יְמָנִית לְהַזָּזָה • לְחִיצָה כְּפוּלָה כְּדֵי לְהִתְקָרֵב';
    this.refresh();
  }
  setActive(key) { [...this.views.children].forEach((b) => b.classList.toggle('active', b.dataset.view === key)); }
  refresh() {
    $('btn-mute').textContent = this.app.audio.muted ? '🔇' : '🔊';
    $('btn-quality').textContent = 'אֵיכוּת: ' + QUALITY[this.app.qualityKey].label;
  }
  progress(p, text) { $('bar-fill').style.width = `${Math.round(p * 100)}%`; if (text) $('load-text').textContent = text; }
  ready(onStart) {
    $('load-text').textContent = 'הָעִיר מוּכָנָה!'; $('bar-fill').style.width = '100%';
    const btn = $('start'); btn.hidden = false; btn.onclick = () => onStart();
  }
  hideLoader() { const l = $('loader'); l.classList.add('fade'); setTimeout(() => (l.hidden = true), 700); }
  introMode(on) {
    $('intro-title').hidden = !on; $('skip').hidden = !on; $('hud').hidden = on;
    if (on) $('intro-title').classList.remove('out');
  }
  introProgress(p) { $('intro-title').classList.toggle('out', p < 0.04 || p > 0.36); }
  showHintOnce() { const h = $('hint'); h.classList.remove('out'); clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.add('out'), 7000); }
  signal(state) {   // main-road (group A) signal mirrored in the HUD
    $('sig-r').classList.toggle('on', state === 'red' || state === 'redyellow');
    $('sig-y').classList.toggle('on', state === 'yellow' || state === 'redyellow');
    $('sig-g').classList.toggle('on', state === 'green' || (state === 'blink' && Math.floor(performance.now() / 250) % 2 === 0));
  }
  devPanel(anchors, onGo) {
    const d = $('dev'); d.hidden = false;
    d.innerHTML = '<b>עוגנים (ANCHORS)</b>';
    for (const a of anchors) {
      const b = document.createElement('button'); b.textContent = `${a.id.replace('ANCHOR_', '')} – ${a.label}`;
      b.onclick = () => onGo(a); d.appendChild(b);
    }
  }
}
