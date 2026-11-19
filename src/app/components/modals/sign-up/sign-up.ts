import { Component, EventEmitter, NgZone, Output, ViewChild, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, AbstractControl, ValidationErrors } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';
import {
  buildSignupRequest,
  isSignupEmail,
  isTurnstileSiteKeyConfigured,
  passwordError,
  readApiError,
  signupBlockReason,
  signupReady,
  splitPersonName,
} from '../../../auth/signup-payload';
import { trackConversion } from '../../../analytics/conversion';
import { readIntentPlan, rememberIntentPlan } from '../../../analytics/intent-plan';
import { TurnstileWidget } from './turnstile-widget';

function passwordRules(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  const message = passwordError(value);
  if (!message) return null;
  if (!value) return { required: true };
  if (value.length < 8) return { minlength: { requiredLength: 8, actualLength: value.length } };
  return { maxlength: { requiredLength: 200, actualLength: value.length } };
}

function trimmedName(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return { required: true };
  if (value.length > 100) return { maxlength: { requiredLength: 100, actualLength: value.length } };
  return null;
}

function emailRules(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) return { required: true };
  if (!isSignupEmail(value)) return { email: true };
  return null;
}

@Component({
  selector: 'app-sign-up',
  imports: [
    ReactiveFormsModule,
    NgClass,
    DialogModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    TurnstileWidget
  ],
  templateUrl: './sign-up.html',
  styleUrl: './sign-up.scss',
})
export class SignUp {
  @Output() close = new EventEmitter<void>();
  @Output() switchToSignIn = new EventEmitter<void>();
  @Output() signUpSuccess = new EventEmitter<any>();

  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private zone = inject(NgZone);

  @ViewChild(TurnstileWidget) private turnstileWidget?: TurnstileWidget;

  readonly turnstileSiteKey = environment.turnstileSiteKey;
  readonly turnstileEnabled = isTurnstileSiteKeyConfigured(environment.turnstileSiteKey);

  visible = false;
  loading = false;
  errorMessage = '';
  turnstileToken = '';
  turnstileError = '';

  form: FormGroup = this.fb.group({
    name:     ['', trimmedName],
    email:    ['', emailRules],
    password: ['', passwordRules],
  });

  get f() { return this.form.controls; }

  /** Submit stays off until name, a valid email, and a password are all present. */
  get canSubmit(): boolean {
    return signupReady(this.gateFields());
  }

  show() {
    this.visible = true;
    this.form.reset({ name: '', email: '', password: '' });
    this.errorMessage = '';
    this.turnstileToken = '';
    this.turnstileError = '';
    const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('plan') : null;
    const plan = rememberIntentPlan(fromUrl) || readIntentPlan();
    trackConversion('signup_start', plan ? { location: 'signup', plan } : { location: 'signup' });
  }

  hide() {
    this.visible = false;
    this.close.emit();
  }

  onSignUp() {
    this.form.markAllAsTouched();
    const fields = this.gateFields();
    if (!signupReady(fields)) {
      this.errorMessage = signupBlockReason(fields);
      return;
    }

    const { firstname, lastname } = splitPersonName(String(this.form.value.name ?? ''));
    const email = String(this.form.value.email ?? '');
    const password = String(this.form.value.password ?? '');
    const payload = buildSignupRequest({
      firstname,
      lastname,
      email,
      password,
      website: '',
      referrer: typeof document !== 'undefined' ? (document.referrer || location.href) : '',
      turnstileToken: this.turnstileToken,
    }, { turnstileEnabled: !!this.turnstileToken.trim() });

    this.loading = true;
    this.errorMessage = '';

    this.authService.signup(payload).subscribe({
      next: (response) => {
        setTimeout(() => this.zone.run(() => this.afterSignupResponse(response)));
      },
      error: (err) => {
        const message = readApiError(err, 'Sign up failed. Please try again.');
        setTimeout(() => this.zone.run(() => {
          this.loading = false;
          this.errorMessage = message;
          this.clearTurnstile();
        }));
      }
    });
  }

  private gateFields() {
    const names = splitPersonName(String(this.form.value.name ?? ''));
    return {
      firstname: names.firstname,
      lastname: names.lastname,
      email: String(this.form.value.email ?? ''),
      password: String(this.form.value.password ?? ''),
    };
  }

  private afterSignupResponse(response: { message?: string; user?: { token?: string; firstname?: string; lastname?: string } } | null) {
    if (!response?.user?.token) {
      this.loading = false;
      this.errorMessage = response?.message || 'Account could not be created. Please try again.';
      this.clearTurnstile();
      return;
    }
    const plan = readIntentPlan();
    trackConversion('signup_complete', plan ? { method: 'email', plan } : { method: 'email' });
    this.loading = false;
    this.signUpSuccess.emit(response.user);
    this.hide();
  }

  private clearTurnstile() {
    this.turnstileToken = '';
    this.turnstileWidget?.reset();
  }

  onTurnstileToken(token: string) {
    this.turnstileToken = token;
    if (token) this.turnstileError = '';
  }

  onTurnstileError(message: string) {
    this.turnstileError = message;
    if (message) this.turnstileToken = '';
  }

  onSwitchToSignIn() {
    this.hide();
    this.switchToSignIn.emit();
  }
}
