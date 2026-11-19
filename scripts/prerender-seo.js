'use strict';
/**
 * Build-time prerender of SEO <head> tags for every public marketing route.
 *
 * Runs after `ng build`. For each route in src/app/seo/seo-routes.json and each
 * post in src/app/pages/blog/posts.json it writes dist/.../browser/<route>/index.html
 * (a copy of the built index.html with that route's own <title>, description,
 * canonical, robots, og:* and twitter:* tags). Every public route also gets
 * visible body HTML inlined in <app-root> (the page template expanded against
 * the same data the Angular page uses, or the article body for a post) so it
 * is readable without JavaScript. Angular clears <app-root> on bootstrap, so
 * the static markup is not left beside the live view. sitemap.xml in the build
 * output comes from buildSitemap() — post date for articles, build date for pages.
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
const { renderMarketingPage, pageScope } = require('./angular-static');

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

// Header links are the live navItems, so the prerendered main nav cannot drift
// from the Angular header. Footer links are the real <a routerLink> / href
// values in footer.html, including Docs and the Compare group.
function headerNavItems() {
  const src = fs.readFileSync(path.join(ROOT, 'src/app/layout/header/header.ts'), 'utf8');
  const block = src.match(/navItems:\s*NavItem\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (!block) throw new Error('header.ts is missing navItems');
  const items = [...block[1].matchAll(/\{\s*label:\s*'([^']+)',\s*path:\s*'([^']+)'\s*\}/g)];
  if (!items.length) throw new Error('header.ts navItems did not parse');
  return items.map((match) => [match[2], match[1]]);
}

function footerNavs() {
  const src = fs.readFileSync(path.join(ROOT, 'src/app/layout/footer/footer.html'), 'utf8');
  const navs = [...src.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)];
  if (!navs.length) throw new Error('footer.html is missing a nav');
  return navs.map((nav) => {
    const label = (nav[1].match(/aria-label="([^"]*)"/) || [])[1] || 'Footer';
    const group = (nav[2].match(/footer-group-label">([^<]+)/) || [])[1];
    const links = [...nav[2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((anchor) => {
      const href = (anchor[1].match(/\brouterLink="([^"]+)"/) || anchor[1].match(/\bhref="([^"]+)"/) || [])[1];
      if (!href) return '';
      const text = anchor[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(href)}"${external}>${esc(text)}</a>`;
    }).filter(Boolean);
    const prefix = group ? `<span class="footer-group-label">${esc(group.trim())}</span> ` : '';
    return `<nav aria-label="${esc(label)}">${prefix}${links.join(' ')}</nav>`;
  });
}

function staticHeader() {
  const links = headerNavItems().map(([href, label]) => `<a href="${esc(href)}">${esc(label)}</a>`).join(' ');
  return `<header class="site-header"><a href="/">Pulzivo Analytics</a><nav aria-label="Primary navigation">${links}</nav></header>`;
}

function staticFooter() {
  return `<footer class="site-footer">${footerNavs().join('')}</footer>`;
}

// Plain <a href> links present in the raw HTML of every prerendered page so
// crawlers discover the blog without running JS. This nav stays visually
// hidden. The visible header and footer above it are what carry /docs.
// Angular replaces <app-root> contents on bootstrap.
function siteNav() {
  const links = [
    ...headerNavItems(),
    ['/features', 'Features'],
    ['/use-cases', 'Use cases'],
    ...posts.map((p) => [`/blog/${p.slug}`, p.title]),
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/ga4-alternative', 'GA4 alternative'],
    ['/cookieless-analytics', 'Cookieless analytics'],
    ['/compare/plausible', 'Pulzivo vs Plausible'],
    ['/compare/fathom', 'Pulzivo vs Fathom'],
    ['/compare/google-analytics', 'Pulzivo vs Google Analytics'],
    ['/compare/simple-analytics', 'Pulzivo vs Simple Analytics'],
  ];
  const seen = new Set();
  const unique = links.filter(([href]) => (seen.has(href) ? false : seen.add(href)));
  return `<nav class="prerendered-nav sr-only" aria-label="Site" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;border:0">${unique.map(([h, t]) => `<a href="${esc(h)}">${esc(t)}</a>`).join(' ')}</nav>`;
}

function staticBody(page) {
  let inner;
  if (page.post) {
    const p = page.post;
    inner = `<article class="prerendered"><p><a href="/blog">Blog</a></p><h1>${esc(p.title)}</h1><time datetime="${p.date}">${p.date}</time>${postContent[p.slug]}</article>`;
  } else {
    const rendered = renderMarketingPage(page.path) || '<div class="prerendered"></div>';
    inner = rendered.replace(/^<div class="prerendered">/, '').replace(/<\/div>\s*$/, '');
  }
  return `<div class="prerendered">${staticHeader()}${inner}${staticFooter()}</div>`;
}

function faqEntries(page) {
  if (!page || page.post) return null;
  const scope = pageScope(page.path);
  if (!scope || !Array.isArray(scope.faqs)) return null;
  const faqs = scope.faqs.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const question = item.question || item.q;
    const answer = item.answer || item.a;
    if (!question || !answer) return null;
    return { question: String(question), answer: String(answer) };
  }).filter(Boolean);
  return faqs.length ? faqs : null;
}

function ldScript(data) {
  const json = JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function offerFromPlan(plan) {
  return {
    '@type': 'Offer',
    name: plan.name,
    price: String(plan.price),
    priceCurrency: 'USD',
    description: `${plan.name} — $${plan.price} USD/month`,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: String(plan.price),
      priceCurrency: 'USD',
      unitText: 'month',
      billingDuration: 1,
    },
  };
}

// Organization and SoftwareApplication stay in the document head. Offers are
// taken from the pricing page data. The noindexed demo URL is not a sitelink.
function ensureStructuredData(html) {
  const plans = pageScope('pricing').plans;
  const offers = plans.map(offerFromPlan);
  let hasOrg = false;
  let hasApp = false;
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (full, json) => {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      return full;
    }
    if (data['@type'] === 'Organization') {
      hasOrg = true;
      if (!data.name) data.name = SITE;
      if (!data.url) data.url = `${ORIGIN}/`;
      if (!data.logo) data.logo = `${ORIGIN}/favicon.svg`;
      return data.name && data.url && data.logo ? full : ldScript(data);
    }
    if (data['@type'] === 'SoftwareApplication') {
      hasApp = true;
      data.name = SITE;
      data.url = data.url || `${ORIGIN}/`;
      data.offers = offers;
      return ldScript(data);
    }
    if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
      const items = data.itemListElement.filter((item) => !/\/demo(?:\/|$)/.test(String(item.url || '')));
      data.itemListElement = items.map((item, index) => ({ ...item, position: index + 1 }));
      return ldScript(data);
    }
    return full;
  });
  if (!hasOrg) {
    html = html.replace('</head>', () => `${ldScript({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${ORIGIN}/#organization`,
      name: SITE,
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/favicon.svg`,
    })}\n</head>`);
  }
  if (!hasApp) {
    html = html.replace('</head>', () => `${ldScript({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE,
      url: `${ORIGIN}/`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web Browser',
      offers,
    })}\n</head>`);
  }
  return html;
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
  html = ensureStructuredData(html);
  if (page.path !== '') {
    // The homepage FAQ block in index.html should not repeat on every URL.
    html = html.replace(/\s*<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "FAQPage"[\s\S]*?<\/script>/, '');
  }
  if (!/"@type":\s*"FAQPage"/.test(html)) {
    const faqs = faqEntries(page);
    if (faqs) {
      html = html.replace('</head>', () => `${ldScript({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      })}\n</head>`);
    }
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
  const body = staticBody(page) + siteNav();
  html = html.replace(/<app-root><\/app-root>/, () => `<app-root>${body}</app-root>`);
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
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), buildSitemap(new Date().toISOString().slice(0, 10)));
}

module.exports = { pages, buildSitemap, render, canonicalFor };
if (require.main === module) main();
