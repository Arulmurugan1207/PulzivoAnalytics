type Cell = 'Yes' | 'No' | 'Partial';

const PULZIVO: Record<string, Cell> = {
  'Sets cookies': 'No',
  'Lasting free plan': 'Yes',
  'Custom events': 'Yes',
  'Goals': 'Yes',
  'Rage click detection': 'Yes',
  'Form abandonment': 'Yes',
  'JavaScript error capture': 'Yes',
  'Weekly email report': 'Yes',
  'Read-only share link': 'Yes',
  'Google Ads linking': 'No',
  'BigQuery export': 'No',
};

function rows(other: Record<string, Cell>) {
  return Object.keys(PULZIVO).map((feature) => ({
    feature,
    pulzivo: PULZIVO[feature],
    other: other[feature],
  }));
}

const NOTE =
  'Yes, No, or Partial are used only where the difference is clear. Pulzivo details come from this repository: rage clicks and form abandonment are Enterprise features, and JavaScript error capture starts on Pro. Competitor cells are general public facts, not a price quote. Plans change, so check each vendor before you buy. Pulzivo does not claim a smaller script than anyone else. The core tracker is about 9KB gzip, and the optional extras file loads only when a plan turns on forms, errors, or rage clicks.';

const related = (skip: string) =>
  [
    { href: '/ga4-alternative', label: 'GA4 alternative for small sites' },
    { href: '/compare/google-analytics', label: 'Pulzivo vs Google Analytics' },
    { href: '/compare/plausible', label: 'Pulzivo vs Plausible' },
    { href: '/compare/fathom', label: 'Pulzivo vs Fathom' },
    { href: '/compare/simple-analytics', label: 'Pulzivo vs Simple Analytics' },
    { href: '/cookieless-analytics', label: 'Cookieless analytics' },
    { href: '/docs', label: 'Installation docs' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/blog/pulzivo-vs-ga4-vs-plausible-pricing', label: 'October 2026 pricing notes' },
  ].filter((link) => link.href !== skip);

export const GA4_ALTERNATIVE = {
  trackId: 'ga4-alternative',
  kicker: 'For docs sites, landing pages, and side projects',
  lede:
    'Google Analytics 4 is free and very capable. It is also built for teams that live in Google Ads, model attribution, and build custom reports. If you run a small site, you usually want a shorter list of answers: who visited, which page they opened, where they came from, and whether they did the one action that matters.',
  otherName: 'Google Analytics 4',
  tableTitle: 'Pulzivo and GA4, feature by feature',
  tableIntro:
    'This is the practical cut for a small site. It is not a full inventory of GA4 explorations, audiences, or advertising reports.',
  tableNote: NOTE,
  sections: [
    {
      heading: 'What most small sites actually check',
      paragraphs: [
        'Write down the questions you open a dashboard to answer. For a docs site, a SaaS landing page, or a side project they are usually: how many people came, which referrer or campaign sent them, which pages they read, and whether they signed up, copied a command, or sent the contact form. Anything you will not look at is data you do not need to collect.',
        'Pulzivo is built around that list. One script tag records page views, clicks, and custom events. Outbound links, downloads, and site search are picked up without a second snippet, including route changes in React, Next.js, Vue, and Angular.',
      ],
      bullets: [],
    },
    {
      heading: 'What you give up when you leave GA4',
      paragraphs: [
        'Be honest about the gaps. Pulzivo does not link to Google Ads, and it does not export to BigQuery. If those two are how you spend money or how your warehouse is fed, keep GA4. Pulzivo also does not try to stitch a person across devices unless you opt in and pass your own user id on the Pro plan.',
        'The default visitor id changes every calendar day and lives in localStorage, not a cookie, so today is not tied to yesterday. Run both scripts for a few weeks. Adding Pulzivo does not remove the GA tag.',
      ],
      bullets: [],
    },
    {
      heading: 'What the script does on a small site',
      paragraphs: [
        'The core file is about 9KB gzip. Paste it in the head with your API key. Page views, clicks, scroll depth, and Core Web Vitals (LCP, INP, CLS) are on the free plan. Sessions, unique visitors, and UTM attribution start on Starter. JavaScript errors start on Pro. Form abandonment, rage clicks, and dead clicks start on Enterprise, and those modules load in a separate file only when the plan enables them.',
        'Improve your site is a rules-based list of fixes from the events your plan collects: slow vitals, 404s, scroll, and, on higher plans, rage clicks, form abandons, and JavaScript errors. Insights adds a few plain-English lines for 7 or 30 days. The Monday email covers visitors, pages, sources, and what changed. A GA4 CSV import does not connect to Google. A revocable share link shows visitors, page views, top pages, sources, and countries.',
      ],
      bullets: [
        'No cookies, and no personal data collected by default.',
        'Do Not Track and Global Privacy Control stop tracking unless you set data-ignore-dnt.',
        'PulzivoAnalytics.optOut() stops collection in that browser.',
        'Owner mode, including ?pulz_owner=1, keeps your own visits out of the numbers.',
      ],
    },
  ],
  rows: rows({
    'Sets cookies': 'Yes',
    'Lasting free plan': 'Yes',
    'Custom events': 'Yes',
    'Goals': 'Yes',
    'Rage click detection': 'No',
    'Form abandonment': 'Partial',
    'JavaScript error capture': 'Partial',
    'Weekly email report': 'Partial',
    'Read-only share link': 'Partial',
    'Google Ads linking': 'Yes',
    'BigQuery export': 'Yes',
  }),
  faqs: [
    {
      question: 'Is Pulzivo a drop-in replacement for GA4?',
      answer:
        'For a small site that wants page views, referrers, top pages, and a few custom events, yes. It is not a replacement if you depend on Google Ads conversion import or a BigQuery export. Those stay in GA4.',
    },
    {
      question: 'Will Pulzivo set a cookie or collect personal data?',
      answer:
        'The script sets no cookies and collects no personal data by default. It stores an anonymous visitor id that rotates each calendar day, plus a session id, in localStorage. A stable id or email is sent only if you call identify() with values you supply. Depending on your region, localStorage can still be regulated. This is not legal advice.',
    },
    {
      question: 'How big is the tracker?',
      answer:
        'The core script is about 9KB gzip. Forms, JavaScript errors, and rage clicks ship in a second file that loads only when your plan enables them.',
    },
    {
      question: 'Can I import my old GA4 numbers?',
      answer:
        'Yes. Download a CSV from GA4 Reports, either Pages and screens or Traffic acquisition, and upload it under Settings. Pulzivo does not sign in to Google for you.',
    },
  ],
  related: related('/ga4-alternative'),
};

export const COMPARE_PLAUSIBLE = {
  trackId: 'compare-plausible',
  kicker: 'Two cookieless tools, different meters',
  lede:
    'Plausible and Pulzivo both aim at people who find GA4 heavier than the site they run. Plausible is a well-known cookieless analytics product with a small script, a simple dashboard, and open-source software you can host yourself. Pulzivo is a hosted product with a free plan, an event meter, and a few product-analytics signals on higher plans. This page is the difference, not a winner.',
  otherName: 'Plausible',
  tableTitle: 'Pulzivo vs Plausible',
  tableIntro:
    'Cells are Yes, No, or Partial. Pricing numbers for Plausible are omitted on purpose. Their public pricing is pageview-based and changes. Our October 2026 notes are linked below if you want the figures we checked then.',
  tableNote: NOTE + ' Plausible can be self-hosted. Pulzivo lets you serve the script from your own domain, and events are sent to the Pulzivo API.',
  sections: [
    {
      heading: 'The same questions, a different meter',
      paragraphs: [
        'Both products answer the small-site questions: how many people came, which pages they opened, and which referrer or campaign sent them. Neither sets a cookie to do that. Plausible is known for a very small script and a single clean screen. Pulzivo\'s core script is about 9KB gzip. That is larger than the tiny scripts in this category, and we are not claiming otherwise.',
        'The meter is the part people misread. Plausible\'s public plans are built around monthly pageviews. Pulzivo counts events: a page view, a click, and a custom event each use the allowance. The same traffic can therefore cost more events on Pulzivo than pageviews on Plausible. Use the free plan, 10,000 events a month on one website, to see your real volume before you compare invoices.',
        'Plausible does not publish a lasting free plan. Pulzivo does. If you are evaluating a side project, that difference matters more than a feature matrix.',
      ],
      bullets: [],
    },
    {
      heading: 'Where Pulzivo adds product signals',
      paragraphs: [
        'Pulzivo keeps going after the page view. Custom events are on the free plan, with trackGoal() and trackRevenue() for the actions you care about. Starter adds sessions, unique visitors, and UTM attribution. Pro adds opt-in identification (an id you supply, not one Pulzivo invents) and JavaScript error capture. Enterprise adds form abandonment, rage clicks, and dead clicks.',
        'Those higher-plan events feed Improve your site, which lists concrete fixes, and the insights card, which writes a few plain-English lines for 7 or 30 days. A Monday email summarizes visitors, pages, sources, and what changed. You can turn it off. A share link shows a read-only slice: visitors, page views, top pages, sources, and countries.',
        'Plausible stays closer to web analytics. The table marks rage clicks, form abandonment, and JavaScript error capture as No because those are not what that product is for. If you only want page-level stats, that focus is a virtue, not a gap.',
      ],
      bullets: [],
    },
    {
      heading: 'When Plausible is the better fit',
      paragraphs: [
        'Pick Plausible if you want to self-host the whole product, or if you already like its pageview pricing and you do not need error capture, rage clicks, or form abandonment. Pick Pulzivo if you want a free tier to start, you think in events rather than pageviews, or you want the Improve your site list once traffic is large enough for those rules to fire.',
        'Neither tool replaces Google Ads reporting or a BigQuery export. If that is the job, GA4 is still the better fit. You can also install Pulzivo next to what you have. The script does not remove another tag.',
      ],
      bullets: [],
    },
  ],
  rows: rows({
    'Sets cookies': 'No',
    'Lasting free plan': 'No',
    'Custom events': 'Yes',
    'Goals': 'Yes',
    'Rage click detection': 'No',
    'Form abandonment': 'No',
    'JavaScript error capture': 'No',
    'Weekly email report': 'Yes',
    'Read-only share link': 'Yes',
    'Google Ads linking': 'No',
    'BigQuery export': 'No',
  }),
  faqs: [
    {
      question: 'Does Pulzivo set cookies, the way people assume analytics tools do?',
      answer:
        'No. Pulzivo sets no cookies and collects no personal data by default. An anonymous visitor id rotates every calendar day in localStorage, and a session id sits beside it. A permanent id exists only after you call identify() on Pro.',
    },
    {
      question: 'Why can the same site use more Pulzivo events than Plausible pageviews?',
      answer:
        'Pulzivo counts clicks and custom events as well as page views. A pageview-metered product does not charge for those clicks the same way. Check a few weeks on the free plan before you compare the two bills.',
    },
    {
      question: 'Is Pulzivo\'s script the tiny one this category is known for?',
      answer:
        'No. Plausible is known for a very small script. Pulzivo\'s core file is about 9KB gzip, and optional modules load separately. We do not rank file sizes against other products.',
    },
    {
      question: 'Can I bring GA4 history into Pulzivo while I try it?',
      answer:
        'Yes. Upload a CSV you exported from GA4. Pulzivo does not connect to your Google account. The October 2026 pricing notes linked on this page are the last time we wrote down published prices.',
    },
  ],
  related: related('/compare/plausible'),
};

export const COMPARE_FATHOM = {
  trackId: 'compare-fathom',
  kicker: 'Simple dashboards, different starting points',
  lede:
    'Fathom is a hosted, cookieless analytics product with a simple dashboard and paid plans. Pulzivo is also hosted and cookieless, and it starts with a free plan of 10,000 events a month. If you want a one-screen view of traffic, both are in the right family. The split is the meter, the free tier, and a handful of product signals Pulzivo adds on Pro and Enterprise.',
  otherName: 'Fathom',
  tableTitle: 'Pulzivo vs Fathom',
  tableIntro:
    'Fathom\'s public pricing is based on pageviews, and custom events count toward that allowance. Prices move, so this table does not quote them. The October 2026 notes linked below are a dated check, not a current invoice.',
  tableNote: NOTE,
  sections: [
    {
      heading: 'What you are comparing',
      paragraphs: [
        'Fathom is built to answer traffic questions without cookies and without a GA4-sized interface. That is a fair description of Pulzivo\'s free and Starter plans too: page views, referrers, top pages, and, from Starter, sessions and UTM attribution. The core Pulzivo script is about 9KB gzip. Fathom\'s script is widely described as very small. We are not claiming to be smaller.',
        'Fathom does not advertise a lasting free plan. Pulzivo\'s free plan is $0, one website, 10,000 events a month, 30 days of retention, and no credit card. That is the easiest way to see whether the dashboard answers your questions before any paid plan is involved.',
        'Because Pulzivo counts events, automatic clicks and any custom events you send use the same monthly allowance as page views. A quiet blog and a click-heavy app will not land on the same tier. Measure first.',
      ],
      bullets: [],
    },
    {
      heading: 'Product signals Fathom does not try to be',
      paragraphs: [
        'On Pro, Pulzivo captures uncaught JavaScript errors and unhandled promise rejections, including message and stack. On Enterprise it records form starts, submits, and abandons, plus rage clicks and dead clicks. Improve your site turns those, along with Web Vitals, 404s, and scroll, into a short list of fixes. None of that is required to read your traffic. It is there when a broken button or a failing script is the thing you actually wanted to know.',
        'The Monday email is a summary of last week: visitors, pages opened, pages that got attention, where visits started, and a couple of changes. It is on by default and can be switched off, separate from product tips. The share link is read-only and revocable. The GA4 import reads a CSV you download yourself.',
        'The table marks those friction rows as No for Fathom because they are outside a typical web-analytics dashboard. If you want that narrower product, Fathom is a coherent choice.',
      ],
      bullets: [],
    },
    {
      heading: 'A practical way to choose',
      paragraphs: [
        'Choose Fathom if you already know you want a paid, pageview-metered, cookieless dashboard and you do not need error or rage-click capture. Choose Pulzivo if you want to start free, you are fine counting events, or you want Improve your site once the plan includes the underlying events.',
        'Neither one links to Google Ads or exports to BigQuery. Keep GA4 if that is the requirement. Installing Pulzivo is one script tag, and it can sit beside Fathom or GA4 while you compare a real week of your own traffic.',
      ],
      bullets: [],
    },
  ],
  rows: rows({
    'Sets cookies': 'No',
    'Lasting free plan': 'No',
    'Custom events': 'Yes',
    'Goals': 'Yes',
    'Rage click detection': 'No',
    'Form abandonment': 'No',
    'JavaScript error capture': 'No',
    'Weekly email report': 'Yes',
    'Read-only share link': 'Yes',
    'Google Ads linking': 'No',
    'BigQuery export': 'No',
  }),
  faqs: [
    {
      question: 'Does Fathom have a free plan?',
      answer:
        'Not a lasting one, as far as its public pricing describes. Pulzivo\'s free plan is 10,000 events a month, one website, no credit card. Confirm Fathom\'s current trial terms on their site before you decide.',
    },
    {
      question: 'Does Pulzivo use cookies?',
      answer:
        'No. No cookies, and no personal data collected by default. The anonymous id in localStorage changes each calendar day. identify() on Pro is the opt-in path to a stable id you provide.',
    },
    {
      question: 'Are rage clicks and form abandonment on the free plan?',
      answer:
        'No. JavaScript errors start on Pro (list $29/month, $14.50 for the first 12 months). Form abandonment, rage clicks, and dead clicks start on Enterprise (list $99/month, $49.50 for the first 12 months). Web Vitals and scroll depth are on every plan, including Free. 50% off your first 12 months, launch offer until we reach 100 users.',
    },
    {
      question: 'Can I share a Pulzivo dashboard without creating an account for someone?',
      answer:
        'Yes. Settings can create a public link. Anyone with it sees visitors, page views, top pages, sources, and countries. They cannot change anything. You can revoke the link.',
    },
  ],
  related: related('/compare/fathom'),
};

export const COMPARE_GA = {
  trackId: 'compare-google-analytics',
  kicker: 'A direct look at GA4',
  lede:
    'GA4 is the default analytics tool on the web, and the standard property is free of charge. Pulzivo is a smaller, cookieless alternative for sites that do not need the advertising and warehouse features GA4 is built around. This comparison stays on behavior you can check: cookies, the free plan, events, and the places GA4 is still the right tool.',
  otherName: 'Google Analytics 4',
  tableTitle: 'Pulzivo vs Google Analytics 4',
  tableIntro:
    'Partial means GA4 can cover part of the job if you configure it, not that the product ships the same screen Pulzivo does. Details are under the table.',
  tableNote:
    NOTE +
    ' Partial on form abandonment: GA4 enhanced measurement can collect form starts and submits, not a dedicated abandon event. Partial on JavaScript errors: you can send an exception, and GA4 does not capture uncaught errors on its own. Partial on the weekly email and the share link: GA4 can schedule some report mail and can share access inside a Google account. Pulzivo\'s email is a Monday summary, and its share link is a revocable URL with no Google login.',
  sections: [
    {
      heading: 'Cookies, setup, and the first week',
      paragraphs: [
        'GA4 distinguishes browsers with first-party cookies such as _ga. Pulzivo sets no cookies. It stores an anonymous visitor id that changes every calendar day, plus a session id, in localStorage. No personal data is collected by default. A name, email, or stable id is sent only if your code calls identify() with values you already have, and that feature is on Pro.',
        'Setup on Pulzivo is one script tag, about 9KB gzip for the core file. Page views start without a property configuration step. GA4 is more powerful and takes longer to learn. If your team already has someone who builds explorations, that learning curve is an investment you have already paid. If you do not, it is the reason people look for an alternative.',
        'Both have a lasting free plan. GA4\'s standard property is free of charge. Pulzivo Free is 10,000 events a month on one website. Paid tiers are below.',
      ],
      bullets: [],
    },
    {
      heading: 'Events, friction, and history',
      paragraphs: [
        'Both products are event-based. Pulzivo records page views and clicks on Free, custom events on Free, sessions and UTM on Starter, JavaScript errors on Pro, and form abandonment plus rage clicks on Enterprise. GA4 can receive almost any event you send, and enhanced measurement covers a set of automatic events including form interaction. It does not ship rage-click detection. That is why the table says No for rage clicks and Partial for forms and errors.',
        'Improve your site and the insights card are Pulzivo-only screens: rules and short sentences about what changed, not a GA4 exploration you have to build. The weekly email and the share link are described in the table note so the Partial cells stay specific.',
        'Moving history is a CSV, not an OAuth connection. In GA4, export Pages and screens or Traffic acquisition, then upload the file in Pulzivo Settings. You can keep the GA4 tag installed while you do it.',
      ],
      bullets: [],
    },
    {
      heading: 'Keep GA4 when the job is ads or the warehouse',
      paragraphs: [
        'Google Ads linking and BigQuery export are the two rows where GA4 is simply Yes and Pulzivo is No. If your spend or your data team depends on them, Pulzivo is an extra dashboard, not a replacement. Say that early so nobody migrates and then discovers the gap.',
        'For a marketing site, a docs site, or an early SaaS app, the gap you are more likely to feel is the opposite: GA4 can do the job, and you still do not open it. Pulzivo is for that case. Install it, read a week of your own numbers, and keep whichever screen you actually use.',
      ],
      bullets: [],
    },
  ],
  rows: rows({
    'Sets cookies': 'Yes',
    'Lasting free plan': 'Yes',
    'Custom events': 'Yes',
    'Goals': 'Yes',
    'Rage click detection': 'No',
    'Form abandonment': 'Partial',
    'JavaScript error capture': 'Partial',
    'Weekly email report': 'Partial',
    'Read-only share link': 'Partial',
    'Google Ads linking': 'Yes',
    'BigQuery export': 'Yes',
  }),
  faqs: [
    {
      question: 'Does GA4 use cookies?',
      answer:
        'Yes. Google documents first-party cookies such as _ga to distinguish users. Pulzivo sets no cookies and collects no personal data by default.',
    },
    {
      question: 'Should I delete my GA4 tag on day one?',
      answer:
        'No. Add the Pulzivo script beside it. Compare a couple of weeks. Remove GA4 only when you are sure you do not need Ads linking or BigQuery export.',
    },
    {
      question: 'What does Partial mean on JavaScript errors?',
      answer:
        'GA4 can store an exception event if your code sends one. Pulzivo on Pro listens for uncaught errors and unhandled rejections without a separate snippet. Those are different amounts of setup, so the cell is Partial rather than No.',
    },
    {
      question: 'How do I import GA4 into Pulzivo?',
      answer:
        'Download CSV from Reports, Pages and screens or Traffic acquisition, and upload it in Settings. Pulzivo never asks for your Google login.',
    },
  ],
  related: related('/compare/google-analytics'),
};

export const COMPARE_SIMPLE = {
  trackId: 'compare-simple-analytics',
  kicker: 'Cookieless page stats, or events as well',
  lede:
    'Simple Analytics is a cookieless analytics product with a straightforward dashboard of pages, referrers, and visits. Pulzivo is in the same privacy neighborhood: no cookies, no personal data by default, one script tag. The useful difference is what happens after the page view. Pulzivo counts events, starts on a free plan, and on higher plans records JavaScript errors, form abandonment, and rage clicks.',
  otherName: 'Simple Analytics',
  tableTitle: 'Pulzivo vs Simple Analytics',
  tableIntro:
    'Simple Analytics publishes paid, page-oriented plans and does not offer a Pulzivo-style lasting free tier. Current prices belong on their site, not in this table.',
  tableNote: NOTE,
  sections: [
    {
      heading: 'A shared idea of privacy',
      paragraphs: [
        'Both products exist so a small site can count visits without dropping a tracking cookie. Pulzivo\'s version of that sentence is specific: the script sets no cookies, the default visitor id rotates every calendar day, and personal data is not collected unless you opt in with identify(). Do Not Track and Global Privacy Control stop collection unless you override them. A visitor can call optOut() in their own browser.',
        'That design still uses localStorage for the daily id and the session id. In some regions that storage can require a consent decision even though it is not a cookie. Pulzivo does not promise that you can skip every banner. It promises not to set a cookie and not to collect personal data by default. Check the rules that apply to your site.',
        'The core script is about 9KB gzip. Simple Analytics, like the other tools in this category, is known for a small script. We are not ranking file sizes against them.',
      ],
      bullets: [],
    },
    {
      heading: 'Page counters and product signals',
      paragraphs: [
        'If the only numbers you read are page views, referrers, and countries, a focused cookieless tool is enough, and Simple Analytics is built for that. Pulzivo adds the event layer on the same script: custom events on Free, goals and revenue calls, sessions and UTM on Starter, then the Pro and Enterprise signals listed in the pricing block on this page.',
        'Improve your site is the reason those signals exist. It is a fixed set of rules over real events: slow LCP, INP, or CLS, 404s, low scroll, dead-end pages, and, when the plan includes them, rage clicks, dead clicks, form abandons, and JavaScript errors. The output is a fix and a count, not a score we invented.',
        'You also get a Monday email and a revocable share link. GA4 history can be imported from a CSV you export yourself. None of these require a Google account.',
      ],
      bullets: [],
    },
    {
      heading: 'How to decide without a spreadsheet',
      paragraphs: [
        'Stay with Simple Analytics if you want page-level stats, you are happy on a paid plan, and you do not want error or rage-click capture in the same tool. Try Pulzivo if you want 10,000 free events to test with, or if the questions you ask are about clicks, goals, and broken interactions as well as pages.',
        'Neither product is GA4. There is no Google Ads link and no BigQuery export. If you need those, keep GA4 and treat either cookieless tool as a reading dashboard. The install is one script tag, and it can run beside what you have.',
      ],
      bullets: [],
    },
  ],
  rows: rows({
    'Sets cookies': 'No',
    'Lasting free plan': 'No',
    'Custom events': 'Yes',
    'Goals': 'Yes',
    'Rage click detection': 'No',
    'Form abandonment': 'No',
    'JavaScript error capture': 'No',
    'Weekly email report': 'Yes',
    'Read-only share link': 'Yes',
    'Google Ads linking': 'No',
    'BigQuery export': 'No',
  }),
  faqs: [
    {
      question: 'Is Simple Analytics cookieless?',
      answer:
        'Yes. That is the public product. Pulzivo is cookieless too: no cookies, no personal data collected by default, with a daily-rotating anonymous id in localStorage.',
    },
    {
      question: 'Does Pulzivo have a free plan?',
      answer:
        'Yes. Free is $0, 10,000 events a month, one website, 30-day retention, no credit card. Starter lists at $9, Pro at $29, and Enterprise at $99 per month. 50% off your first 12 months, launch offer until we reach 100 users ($4.50, $14.50, and $49.50).',
    },
    {
      question: 'What is not on the free plan?',
      answer:
        'Sessions, unique visitors, and UTM attribution start on Starter. JavaScript errors start on Pro. Form abandonment, rage clicks, and dead clicks start on Enterprise. Page views, clicks, custom events, scroll depth, and Web Vitals are on Free.',
    },
    {
      question: 'Can I see Pulzivo next to my current analytics?',
      answer:
        'Yes. The script does not remove another tag. Read both for a week. The docs show the exact script tag.',
    },
  ],
  related: related('/compare/simple-analytics'),
};

export const COOKIELESS = {
  trackId: 'cookieless-analytics',
  kicker: 'What the script actually stores',
  lede:
    'Cookieless analytics means the script does not set a cookie to tell one browser from another. Pulzivo takes that literally: no cookies, and no personal data collected by default. It still has to separate one visit from the next, or the dashboard would be a single total. This page is how that works in the tracker, and what it does not do.',
  otherName: 'Google Analytics 4',
  tableTitle: 'Pulzivo and a cookie-based tool',
  tableIntro:
    'The other column is Google Analytics 4, because its first-party cookie is documented and easy to check. It is not a claim about every other product.',
  tableNote:
    'GA4 uses a long-lived first-party cookie such as _ga. Pulzivo\'s default id changes every calendar day and is not a cookie. Partial is not used in this table. The privacy controls below are Pulzivo behavior from the script, not a guess about GA4.',
  sections: [
    {
      heading: 'What "cookieless" means here',
      paragraphs: [
        'A cookie is a small name-value pair the browser stores and sends back to a site. Analytics tools have historically used one, often for many months, as a client id. GA4 still does this with cookies such as _ga. Pulzivo\'s script never calls the cookie API to set an analytics identifier.',
        'Instead, the default visitor id is a random value kept in localStorage under a day stamp. On a new calendar day the script mints a new id. Nothing in that value links today\'s visits to yesterday\'s. A session id, also in localStorage, rolls over after a period of inactivity so "this sitting" is separate from "this day". Older builds stored a permanent id and an email in localStorage. The current script deletes those keys if it finds them.',
        'That is cookieless. It is not "we store nothing". localStorage is still on the device, and in some regions that can require consent even though it is not a cookie. This page is not legal advice.',
      ],
      bullets: [],
    },
    {
      heading: 'What is collected by default, and what is not',
      paragraphs: [
        'By default the event payload is anonymous: page path, title, referrer and UTM values when the plan includes attribution, and the rotating id. Emails that happen to appear in strings are redacted. An email is sent only if your code calls identify() or setUserEmail(), and that email is kept in memory and sessionStorage for the tab, not in localStorage.',
        'A stable id, the pz_uid key, is written only after identify() on the Pro plan, using an id you supply. Until you do that, there is no permanent visitor key. Do Not Track and Global Privacy Control stop tracking by default. data-ignore-dnt="true" is the explicit override for sites that have a different policy. optOut() sets a local flag, drops queued events, and stays off in that browser until optIn().',
        'Owner mode is separate from visitor privacy. It is how you exclude yourself, with a local flag or ?pulz_owner=1, so your testing does not fill the dashboard. It is not a visitor-facing control.',
      ],
      bullets: [
        'No analytics cookie is set.',
        'The anonymous id rotates every calendar day.',
        'A permanent id exists only after identify() on Pro.',
        'Do Not Track, Global Privacy Control, and optOut() stop collection.',
      ],
    },
    {
      heading: 'What you can still measure',
      paragraphs: [
        'Cookieless does not mean page views only. The free plan records page views, clicks, custom events, scroll depth, and Core Web Vitals. Starter adds sessions, unique visitors, and UTM attribution. Pro adds performance metrics, opt-in identification, and JavaScript errors. Enterprise adds form abandonment, rage clicks, and dead clicks. The core file is about 9KB gzip. The extras file loads only for the modules your plan enables.',
        'Daily rotation means Pulzivo cannot, by default, tie yesterday\'s reader to today\'s signup. Pass your own id with identify() on Pro if you need that. Insights, Improve your site, the Monday email, the share link, and a GA4 CSV import all sit on the events above.',
      ],
      bullets: [],
    },
  ],
  rows: [
    { feature: 'Sets cookies', pulzivo: 'No', other: 'Yes' },
    { feature: 'Long-lived cookie identifier', pulzivo: 'No', other: 'Yes' },
    { feature: 'Anonymous id rotates each calendar day', pulzivo: 'Yes', other: 'No' },
    { feature: 'Stable id only if the site opts in', pulzivo: 'Yes', other: 'No' },
    { feature: 'Lasting free plan', pulzivo: 'Yes', other: 'Yes' },
  ],
  faqs: [
    {
      question: 'Does cookieless mean Pulzivo stores nothing in the browser?',
      answer:
        'No. It stores an anonymous visitor id that changes each calendar day, and a session id, in localStorage. It does not set a cookie. A permanent id is stored only if you call identify().',
    },
    {
      question: 'Is that the same as "no consent ever"?',
      answer:
        'No. Some regions regulate localStorage as well as cookies. Pulzivo collects no personal data by default and honors Do Not Track, Global Privacy Control, and optOut(). Whether you still need a banner is a legal question for your site, not a claim this product makes.',
    },
    {
      question: 'Can I still see returning visitors?',
      answer:
        'Not across calendar days, unless you opt in with identify() on Pro and pass your own user id. Within a day, the daily id and the session id separate visits. Unique visitors as a dashboard metric start on Starter.',
    },
    {
      question: 'How does this compare with GA4 cookies?',
      answer:
        'GA4 uses a long-lived first-party cookie such as _ga. Pulzivo does not. Both have a free way to start. The longer comparison is on the Pulzivo vs Google Analytics page.',
    },
  ],
  related: related('/cookieless-analytics'),
};
