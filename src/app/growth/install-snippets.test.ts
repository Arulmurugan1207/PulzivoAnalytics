import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_TABS, installGuide, scriptTag } from './install-snippets.ts';

test('every install tab fills in the caller key and keeps a placeholder otherwise', () => {
  assert.equal(INSTALL_TABS.map((t) => t.id).join(','), 'html,wordpress,shopify,webflow,next,react,angular');
  for (const tab of INSTALL_TABS) {
    const guide = installGuide(tab.id, 'PULZ-PRD-ABC');
    assert.match(guide.code, /PULZ-PRD-ABC/);
    assert.ok(guide.steps.length >= 2);
    assert.match(installGuide(tab.id, '  ').code, /YOUR_API_KEY/);
  }
});

test('platform snippets name the file the person actually edits', () => {
  assert.match(installGuide('wordpress', 'K').steps.join(' '), /header\.php/);
  assert.match(installGuide('wordpress', 'K').steps.join(' '), /No plugin/);
  assert.match(installGuide('shopify', 'K').steps.join(' '), /theme\.liquid/);
  assert.match(installGuide('webflow', 'K').steps.join(' '), /Custom code/);
  assert.match(installGuide('next', 'K').code, /next\/script/);
  assert.match(installGuide('next', 'K').code, /app\/layout|RootLayout/);
  assert.match(scriptTag('K'), /pulzivo-analytics\.min\.js/);
});
