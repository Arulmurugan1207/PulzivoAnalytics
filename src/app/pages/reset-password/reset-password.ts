import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    ButtonModule, 
    CardModule, 
    InputTextModule,
    PasswordModule,
    MessageModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  resetForm: FormGroup;
  loading = signal(false);
  token: string | null = null;
  tokenValid = signal(true);
  passwordReset = signal(false);

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private messageService: MessageService
  ) {
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit() {
    // Get token from route params
    this.token = this.route.snapshot.paramMap.get('token');
    
    if (!this.token) {
      this.tokenValid.set(false);
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid Link',
        detail: 'This password reset link is invalid.'
      });
    }
  }

  passwordMatchValidator(group: FormGroup) {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  onSubmit() {
    if (this.resetForm.valid && this.token) {
      this.loading.set(true);
      const password = this.resetForm.get('password')?.value;

      this.authService.resetPasswordWithToken(this.token, password).subscribe({
        next: (response) => {
          this.loading.set(false);
          this.passwordReset.set(true);
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: response.message || 'Password has been reset successfully!'
          });

          // Redirect to home after 3 seconds
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 3000);
        },
        error: (error) => {
          this.loading.set(false);
          this.tokenValid.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.error?.message || 'Password reset token is invalid or has expired.'
          });
        }
      });
    } else {
      Object.keys(this.resetForm.controls).forEach(key => {
        this.resetForm.get(key)?.markAsTouched();
      });
    }
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
