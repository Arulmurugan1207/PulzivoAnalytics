import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

const APP_NAME = 'Pulzivo Analytics';
const SITE_ORIGIN = 'https://pulzivo.com';
const DEFAULT_ROBOTS = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

/**
 * Sets the document title plus per-route SEO tags (description, robots,
 * canonical, og:*, twitter:*) from route `data` ({ description, robots }).
 * Child routes inherit `robots` from parents (e.g. /dashboard/** is noindex).
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly doc: Document,
  ) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const routeTitle = this.buildTitle(snapshot);
    let fullTitle = APP_NAME;
    if (routeTitle) {
      fullTitle = routeTitle.includes(APP_NAME) ? routeTitle : `${routeTitle} | ${APP_NAME}`;
    }
    this.title.setTitle(fullTitle);

    const data: { description?: string; robots?: string } = {};
    let route: ActivatedRouteSnapshot | null = snapshot.root;
    while (route) {
      Object.assign(data, route.data);
      route = route.firstChild;
    }

    const path = snapshot.url.split(/[?#]/)[0] || '/';
    const canonical = SITE_ORIGIN + (path === '/' ? '/' : path.replace(/\/+$/, ''));
    const robots = data.robots ?? DEFAULT_ROBOTS;

    this.meta.updateTag({ name: 'robots', content: robots });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.meta.updateTag({ name: 'twitter:url', content: canonical });
    if (data.description) {
      this.meta.updateTag({ name: 'description', content: data.description });
      this.meta.updateTag({ property: 'og:description', content: data.description });
      this.meta.updateTag({ name: 'twitter:description', content: data.description });
    }

    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', canonical);
  }
}
