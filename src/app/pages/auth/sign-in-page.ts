import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { readApiError } from '../../auth/signup-payload';
import { launchOfferLine } from '../../growth/launch-offer';
import { ForgotPassword } from '../../components/modals/forgot-password/forgot-password';
import { safeReturnUrl } from '../../auth/session.logic';

@Component({
  selector: 'app-sign-in-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterModule, ForgotPassword],
  templateUrl: './sign-in-page.html',
  styleUrl: './sign-in-page.scss',
})
export class SignInPage implements OnInit {
  @ViewChild('forgotModal') forgotModal?: ForgotPassword;

  loginForm!: FormGroup;
  loading = false;
  errorMessage = '';
  launchOfferLine = launchOfferLine;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false],
    });
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      this.loginForm.patchValue({ email: savedEmail, rememberMe: true });
    }
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'signin_started', { source: 'page' });
    }
    if (this.route.snapshot.queryParamMap.get('forgot') === '1') {
      setTimeout(() => this.forgotModal?.show(this.loginForm.get('email')?.value || ''));
    }
  }

  get emailInvalid(): boolean {
    const c = this.loginForm.get('email');
    return !!(c && c.invalid && c.touched);
  }

  get passwordInvalid(): boolean {
    const c = this.loginForm.get('password');
    return !!(c && c.invalid && c.touched);
  }

  openForgot(event: Event) {
    event.preventDefault();
    this.forgotModal?.show(this.loginForm.get('email')?.value || '');
  }

  closeForgot() {
    this.forgotModal?.hide();
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {}, replaceUrl: true });
  }

  onSubmit() {
    this.errorMessage = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.errorMessage = 'Please enter a valid email and password.';
      return;
    }
    this.loading = true;
    const { rememberMe, ...loginData } = this.loginForm.value;
    if (rememberMe) localStorage.setItem('rememberedEmail', loginData.email);
    else localStorage.removeItem('rememberedEmail');

    this.authService.signin(loginData).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.status === 200) {
          if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
            (window as any).PulzivoAnalytics('event', 'user_sign_in', {
              method: 'email',
              remember_me: rememberMe,
              source: 'page',
            });
          }
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          this.router.navigateByUrl(safeReturnUrl(returnUrl));
        } else {
          this.errorMessage = response.message || 'Sign in failed. Please try again.';
        }
      },
      error: (error) => {
        this.loading = false;
        if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
          (window as any).PulzivoAnalytics('event', 'user_sign_in_failed', {
            method: 'email',
            error_type: error.status === 401 ? 'invalid_credentials' : 'server_error',
            source: 'page',
          });
        }
        this.errorMessage = readApiError(error, 'Sign in failed. Please check your credentials and try again.');
      },
    });
  }
}
