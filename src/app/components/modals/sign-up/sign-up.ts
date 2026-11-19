import { Component, EventEmitter, NgZone, Output, ViewChild, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../../environments/environment';
import { buildSignupRequest, isTurnstileSiteKeyConfigured, passwordError, readApiError } from '../../../auth/signup-payload';
import { TurnstileWidget } from './turnstile-widget';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('password')?.value;
  const cpw = group.get('confirmPassword')?.value;
  return pw && cpw && pw !== cpw ? { passwordsMismatch: true } : null;
}

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

@Component({
  selector: 'app-sign-up',
  imports: [
    ReactiveFormsModule,
    NgClass,
    DialogModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
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
  private formInteracted = false;

  form: FormGroup = this.fb.group({
    firstname:       ['', trimmedName],
    lastname:        ['', trimmedName],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', passwordRules],
    confirmPassword: ['', Validators.required],
    acceptTerms:     [false, Validators.requiredTrue]
  }, { validators: passwordsMatch });

  // Shorthand getters
  get f() { return this.form.controls; }

  get isFormReady(): boolean {
    return this.form.valid;
  }

  get missingFields(): string[] {
    const labels: Record<string, string> = {
      firstname: 'First name',
      lastname: 'Last name',
      email: 'Email',
      password: 'Password (8–200 characters)',
      confirmPassword: 'Confirm password',
      acceptTerms: 'Accept terms'
    };
    const missing: string[] = [];
    Object.keys(labels).forEach(key => {
      if (this.form.get(key)?.invalid) missing.push(labels[key]);
    });
    if (this.form.errors?.['passwordsMismatch']) {
      const idx = missing.indexOf('Confirm password');
      if (idx === -1) missing.push('Passwords must match');
    }
    return missing;
  }

  onTurnstileToken(token: string) {
    this.turnstileToken = token;
    if (token) this.turnstileError = '';
  }

  onTurnstileError(message: string) {
    this.turnstileError = message;
    if (message) this.turnstileToken = '';
  }

  show() {
    this.visible = true;
    this.formInteracted = false;
    this.form.reset({ firstname: '', lastname: '', email: '', password: '', confirmPassword: '', acceptTerms: false });
    this.errorMessage = '';
    this.turnstileToken = '';
    this.turnstileError = '';
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'signup_started', { source: 'modal' });
    }
  }

  hide() {
    if (this.visible && this.formInteracted && !this.loading) {
      if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
        (window as any).PulzivoAnalytics('event', 'signup_abandoned', {
          fields_filled: Object.keys(this.form.controls).filter(k => {
            const v = this.form.get(k)?.value;
            return v && v !== false;
          }).length
        });
      }
    }
    this.visible = false;
    this.close.emit();
  }

  onSignUp() {
    this.formInteracted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
        (window as any).PulzivoAnalytics('event', 'signup_validation_failed', {
          missing_fields: this.missingFields
        });
      }
      return;
    }

    const { firstname, lastname, email, password } = this.form.value;
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

    this.authService.signup(payload).subscribe({
      next: (response) => {
        // Next turn, inside the zone. Applying this during the HTTP callback's
        // change-detection pass throws NG0100, and a raw timeout from outside
        // the zone never redraws the banner.
        setTimeout(() => this.zone.run(() => this.afterSignupResponse(response, firstname, lastname)));
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

  private afterSignupResponse(response: { message?: string; user?: { token?: string; firstname?: string; lastname?: string } } | null, firstname: string, lastname: string) {
    if (!response?.user?.token) {
      this.loading = false;
      this.errorMessage = response?.message || 'Account could not be created. Please try again.';
      this.clearTurnstile();
      return;
    }
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'signup_completed', {
        method: 'email',
        has_name: !!(firstname && lastname)
      });
    }
    this.loading = false;
    this.signUpSuccess.emit(response.user);
    this.hide();
  }

  private clearTurnstile() {
    this.turnstileToken = '';
    this.turnstileWidget?.reset();
  }

  onSwitchToSignIn() {
    this.hide();
    this.switchToSignIn.emit();
  }
}

