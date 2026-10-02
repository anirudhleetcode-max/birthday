/** THEME — film grain, particles, the golden ribbon (settings.theme). */
import { state, change } from '../state.js';
import { h, icon, sliderField, switchField } from '../ui.js';
import { openPreview } from '../photos.js';
import { sectionHead, panel } from './common.js';

export function renderTheme() {
  const t = state.site.settings.theme;
  const sample = h('div.theme-sample', { 'aria-hidden': 'true' },
    h('div.ts-sky'), h('div.ts-particles'), h('div.ts-ribbon'), h('div.ts-grain'),
    h('p.ts-title', 'Happy Birthday'));
  const paint = () => {
    sample.style.setProperty('--grain', String(0.18 * t.grain));
    sample.style.setProperty('--particles', String(Math.max(0, Math.min(1.5, t.particles))));
    sample.classList.toggle('no-ribbon', t.ribbon === false);
  };
  paint();
  const grain = sliderField({
    label: 'Film grain', min: 0, max: 1, step: 0.05, value: t.grain, format: (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`), ends: ['Clean', 'Filmic'],
    hint: 'A very subtle moving texture over everything, like real film. 60% is the intended look.',
    oninput: (v) => { change((s) => { s.settings.theme.grain = Math.round(v * 100) / 100; }, { render: false }); paint(); },
  });
  const particles = sliderField({
    label: 'Particles & lantern density', min: 0.3, max: 1.5, step: 0.05, value: t.particles, format: (v) => `${Math.round(v * 100)}%`, ends: ['Calm', 'Lavish'],
    hint: 'Golden dust, sparkles and the number of lanterns. Older phones automatically use less.',
    oninput: (v) => { change((s) => { s.settings.theme.particles = Math.round(v * 100) / 100; }, { render: false }); paint(); },
  });
  const ribbon = switchField({
    label: 'Golden ribbon', checked: t.ribbon !== false,
    hint: 'The film’s signature thread of light (inspired by her long hair) that links chapters and memories. Switch off for a simpler look.',
    onchange: (v) => { change((s) => { s.settings.theme.ribbon = v; }, { render: false }); paint(); },
  });
  return h('div.theme',
    sectionHead('Theme', 'The film’s finish', 'Small touches that apply to the whole film. Preview to feel the difference.'),
    h('div.theme-grid',
      panel('Look & feel', { icon: 'palette' }, grain, particles, ribbon,
        h('button.btn.sm.ghost', { type: 'button', onclick: () => openPreview('lanterns') }, icon('eye'), 'Preview the lanterns')),
      h('figure.theme-figure', sample, h('figcaption', 'A rough impression — the real film is richer.'))));
}
