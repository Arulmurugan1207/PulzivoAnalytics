import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import posts from './posts.json';

@Component({
  selector: 'app-blog',
  imports: [RouterLink],
  templateUrl: './blog.html',
  styleUrl: './blog.scss',
})
export class Blog {
  readonly posts = posts;
}
