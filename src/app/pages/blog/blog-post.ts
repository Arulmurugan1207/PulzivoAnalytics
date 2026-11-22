import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import posts from './published-posts.json';
import content from './published-content.json';
import { readingMinutes, relatedPosts } from './schedule';
import { trackConversion } from '../../analytics/conversion';

type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  publishDate?: string;
};

@Component({
  selector: 'app-blog-post',
  imports: [RouterLink],
  template: `
    <article class="blog post">
      <div class="container">
        <a class="back" routerLink="/blog">← All articles</a>
        @if (post) {
          <h1>{{ post.title }}</h1>
          <p class="post-meta">
            <time [attr.datetime]="post.publishDate || post.date">{{ post.date }}</time>
            <span class="reading-time">{{ minutes }} min read</span>
          </p>
          <div class="post-body" [innerHTML]="html"></div>
          @if (related.length) {
            <nav class="post-related" aria-label="Related articles">
              <h2>Related articles</h2>
              <ul>
                @for (item of related; track item.slug) {
                  <li><a [routerLink]="['/blog', item.slug]">{{ item.title }}</a></li>
                }
              </ul>
            </nav>
          }
          <aside class="post-cta">
            <h2>Start free</h2>
            <p>One script tag. No cookies, no personal data collected by default. The free plan includes 10,000 events a month, and you don’t need a credit card.</p>
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
  readonly post = (posts as Post[]).find((p) => p.slug === this.slug);
  readonly html = (content as Record<string, string>)[this.slug] ?? '';
  readonly minutes = readingMinutes(this.html);
  readonly related = relatedPosts(posts as Post[], this.slug, 3);

  trackStart() {
    trackConversion('cta_click', { location: 'blog' });
  }
}
