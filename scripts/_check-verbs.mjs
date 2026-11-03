import yaml from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
  const d = yaml.load(readFileSync(`${dir}/${f}`, 'utf8'));
  for (const [m, ts] of Object.entries(d.forms ?? {})) for (const [t, rows] of Object.entries(ts)) rows.forEach((r, i) => { if (![2, 4].includes(r.length)) console.log(f, m, t, i, JSON.stringify(r)); });
  const walk = (o, p) => { if (Array.isArray(o)) o.forEach((r, i) => { if (Array.isArray(r) && ![2, 4].includes(r.length)) console.log(f, p, i, JSON.stringify(r)); }); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${p}.${k}`); };
  walk(d.extras ?? {}, 'extras');
}
