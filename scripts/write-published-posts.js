'use strict';
/**
 * Bake the posts that are live for this build.
 *
 * Angular imports published-posts.json and published-content.json, so a future
 * article is not a route and its HTML is not in the client bundle. Prerender
 * applies the same date filter itself (scripts/prerender-seo.js).
 *
 * Usage: node scripts/write-published-posts.js
 *        PULZIVO_AS_OF=2026-11-27 node scripts/write-published-posts.js
 */
const fs = require('fs');
const path = require('path');
const { loadExportedValues } = require('./angular-static');

const ROOT = path.join(__dirname, '..');
const BLOG = path.join(ROOT, 'src/app/pages/blog');

function publishedBundle(asOf) {
  const schedule = loadExportedValues(path.join(BLOG, 'schedule.ts'));
  const posts = require(path.join(BLOG, 'posts.json'));
  const content = require(path.join(BLOG, 'posts-content.json'));
  const day = asOf || schedule.asOfDate();
  const published = schedule.publishedPosts(posts, day);
  const bodies = {};
  for (const post of published) bodies[post.slug] = content[post.slug] || '';
  return { asOf: day, posts: published, content: bodies };
}

function writePublishedPosts(asOf) {
  const bundle = publishedBundle(asOf);
  fs.writeFileSync(path.join(BLOG, 'published-posts.json'), `${JSON.stringify(bundle.posts, null, 2)}\n`);
  fs.writeFileSync(path.join(BLOG, 'published-content.json'), `${JSON.stringify(bundle.content, null, 2)}\n`);
  console.log(`published ${bundle.posts.length} posts as of ${bundle.asOf}`);
  return bundle;
}

module.exports = { publishedBundle, writePublishedPosts };

if (require.main === module) writePublishedPosts();
