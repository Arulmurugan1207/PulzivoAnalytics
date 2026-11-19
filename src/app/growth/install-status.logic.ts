/** Pure helpers for the "waiting for your first visit" indicator. */

export interface InstallStatus {
  installed: boolean;
  firstEventAt: string | null;
  lastEventAt: string | null;
  eventsLast24h: number;
}

/** Poll GET /analytics/install-status every 5s for up to 10 minutes. */
export const INSTALL_POLL_MS = 5_000;
export const INSTALL_POLL_MAX_MS = 10 * 60 * 1000;

export type InstallPhase = 'hidden' | 'waiting' | 'paused' | 'received';

export function parseInstallStatus(body: unknown): InstallStatus | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw['installed'] !== 'boolean') return null;
  const events = Number(raw['eventsLast24h']);
  return {
    installed: raw['installed'],
    firstEventAt: typeof raw['firstEventAt'] === 'string' ? raw['firstEventAt'] : null,
    lastEventAt: typeof raw['lastEventAt'] === 'string' ? raw['lastEventAt'] : null,
    eventsLast24h: Number.isFinite(events) ? events : 0,
  };
}

export function installPollContinues(elapsedMs: number, installed: boolean, maxMs = INSTALL_POLL_MAX_MS): boolean {
  return !installed && elapsedMs < maxMs;
}

export function installPhase(status: InstallStatus | null, elapsedMs: number, unavailable: boolean): InstallPhase {
  if (unavailable || !status) return 'hidden';
  if (status.installed) return 'received';
  if (elapsedMs >= INSTALL_POLL_MAX_MS) return 'paused';
  return 'waiting';
}
