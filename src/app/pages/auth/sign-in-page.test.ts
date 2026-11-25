import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, 'sign-in-page.html'), 'utf8');
const ts = readFileSync(join(dir, 'sign-in-page.ts'), 'utf8');

test('sign-in page has real next-step links with data-click hooks', () => {
  const links: Array<[string, string]> = [
    ['/', 'login-home'],
    ['/signup', 'login-signup'],
    ['/pricing', 'login-pricing'],
    ['/blog/pulzivo-launch-offer', 'login-offer'],
    ['/contact', 'login-contact'],
  ];
  for (const [href, click] of links) {
    assert.match(html, new RegExp(`routerLink="${href}"[^>]*data-click="${click}"|data-click="${click}"[^>]*routerLink="${href}"`));
  }
  assert.match(html, /data-click="login-forgot"/);
  assert.match(html, /data-click="login-submit"/);
  assert.match(html, /Forgot password\?/);
  assert.match(html, /Create a free account/);
});

test('sign-in page keeps launch-offer and free-plan copy honest', () => {
  assert.match(html, /launchOfferLine\(\)/);
  assert.match(html, /\$4\.50, \$14\.50, and \$49\.50 a month/);
  assert.match(html, /10,000 events a month/);
  assert.doesNotMatch(html, /GDPR|CCPA|cookie banner/i);
  assert.doesNotMatch(html, /first 10 paying/i);
  assert.match(ts, /from '\.\.\/\.\.\/growth\/launch-offer'/);
  assert.match(ts, /navigateByUrl\(safeReturnUrl/);
});
