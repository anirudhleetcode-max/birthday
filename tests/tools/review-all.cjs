#!/usr/bin/env node
// Screenshots every chapter at the phone sizes (or --vps), for reviewing real photos after an
// upload: crops, faces, colour, text over photos. Uses shoot.cjs; needs `npm run serve`.
//   NODE_PATH=$(npm root -g) node tests/tools/review-all.cjs [--out /tmp/review] [--vps 390x844,393x852,412x915] [--scenes tower,hair] [--query draft]
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const OUT = args.out || path.join(require('os').tmpdir(), 'film-review');
const VPS = (args.vps || '390x844,393x852,412x915').split(',');
// when each chapter's photos are on screen (seconds after the chapter starts) + any gesture needed
const PLAN = {
  gate: { at: '4,10' },
  invite: { at: '4,12' },
  prologue: { at: '22,30' },
  tower: { at: '14,30,45' },
  story: { at: '10,22,34,46,58' },
  hair: { at: '10,20,30,40' },
  names: { at: '20,35,50,65' },
  dance: { at: '12,24,36' },
  lanterns: { at: '30,45,60' },
  letter: { at: '14,30', act: '8:click:.lt-seal' },
  cake: { at: '15,40' },
  constellation: { at: '15,30,45,60' },
  birthday: { at: '20,60,100,120' },
  hug: { at: '8,26', act: (w, h) => `12:hold:${Math.round(w / 2)},${Math.round(h / 2)},3500` },
  credits: { at: '10,40' },
};
const scenes = args.scenes ? args.scenes.split(',') : Object.keys(PLAN);
let problems = 0;
for (const vp of VPS) {
  const [w, h] = vp.split('x').map(Number);
  const dir = path.join(OUT, vp);
  fs.mkdirSync(dir, { recursive: true });
  for (const s of scenes) {
    const p = PLAN[s];
    if (!p) continue;
    const act = typeof p.act === 'function' ? p.act(w, h) : p.act;
    const cli = [path.join(__dirname, 'shoot.cjs'), '--scene', s, '--vp', vp, '--at', p.at, '--out', dir];
    if (act) cli.push('--act', act);
    if (args.query) cli.push('--query', args.query);
    const r = spawnSync(process.execPath, cli, { encoding: 'utf8', timeout: 400000 });
    const log = `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter((l) => l && !l.startsWith('shot ')).join('\n');
    const bad = r.status !== 0 || !/no console errors/.test(log);
    if (bad) problems++;
    console.log(`${bad ? '✗' : '✓'} ${vp} ${s}${bad ? `\n  ${log.replace(/\n/g, '\n  ')}` : ''}`);
  }
}
console.log(`\nscreenshots: ${OUT}${problems ? `\n✗ ${problems} chapter run(s) reported problems` : '\n✓ no console errors or overflow'}`);
process.exit(problems ? 1 : 0);
