import { Component, EventEmitter, Output, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DividerModule } from 'primeng/divider';
import { CheckboxModule } from 'primeng/checkbox';
import { AuthService } from '../../../services/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const pw = group.get('password')?.value;
  const cpw = group.get('confirmPassword')?.value;
  return pw && cpw && pw !== cpw ? { passwordsMismatch: true } : null;
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
    DividerModule,
    CheckboxModule
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

  visible = false;
  loading = false;
  errorMessage = '';

  form: FormGroup = this.fb.group({
    firstname:       ['', [Validators.required, Validators.minLength(2)]],
    lastname:        ['', [Validators.required, Validators.minLength(2)]],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', [Validators.required, Validators.minLength(8)]],
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
      password: 'Password (min 8 chars)',
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

  show() {
    this.visible = true;
    this.form.reset({ firstname: '', lastname: '', email: '', password: '', confirmPassword: '', acceptTerms: false });
    this.errorMessage = '';
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'signup_started', { source: 'modal' });
    }
  }

  hide() {
    this.visible = false;
    this.close.emit();
  }

  onSignUp() {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { firstname, lastname, email, password } = this.form.value;

    this.loading = true;
    this.errorMessage = '';

    this.authService.signup({ firstname: firstname.trim(), lastname: lastname.trim(), email, mobileno: '', password }).subscribe({
      next: (response) => {
        if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
          (window as any).PulzivoAnalytics('event', 'signup_completed', {
            method: 'email',
            has_name: !!(firstname && lastname)
          });
        }
        this.loading = false;
        this.signUpSuccess.emit(response.user);
        this.hide();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.message || err?.message || 'Sign up failed. Please try again.';
      }
    });
  }

  onSwitchToSignIn() {
    this.hide();
    this.switchToSignIn.emit();
  }
}

