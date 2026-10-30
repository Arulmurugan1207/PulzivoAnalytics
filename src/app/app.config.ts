import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy } from '@angular/router';
import { routes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeuix/themes/lara';
import { MessageService } from 'primeng/api';
import { authInterceptor } from './interceptors/auth.interceptor';
import { analyticsCacheInterceptor } from './services/analytics-request-cache';
import { AppTitleStrategy } from './services/title.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Lara
      },
      pt: {
        tooltip: {
          root: {
            'data-pc-section': 'root'
          }
        }
      },
      // Global PrimeNG configuration
      ripple: true,
      zIndex: {
        modal: 1100,
        overlay: 1000,
        menu: 1000,
        tooltip: 1100
      }
    }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, analyticsCacheInterceptor])),
    MessageService,
    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ]
};
