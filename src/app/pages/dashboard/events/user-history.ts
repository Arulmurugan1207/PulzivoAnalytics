/** Pure grouping for the "all activity for this user" panel (no Angular deps; unit-tested). */
export interface UserHistoryEventLike {
  id: string; event_name: string; timestamp: string; session_id: string | null;
  page?: string | null; user_email?: string | null; email_inferred?: boolean;
}
export interface UserHistorySession<E> { sessionId: string | null; start: string; end: string; events: E[] }
export interface UserHistoryView<E> {
  total: number; sessionCount: number; firstSeen: string | null; lastSeen: string | null;
  email: string | null; emailInferred: boolean; truncated: boolean; sessions: UserHistorySession<E>[];
}

const ts = (e: { timestamp: string }) => { const t = Date.parse(e.timestamp); return Number.isNaN(t) ? 0 : t; };

/** Newest session first; events inside a session newest first. Events without a session each form their own group. */
export function groupUserHistory<E extends UserHistoryEventLike>(events: E[] | null | undefined, limit = 200): UserHistoryView<E> {
  const list = [...(events || [])].sort((a, b) => ts(b) - ts(a));
  const groups: UserHistorySession<E>[] = [];
  const bySession = new Map<string, UserHistorySession<E>>();
  for (const e of list) {
    const sid = e.session_id || null;
    let g = sid ? bySession.get(sid) : undefined;
    if (!g) {
      g = { sessionId: sid, start: e.timestamp, end: e.timestamp, events: [] };
      groups.push(g);
      if (sid) bySession.set(sid, g);
    }
    g.events.push(e);
    if (ts(e) < Date.parse(g.start) || Number.isNaN(Date.parse(g.start))) g.start = e.timestamp;
  }
  const withEmail = list.find((e) => e.user_email && !e.email_inferred) || list.find((e) => e.user_email);
  return {
    total: list.length,
    sessionCount: bySession.size,
    firstSeen: list.length ? list[list.length - 1].timestamp : null,
    lastSeen: list.length ? list[0].timestamp : null,
    email: withEmail?.user_email || null,
    emailInferred: !!withEmail?.email_inferred,
    truncated: list.length >= limit,
    sessions: groups,
  };
}
