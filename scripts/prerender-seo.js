'use strict';
/**
 * Build-time prerender of SEO <head> tags for every public marketing route.
 *
 * Runs after `ng build`. For each route in src/app/seo/seo-routes.json and each
 * post in src/app/pages/blog/posts.json it writes dist/.../browser/<route>/index.html
 * (a copy of the built index.html with that route's own <title>, description,
 * canonical, robots, og:* and twitter:* tags). Blog posts also get their article
 * body inlined in <app-root> so it is readable without JavaScript; Angular
 * replaces it on bootstrap. Also writes sitemap.xml to the build output.
 *
 * Apache serves these via public/.htaccess (DirectorySlash Off + route/index.html
 * rewrite); everything else (dashboard, auth) falls back to the SPA index.html.
 *
 * Usage: node scripts/prerender-seo.js            (prerender into dist)
 *        node scripts/prerender-seo.js --sitemap  (print sitemap.xml to stdout)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'simpletrack-prime-ng', 'browser');
const ORIGIN = 'https://pulzivo.com';
const SITE = 'Pulzivo Analytics';
const ROBOTS = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

const routes = require('../src/app/seo/seo-routes.json');
const posts = require('../src/app/pages/blog/posts.json');
const postContent = require('../src/app/pages/blog/posts-content.json');

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const canonicalFor = (p) => (p ? `${ORIGIN}/${p}` : `${ORIGIN}/`);

function pages() {
  const list = routes.map((r) => ({
    path: r.path,
    title: r.title,
    description: r.description,
    priority: r.priority,
    changefreq: r.changefreq,
  }));
  for (const p of posts) {
    list.push({
      path: `blog/${p.slug}`,
      title: `${p.title} | ${SITE}`,
      description: p.description,
      priority: '0.6',
      changefreq: 'monthly',
      post: p,
    });
  }
  return list;
}

function buildSitemap(lastmod) {
  const urls = pages()
    .map(
      (p) => `  <url>
    <loc>${canonicalFor(p.path)}</loc>
    <lastmod>${p.post ? p.post.date : lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${key}" content="${esc(value)}">`;
  if (!re.test(html)) throw new Error(`index.html is missing <meta ${attr}="${key}">`);
  return html.replace(re, tag);
}

function staticBody(page) {
  if (page.post) {
    const p = page.post;
    return `<article class="prerendered"><p><a href="/blog">Blog</a></p><h1>${esc(p.title)}</h1><time datetime="${p.date}">${p.date}</time>${postContent[p.slug]}</article>`;
  }
  if (page.path === 'blog') {
    const items = posts
      .map((p) => `<li><a href="/blog/${p.slug}">${esc(p.title)}</a><p>${esc(p.description)}</p></li>`)
      .join('');
    return `<section class="prerendered"><h1>Blog</h1><ul>${items}</ul></section>`;
  }
  return '';
}

function render(template, page) {
  const url = canonicalFor(page.path);
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  html = setMeta(html, 'name', 'description', page.description);
  html = setMeta(html, 'name', 'robots', ROBOTS);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'property', 'og:title', page.title);
  html = setMeta(html, 'property', 'og:description', page.description);
  html = setMeta(html, 'name', 'twitter:url', url);
  html = setMeta(html, 'name', 'twitter:title', page.title);
  html = setMeta(html, 'name', 'twitter:description', page.description);
  html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  if (page.path !== '') {
    // Home-page-only structured data (FAQ) should not repeat on every URL.
    html = html.replace(/\s*<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "FAQPage"[\s\S]*?<\/script>/, '');
  }
  if (page.post) {
    html = setMeta(html, 'property', 'og:type', 'article');
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: page.post.title,
      description: page.post.description,
      datePublished: page.post.date,
      dateModified: page.post.date,
      mainEntityOfPage: url,
      author: { '@id': `${ORIGIN}/#organization` },
      publisher: { '@id': `${ORIGIN}/#organization` },
    };
    html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`);
  }
  const body = staticBody(page);
  if (body) html = html.replace(/<app-root><\/app-root>/, `<app-root>${body}</app-root>`);
  return html;
}

function main() {
  if (process.argv.includes('--sitemap')) {
    process.stdout.write(buildSitemap(process.argv[3] || new Date().toISOString().slice(0, 10)));
    return;
  }
  const indexPath = path.join(OUT, 'index.html');
  const template = fs.readFileSync(indexPath, 'utf8');
  for (const page of pages()) {
    const html = render(template, page);
    const file = page.path ? path.join(OUT, page.path, 'index.html') : indexPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    console.log(`prerendered /${page.path} -> ${path.relative(ROOT, file)}`);
  }
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml')));
}

module.exports = { pages, buildSitemap, render, canonicalFor };
if (require.main === module) main();
