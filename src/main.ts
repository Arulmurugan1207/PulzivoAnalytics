import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { preserveLcpHero } from './app/pages/home/preserve-lcp-hero';

preserveLcpHero();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
