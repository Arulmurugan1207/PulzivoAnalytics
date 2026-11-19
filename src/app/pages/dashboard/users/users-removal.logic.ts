/**
 * Users Management remove / restore / delete copy.
 * Wording follows Table Tennis Tube admin (user-management.ts):
 * Remove, Restore, and "Delete from database", with a typed confirm on
 * permanent delete. Blank accounts are shown as "(no name)" and confirm
 * with DELETE.
 */

export type ConfirmKind = 'soft' | 'restore' | 'hard';

export interface NameFields {
  firstname?: string | null;
  lastname?: string | null;
  email?: string | null;
  role?: string | null;
  _id?: string | null;
}

export function displayName(user: NameFields | null | undefined): string {
  const name = `${user?.firstname || ''} ${user?.lastname || ''}`.replace(/\s+/g, ' ').trim();
  return name || '(no name)';
}

export function displayInitials(user: NameFields | null | undefined): string {
  const first = String(user?.firstname || '').trim();
  const last = String(user?.lastname || '').trim();
  const letters = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  return letters || '?';
}

export function hardDeletePhrase(user: NameFields | null | undefined): string {
  const email = String(user?.email || '').trim();
  return email || 'DELETE';
}

export function hardDeleteMatches(user: NameFields | null | undefined, typed: string): boolean {
  const expected = hardDeletePhrase(user);
  const value = String(typed || '').trim();
  if (expected === 'DELETE') return value === 'DELETE';
  return value.toLowerCase() === expected.toLowerCase();
}

export function hardDeleteHint(user: NameFields | null | undefined): string {
  const email = String(user?.email || '').trim();
  if (!email) return 'Type DELETE to confirm. This account has no email.';
  return `Type ${email} to confirm.`;
}

export function removalDialog(kind: ConfirmKind, user: NameFields | null | undefined): {
  title: string;
  body: string;
  confirm: string;
} {
  const name = displayName(user);
  if (kind === 'hard') {
    return {
      title: 'Delete from database',
      body: `Permanently delete ${name} from the database? This cannot be undone.`,
      confirm: 'Delete permanently',
    };
  }
  if (kind === 'restore') {
    return {
      title: 'Restore user',
      body: `Restore ${name} so they can sign in again?`,
      confirm: 'Restore',
    };
  }
  return {
    title: 'Remove user',
    body: `Remove ${name}? They will not be able to sign in. You can restore them from the Removed tab, or delete them from the database there.`,
    confirm: 'Remove',
  };
}

/** Owners and the signed-in account cannot be removed or permanently deleted. */
export function removalBlocked(
  user: NameFields | null | undefined,
  currentUserId: string | null | undefined,
  ownerEmail: string,
): boolean {
  if (!user) return true;
  if (String(user.role || '').toLowerCase() === 'owner') return true;
  const email = String(user.email || '').trim().toLowerCase();
  if (email && email === String(ownerEmail || '').trim().toLowerCase()) return true;
  if (currentUserId && user._id && String(user._id) === String(currentUserId)) return true;
  return false;
}
