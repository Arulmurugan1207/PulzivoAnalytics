import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    ToastModule
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() backToSignIn = new EventEmitter<void>();
  
  visible = false;
  forgotForm!: FormGroup;
  loading = false;
  emailSent = false;

  constructor(
    private fb: FormBuilder, 
    private authService: AuthService, 
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  show() {
    this.visible = true;
    this.emailSent = false;
    this.forgotForm.reset();
  }

  hide() {
    this.visible = false;
    this.close.emit();
  }

  onSubmit() {
    if (this.forgotForm.valid) {
      this.loading = true;
      const email = this.forgotForm.value.email;

      this.authService.forgotPassword(email).subscribe({
        next: (response) => {
          this.loading = false;
          this.emailSent = true;
          this.messageService.add({
            severity: 'success',
            summary: 'Email Sent',
            detail: 'Password reset instructions have been sent to your email.'
          });
        },
        error: (error) => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.error?.message || 'Failed to send reset email. Please try again.'
          });
        }
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please enter a valid email address.'
      });
      this.forgotForm.get('email')?.markAsTouched();
    }
  }

  onBackToSignIn() {
    this.hide();
    this.backToSignIn.emit();
  }
}
