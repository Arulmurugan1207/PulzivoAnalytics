#!/usr/bin/env node
/**
 * Regenerate tz-country.json from IANA tzdb (zone.tab + backward).
 * Usage: curl -sSL https://data.iana.org/time-zones/tzdata-latest.tar.gz | tar xz -C /tmp zone.tab backward version
 *        node scripts/build-tz-country.js /tmp
 */
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '/tmp';
const zones = {};
for (const line of fs.readFileSync(path.join(dir, 'zone.tab'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [cc, , tz] = line.split('\t');
  zones[tz] = cc;
}
const out = { ...zones };
// Links (aliases) such as Asia/Calcutta -> Asia/Kolkata, Europe/Kiev -> Europe/Kyiv.
// Skip non-geographic aliases (UTC, GMT, EST, Etc/*, SystemV/*) — those stay Unknown.
for (const line of fs.readFileSync(path.join(dir, 'backward'), 'utf8').split('\n')) {
  const m = line.match(/^Link\s+(\S+)\s+(\S+)/);
  if (!m) continue;
  const [, target, alias] = m;
  if (out[alias] || !alias.includes('/') || /^(Etc|SystemV)\//.test(alias)) continue;
  if (zones[target]) out[alias] = zones[target];
}
const version = fs.existsSync(path.join(dir, 'version')) ? fs.readFileSync(path.join(dir, 'version'), 'utf8').trim() : 'unknown';
const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
fs.writeFileSync(path.join(__dirname, '..', 'tz-country.json'), JSON.stringify({ tzdb: version, zones: sorted }, null, 1) + '\n');
console.log(`wrote ${Object.keys(sorted).length} zones (tzdb ${version})`);
