/**
 * The prerendered homepage paints the hero dashboard image before Angular
 * boots. Bootstrap wipes <app-root>, which would destroy that node and make
 * a newly created <img> the LCP after JS (several seconds on mid-range
 * phones). These helpers move the same element out of <app-root> and back
 * into the Angular hero so LCP can stay on the first paint.
 */
export const LCP_HERO_ID = 'lcp-hero-shot';
export const LCP_HOLDER_ID = 'lcp-hero-holder';

export function preserveLcpHero(): void {
  if (typeof document === 'undefined') return;
  const shot = document.getElementById(LCP_HERO_ID);
  if (!shot || document.getElementById(LCP_HOLDER_ID)) return;
  const rect = shot.getBoundingClientRect();
  const holder = document.createElement('div');
  holder.id = LCP_HOLDER_ID;
  holder.style.cssText = [
    'position:absolute',
    `left:${Math.round(rect.left + window.scrollX)}px`,
    `top:${Math.round(rect.top + window.scrollY)}px`,
    `width:${Math.round(rect.width)}px`,
    'margin:0',
    'z-index:3',
    'pointer-events:none',
  ].join(';');
  holder.appendChild(shot);
  document.body.appendChild(holder);
}

export function adoptLcpHero(host: Element | null | undefined): boolean {
  if (!host || typeof document === 'undefined') return false;
  const shot = document.getElementById(LCP_HERO_ID);
  if (!shot) return false;
  if (shot.parentElement !== host) host.appendChild(shot);
  document.getElementById(LCP_HOLDER_ID)?.remove();
  return true;
}

export function prerenderedLcpHeroExists(): boolean {
  return typeof document !== 'undefined' && !!document.getElementById(LCP_HERO_ID);
}
