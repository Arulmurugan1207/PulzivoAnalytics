import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_MAX_LENGTH,
  TURNSTILE_SITE_KEY_PLACEHOLDER,
  buildSignupRequest,
  isTurnstileSiteKeyConfigured,
  passwordError,
  readApiError,
} from './signup-payload.ts';

const person = {
  firstname: ' Ada ',
  lastname: ' Lovelace ',
  email: ' ada@pulzivo.com ',
  password: 'correct horse',
  mobileno: '',
  website: '',
};

test('placeholder and blank site keys do not enable Turnstile', () => {
  assert.equal(isTurnstileSiteKeyConfigured(TURNSTILE_SITE_KEY_PLACEHOLDER), false);
  assert.equal(isTurnstileSiteKeyConfigured(''), false);
  assert.equal(isTurnstileSiteKeyConfigured('   '), false);
  assert.equal(isTurnstileSiteKeyConfigured(null), false);
  assert.equal(isTurnstileSiteKeyConfigured('your-turnstile-site-key'), false);
  assert.equal(isTurnstileSiteKeyConfigured('0x4AAAAAAAexample'), true);
  assert.equal(isTurnstileSiteKeyConfigured('1x00000000000000000000AA'), true);
});

test('signup without Turnstile omits turnstileToken and sends an empty honeypot', () => {
  const body = buildSignupRequest(person, { turnstileEnabled: false });
  assert.deepEqual(body, {
    firstname: 'Ada',
    lastname: 'Lovelace',
    email: 'ada@pulzivo.com',
    password: 'correct horse',
    website: '',
  });
  assert.equal(Object.hasOwn(body, 'mobileno'), false);
  assert.equal(Object.hasOwn(body, 'turnstileToken'), false);
  assert.equal(JSON.parse(JSON.stringify(body)).turnstileToken, undefined);
});

test('a provided token is still omitted when Turnstile is not enabled', () => {
  const body = buildSignupRequest(
    { ...person, turnstileToken: 'stale-token' },
    { turnstileEnabled: false },
  );
  assert.equal(Object.hasOwn(body, 'turnstileToken'), false);
});

test('signup with Turnstile sends the widget token', () => {
  const body = buildSignupRequest(
    { ...person, turnstileToken: '  token-from-widget  ' },
    { turnstileEnabled: true },
  );
  assert.equal(body.turnstileToken, 'token-from-widget');
  assert.equal(body.website, '');
  assert.equal(body.email, 'ada@pulzivo.com');
});

test('an empty Turnstile token is omitted instead of sent as a blank string', () => {
  const body = buildSignupRequest(
    { ...person, turnstileToken: '   ' },
    { turnstileEnabled: true },
  );
  assert.equal(Object.hasOwn(body, 'turnstileToken'), false);
});

test('a real mobile number is sent and a blank one is omitted', () => {
  const withMobile = buildSignupRequest({ ...person, mobileno: ' 555 ' }, { turnstileEnabled: false });
  assert.equal(withMobile.mobileno, '555');
  const blank = buildSignupRequest({ ...person, mobileno: '   ' }, { turnstileEnabled: false });
  assert.equal(Object.hasOwn(blank, 'mobileno'), false);
});

test('referrer is included when the page has one', () => {
  const body = buildSignupRequest(
    { ...person, referrer: ' https://example.com/pricing ' },
    { turnstileEnabled: false },
  );
  assert.equal(body.referrer, 'https://example.com/pricing');
});

test('password length matches the API: 8 to 200 characters', () => {
  assert.equal(passwordError(''), 'A password is required.');
  assert.equal(passwordError('short'), 'Password must be at least 8 characters.');
  assert.equal(passwordError('a'.repeat(8)), '');
  assert.equal(passwordError('a'.repeat(PASSWORD_MAX_LENGTH)), '');
  assert.equal(passwordError('a'.repeat(PASSWORD_MAX_LENGTH + 1)), 'Password is too long.');
});

test('a non-empty honeypot is forwarded for the API to reject', () => {
  const body = buildSignupRequest(
    { ...person, website: ' https://spam.example ' },
    { turnstileEnabled: false },
  );
  assert.equal(body.website, 'https://spam.example');
});

test('API error text is taken from message or error, not the transport string', () => {
  assert.equal(
    readApiError({ status: 409, message: 'Email already exists, kindly use alternate email' }, 'fallback'),
    'Email already exists, kindly use alternate email',
  );
  assert.equal(
    readApiError({
      status: 400,
      message: 'Http failure response for https://api/users/signup: 400 ',
      error: { message: 'Signup verification is required.' },
    }, 'fallback'),
    'Signup verification is required.',
  );
  assert.equal(
    readApiError({
      status: 429,
      message: 'Http failure response for https://api/users/signup: 429 ',
      error: { error: 'Too many authentication attempts, please try again later.' },
    }, 'fallback'),
    'Too many authentication attempts, please try again later.',
  );
  assert.equal(
    readApiError({ status: 0, message: 'Http failure response for https://api/users/signup: 0 Unknown Error' }, 'fallback'),
    'Could not reach the server. Check your connection and try again.',
  );
  assert.equal(readApiError({ status: 500, message: 'Http failure response for x: 500 ' }, 'Sign up failed.'), 'Sign up failed.');
  assert.equal(
    readApiError({
      status: 409,
      message: 'Http failure response for https://api/users/signup: 409 ',
      error: { message: 'Email already exists, kindly use alternate email', code: 'EMAIL_EXISTS' },
    }, 'fallback'),
    'Email already exists, kindly use alternate email',
  );
  assert.equal(
    readApiError({
      status: 400,
      error: { message: 'Password must be at least 8 characters.', code: 'PASSWORD_TOO_SHORT' },
    }, 'fallback'),
    'Password must be at least 8 characters.',
  );
  assert.equal(
    readApiError({
      status: 503,
      error: { message: 'Signup verification is temporarily unavailable.', code: 'TURNSTILE_UNAVAILABLE' },
    }, 'fallback'),
    'Signup verification is temporarily unavailable.',
  );
});
