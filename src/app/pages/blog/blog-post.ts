import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import posts from './posts.json';
import content from './posts-content.json';
import { trackConversion } from '../../analytics/conversion';

@Component({
  selector: 'app-blog-post',
  imports: [RouterLink],
  template: `
    <article class="blog post">
      <div class="container">
        <a class="back" routerLink="/blog">← All articles</a>
        @if (post) {
          <h1>{{ post.title }}</h1>
          <time [attr.datetime]="post.date">{{ post.date }}</time>
          <div class="post-body" [innerHTML]="html"></div>
          <aside class="post-cta">
            <h2>Start free</h2>
            <p>One script tag. No cookies by default. The free plan includes 10K events a month, and you don’t need a credit card.</p>
            <a routerLink="/signup" (click)="trackStart()">Start free</a>
          </aside>
        }
      </div>
    </article>
  `,
  styleUrl: './blog.scss',
})
export class BlogPost {
  private readonly route = inject(ActivatedRoute);
  private readonly slug: string = this.route.snapshot.data['slug'];
  readonly post = posts.find(p => p.slug === this.slug);
  readonly html = (content as Record<string, string>)[this.slug] ?? '';

  trackStart() {
    trackConversion('cta_click', { location: 'blog' });
  }
}
