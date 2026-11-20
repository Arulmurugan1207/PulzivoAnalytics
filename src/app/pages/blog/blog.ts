import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import posts from './published-posts.json';
import content from './published-content.json';
import { readingMinutes } from './schedule';

type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  publishDate?: string;
};

@Component({
  selector: 'app-blog',
  imports: [RouterLink],
  templateUrl: './blog.html',
  styleUrl: './blog.scss',
})
export class Blog {
  readonly posts = (posts as Post[]).map((post) => ({
    ...post,
    minutes: readingMinutes((content as Record<string, string>)[post.slug] || ''),
  }));
}
