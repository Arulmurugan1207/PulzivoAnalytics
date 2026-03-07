import { Component, signal, OnInit } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MainLayout } from './layout/main-layout/main-layout';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ButtonModule, MainLayout],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('simpletrack-prime-ng');

  constructor(private authService: AuthService) {}

  ngOnInit() {
    // Check if user is logged in on app load
    const isLoggedIn = this.authService.isAuthenticated();
    console.log('App loaded - User logged in:', isLoggedIn);
    
    if (isLoggedIn) {
      const userData = this.authService.getUserData();
      console.log('User data:', userData);
      // Restore owner tracking flag so the SDK suppresses events for the owner
      // even after a page refresh (flag is in-memory, not persisted)
      this.authService.applyOwnerTracking(userData?.user?.role);
    }
  }
}
