/**
 * Signup request body for POST /users/signup.
 *
 * Analytics signup does not require Turnstile. The API defaults to soft mode:
 * a missing token is logged and the account is still created. Send
 * `turnstileToken` only when the optional widget actually produced one.
 * Never send an empty string.
 *
 * A blank `mobileno` is omitted. The API does the same, because storing ""
 * hits a unique index and rejects later signups with a duplicate-key error.
 *
 * `website` is a honeypot. Empty is accepted. This client always sends ""
 * and does not render an input named website, because browsers autofill that
 * name and a non-empty value is rejected.
 */

export const TURNSTILE_SITE_KEY_PLACEHOLDER = 'YOUR_TURNSTILE_SITE_KEY';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export interface SignupRequestBody {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  website: string;
  mobileno?: string;
  referrer?: string;
  turnstileToken?: string;
}

export interface SignupFieldInput {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  mobileno?: string;
  website?: string;
  referrer?: string;
  turnstileToken?: string;
}

/** Matches analytics signup: required, 8–200 characters. Empty is required. */
export function passwordError(password: string): string {
  if (!password) return 'A password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) return 'Password must be at least 8 characters.';
  if (password.length > PASSWORD_MAX_LENGTH) return 'Password is too long.';
  return '';
}

/** One @ and a dot in the domain. Enough to reject blank and "not-an-email" before the API. */
const SIGNUP_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSignupEmail(email: string): boolean {
  const value = email.trim();
  return value.length > 0 && value.length <= 254 && SIGNUP_EMAIL.test(value);
}

/**
 * One name field. The API still wants firstname and lastname, so a single
 * word is sent as both. The header shows that name once.
 */
export function splitPersonName(raw: string): { firstname: string; lastname: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstname: '', lastname: '' };
  const firstname = parts[0].slice(0, 100);
  const rest = parts.length === 1 ? parts[0] : parts.slice(1).join(' ');
  return { firstname, lastname: rest.slice(0, 100) };
}

export function displayPersonName(firstname?: string | null, lastname?: string | null): string {
  const first = (firstname ?? '').trim();
  const last = (lastname ?? '').trim();
  if (!first && !last) return '';
  if (!last || last.toLowerCase() === first.toLowerCase()) return first || last;
  if (!first) return last;
  return `${first} ${last}`;
}

export interface SignupGateInput {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
}

/** Do not POST /users/signup unless name, a real email, and a password are present. */
export function signupReady(fields: SignupGateInput): boolean {
  return fields.firstname.trim().length > 0
    && fields.lastname.trim().length > 0
    && isSignupEmail(fields.email)
    && !passwordError(fields.password);
}

export function signupBlockReason(fields: SignupGateInput): string {
  if (!fields.firstname.trim() || !fields.lastname.trim()) return 'Name is required.';
  if (!fields.email.trim()) return 'Email is required.';
  if (!isSignupEmail(fields.email)) return 'Please enter a valid email address.';
  return passwordError(fields.password);
}

/** True only for a real Cloudflare site key, not the placeholder or a blank. */
export function isTurnstileSiteKeyConfigured(siteKey: string | null | undefined): boolean {
  const key = (siteKey ?? '').trim();
  if (!key) return false;
  if (key === TURNSTILE_SITE_KEY_PLACEHOLDER) return false;
  if (/placeholder/i.test(key)) return false;
  if (/^your[_-]?turnstile/i.test(key)) return false;
  return true;
}

export function buildSignupRequest(
  fields: SignupFieldInput,
  options: { turnstileEnabled: boolean },
): SignupRequestBody {
  const body: SignupRequestBody = {
    firstname: fields.firstname.trim(),
    lastname: fields.lastname.trim(),
    email: fields.email.trim(),
    password: fields.password,
    website: (fields.website ?? '').trim(),
  };
  const mobile = (fields.mobileno ?? '').trim();
  if (mobile) body.mobileno = mobile;
  const referrer = (fields.referrer ?? '').trim();
  if (referrer) body.referrer = referrer.slice(0, 500);
  if (options.turnstileEnabled) {
    const token = (fields.turnstileToken ?? '').trim();
    if (token) body.turnstileToken = token;
  }
  return body;
}

/**
 * Text to show for a failed auth call. Accepts both the normalized
 * `{ message, status }` from AuthService and a raw HttpErrorResponse.
 * Signup failures are `{ message, code }` (EMAIL_EXISTS, RATE_LIMITED,
 * SIGNUP_FAILED, TURNSTILE_*). Show `message`. Older rate-limit bodies used
 * `{ error: "..." }` with no message.
 */
export function readApiError(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const record = err as {
    status?: number;
    message?: string;
    error?: unknown;
  };
  const fromBody = messageFromBody(record.error);
  if (fromBody) return fromBody;
  if (record.status === 0) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  const own = typeof record.message === 'string' ? record.message.trim() : '';
  if (own && !isTransportMessage(own)) return own;
  if (record.status === 429) return 'Too many attempts. Please wait and try again.';
  return fallback;
}

function messageFromBody(body: unknown): string {
  if (typeof body === 'string') {
    const text = body.trim();
    if (!text || text.startsWith('<') || text.startsWith('{') || text.startsWith('[')) return '';
    return text;
  }
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  if (typeof record['message'] === 'string' && record['message'].trim()) return record['message'].trim();
  if (typeof record['error'] === 'string' && record['error'].trim()) return record['error'].trim();
  return '';
}

function isTransportMessage(message: string): boolean {
  return /^Http failure response/i.test(message) || /^Error Code:/i.test(message);
}
