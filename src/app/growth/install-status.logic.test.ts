import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALL_POLL_MAX_MS, INSTALL_POLL_MS, installPhase, installPollContinues, installStatusOnHttpError, parseInstallStatus,
} from './install-status.logic.ts';

test('parseInstallStatus accepts the contract and rejects anything else', () => {
  assert.deepEqual(parseInstallStatus({
    installed: false, firstEventAt: null, lastEventAt: null, eventsLast24h: 0,
  }), { installed: false, firstEventAt: null, lastEventAt: null, eventsLast24h: 0 });
  assert.equal(parseInstallStatus({
    installed: true, firstEventAt: '2026-01-01T00:00:00.000Z', lastEventAt: '2026-01-02T00:00:00.000Z', eventsLast24h: '3',
  })?.installed, true);
  assert.equal(parseInstallStatus({ installed: 'yes' }), null);
  assert.equal(parseInstallStatus(null), null);
  assert.equal(parseInstallStatus([]), null);
});

test('polling runs every 5s and stops at 10 minutes or the first visit', () => {
  assert.equal(INSTALL_POLL_MS, 5000);
  assert.equal(INSTALL_POLL_MAX_MS, 600000);
  assert.equal(installPollContinues(0, false), true);
  assert.equal(installPollContinues(INSTALL_POLL_MAX_MS - 1, false), true);
  assert.equal(installPollContinues(INSTALL_POLL_MAX_MS, false), false);
  assert.equal(installPollContinues(0, true), false);
});

test('a 404 hides the indicator instead of meaning the site is not installed', () => {
  assert.equal(installStatusOnHttpError(404), 'hide');
  assert.equal(installStatusOnHttpError(501), 'hide');
  assert.equal(installStatusOnHttpError(500), 'retry');
  assert.equal(installStatusOnHttpError(0), 'retry');
  assert.equal(installPhase(null, 0, true), 'hidden');
  assert.notEqual(installPhase({ installed: false, firstEventAt: null, lastEventAt: null, eventsLast24h: 0 }, 0, true), 'waiting');
});

test('phase stays hidden until a real status arrives, then celebrates or waits', () => {
  const waiting = { installed: false, firstEventAt: null, lastEventAt: null, eventsLast24h: 0 };
  const live = { ...waiting, installed: true, firstEventAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(installPhase(null, 0, false), 'hidden');
  assert.equal(installPhase(waiting, 0, true), 'hidden');
  assert.equal(installPhase(waiting, 1000, false), 'waiting');
  assert.equal(installPhase(waiting, INSTALL_POLL_MAX_MS, false), 'paused');
  assert.equal(installPhase(live, INSTALL_POLL_MAX_MS, false), 'received');
});
