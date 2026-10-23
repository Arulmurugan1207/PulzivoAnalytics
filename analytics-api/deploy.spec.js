const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const sh = fs.readFileSync(path.join(__dirname, 'deploy.sh'), 'utf8');
const yaml = fs.readFileSync(path.join(__dirname, 'cloudrun.yaml'), 'utf8');

test('deploy.sh targets prod service/project/region', () => {
  assert.match(sh, /SERVICE="\$\{SERVICE:-pulzivo-analytics-api\}"/);
  assert.match(sh, /PROJECT="\$\{PROJECT:-node-server-apis\}"/);
  assert.match(sh, /REGION="\$\{REGION:-us-east1\}"/);
});

test('deploy.sh uses prod sizing flags', () => {
  for (const flag of ['--cpu 2', '--memory 1Gi', '--min-instances 1', '--max-instances 5', '--concurrency 80', '--cpu-boost']) {
    assert.ok(sh.includes(`  ${flag}\n`), `missing ${flag}`);
  }
});

test('deploy.sh refuses the SPA service named analytics', () => {
  assert.match(sh, /"\$\{SERVICE\}" == "analytics"/);
  assert.match(sh, /exit 1/);
});

test('cloudrun.yaml matches deploy.sh sizing', () => {
  assert.match(yaml, /minScale: '1'/);
  assert.match(yaml, /maxScale: '5'/);
  assert.match(yaml, /cpu: '2'/);
  assert.match(yaml, /memory: 1Gi/);
  assert.match(yaml, /containerConcurrency: 80/);
  assert.doesNotMatch(yaml, /name: analytics\s*$/m);
});
