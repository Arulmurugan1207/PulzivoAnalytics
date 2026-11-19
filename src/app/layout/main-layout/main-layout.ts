import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from '../header/header';
import { Footer } from '../footer/footer';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, Header, Footer],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayout {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private isDashboardLike(url: string): boolean {
    return url.startsWith('/dashboard') || url.startsWith('/demo') || url.startsWith('/share/');
  }

  isDashboardRoute = signal(this.isDashboardLike(this.router.url || (typeof window !== 'undefined' ? window.location.pathname : '')));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.isDashboardRoute.set(this.isDashboardLike(event.urlAfterRedirects));
      });
  }

}
