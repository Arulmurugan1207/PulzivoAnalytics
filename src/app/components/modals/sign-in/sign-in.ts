import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DividerModule } from 'primeng/divider';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-sign-in',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    DividerModule,
    CheckboxModule,
    ToastModule
  ],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
})
export class SignIn implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() switchToSignUp = new EventEmitter<void>();
  @Output() switchToForgotPassword = new EventEmitter<void>();
  @Output() signInSuccess = new EventEmitter<any>();
  
  visible = false;
  loginForm!: FormGroup;
  loading = false;

  constructor(private fb: FormBuilder, private authService: AuthService, private messageService: MessageService) {}

  ngOnInit() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      rememberMe: [false]
    });
    this.loadSavedCredentials();
  }

  show() {
    this.visible = true;
    if (!this.loginForm.get('rememberMe')?.value) {
      this.loginForm.patchValue({
        email: '',
        password: ''
      });
    }
    // Track sign-in intent
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'signin_started', { source: 'modal' });
    }
  }

  hide() {
    this.visible = false;
    this.close.emit();
  }

  onSubmit() {
    if (this.loginForm.valid) {
      this.loading = true;

      const { rememberMe, ...loginData } = this.loginForm.value;

      // Save credentials if remember me is checked
      if (rememberMe) {
        this.saveCredentials(loginData.email);
      } else {
        this.clearSavedCredentials();
      }

      this.authService.signin(loginData).subscribe({
        next: (response) => {
          this.loading = false;
          if (response.status === 200) {
            // Track successful sign-in event
            if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
              (window as any).PulzivoAnalytics('event', 'user_sign_in', {
                method: 'email',
                remember_me: rememberMe,
                timestamp: new Date().toISOString()
              });
            }
            
            this.signInSuccess.emit(response.user);
            this.hide();
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Sign In Failed',
              detail: response.message || 'Sign in failed. Please try again.'
            });
          }
        },
        error: (error) => {
          this.loading = false;
          
          // Track failed sign-in attempt
          if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
            (window as any).PulzivoAnalytics('event', 'user_sign_in_failed', {
              method: 'email',
              error_type: error.status === 401 ? 'invalid_credentials' : 'server_error',
              timestamp: new Date().toISOString()
            });
          }
          
          this.messageService.add({
            severity: 'error',
            summary: 'Sign In Error',
            detail: error.error?.message || 'Sign in failed. Please check your credentials and try again.'
          });
        }
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please enter valid email and password.'
      });
      // Mark all fields as touched to show validation errors
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.get(key)?.markAsTouched();
      });
    }
  }

  onSwitchToSignUp() {
    this.hide();
    this.switchToSignUp.emit();
  }

  onSwitchToForgotPassword() {
    this.hide();
    this.switchToForgotPassword.emit();
  }

  private loadSavedCredentials() {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      this.loginForm.patchValue({
        email: savedEmail,
        rememberMe: true
      });
    }
  }

  private saveCredentials(email: string) {
    localStorage.setItem('rememberedEmail', email);
  }

  private clearSavedCredentials() {
    localStorage.removeItem('rememberedEmail');
  }
}

