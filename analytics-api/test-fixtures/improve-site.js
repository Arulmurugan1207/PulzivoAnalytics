'use strict';

/**
 * Synthetic site for the "Improve your site" report.
 * current period: day offsets 1..14 before `end`; previous: 15..28.
 */
const KEY = 'PULZ-PRD-IMP';
const DAY = 86400000;

function makeSite({ end = new Date('2026-10-30T12:00:00Z'), visitors = 140, includePrevious = true, prevDeadOnAbout = true } = {}) {
  const docs = [];
  let seq = 0;
  const at = (dayOffset, i) => new Date(end.getTime() - dayOffset * DAY + (i % 3600) * 1000);
  const push = (event_name, who, dayOffset, data = {}) => {
    seq += 1;
    docs.push({
      event_name, apiKey: KEY, user_id: `u-${who}`, session_id: `s-${who}-${dayOffset}`,
      page: data.page || '/', timestamp: at(dayOffset, seq),
      data: { session_id: `s-${who}-${dayOffset}`, ...data },
    });
  };

  const period = (base, current) => {
    for (let v = 0; v < visitors; v += 1) {
      const d = base + (v % 10);
      const who = `${current ? 'c' : 'p'}${v}`;
      // Every visitor: home -> pricing (with a click on home), pricing is often the exit.
      push('page_view', who, d, { page: '/' });
      push('click', who, d, { page: '/', text: 'See pricing' });
      push('page_exit', who, d, { page: '/', scroll_depth: 80, view_id: `${who}-h` });
      push('page_view', who, d, { page: '/pricing' });
      push('page_exit', who, d, { page: '/pricing', scroll_depth: 60, view_id: `${who}-p` });
      push('web_vital_lcp', who, d, { page: '/pricing', value: v % 2 ? 4200 : 1800 });
      push('web_vital_lcp', who, d, { page: '/', value: 1200 });
      if (v % 3 === 0) push('click', who, d, { page: '/pricing', text: 'Start trial' });
      // /blog/launch: visited by most, barely scrolled, almost no clicks, always exited.
      if (v % 4 !== 3) {
        push('page_view', who, d, { page: '/blog/launch' });
        push('page_exit', who, d, { page: '/blog/launch', scroll_depth: v % 5 === 0 ? 70 : 10, view_id: `${who}-b` });
      }
      if (current) {
        // Rage clicks on the pricing toggle.
        if (v < 20) for (let k = 0; k < 2; k += 1) push('rage_click', who, d, { page: '/pricing', text: 'Annual / Monthly', element: 'BUTTON', click_count: 4 });
        // Signup form: 30 start, 9 submit.
        if (v < 30) {
          push('form_start', who, d, { page: '/signup', formId: 'signup' });
          if (v < 9) push('form_submit', who, d, { page: '/signup', formId: 'signup' });
        }
        // 404s and a JS error.
        if (v < 6) push('not_found', who, d, { page: '/old-pricing' });
        if (v < 5) push('javascript_error', who, d, { page: '/checkout', message: "TypeError: Cannot read properties of undefined (reading 'price')" });
      } else if (prevDeadOnAbout) {
        // Previous period: lots of dead clicks on the pricing table image; fixed since.
        if (v < 25) push('dead_click', who, d, { page: '/pricing', text: 'Plan comparison', element: 'IMG' });
      }
    }
  };
  period(1, true);
  if (includePrevious) period(15, false);
  return { docs, start: new Date(end.getTime() - 14 * DAY), end };
}

module.exports = { KEY, makeSite };
