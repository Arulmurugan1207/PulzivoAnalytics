import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DividerModule } from 'primeng/divider';
import { CheckboxModule } from 'primeng/checkbox';

@Component({
  selector: 'app-sign-up',
  imports: [
    FormsModule,
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
  
  visible = false;
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  acceptTerms = false;
  loading = false;

  show() {
    this.visible = true;
    this.name = '';
    this.email = '';
    this.password = '';
    this.confirmPassword = '';
    this.acceptTerms = false;
    // Funnel step 1: user opened the sign-up modal (high intent)
    if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
      (window as any).PulzivoAnalytics('event', 'signup_started', { source: 'modal' });
    }
  }

  hide() {
    this.visible = false;
    this.close.emit();
  }

  onSignUp() {
    if (!this.name || !this.email || !this.password || !this.acceptTerms) {
      return;
    }

    if (this.password !== this.confirmPassword) {
      return;
    }

    this.loading = true;
    
    // Simulate API call
    setTimeout(() => {
      // Funnel step 2: user completed sign-up form
      if (typeof (window as any).PulzivoAnalytics !== 'undefined') {
        (window as any).PulzivoAnalytics('event', 'signup_completed', {
          method: 'email',
          has_name: !!this.name
        });
      }
      
      this.loading = false;
      this.signUpSuccess.emit({ name: this.name, email: this.email });
      this.hide();
    }, 1000);
  }

  onSwitchToSignIn() {
    this.hide();
    this.switchToSignIn.emit();
  }
}

