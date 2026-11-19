/** One-click install guides. The user's key is filled in; a blank key stays YOUR_API_KEY. */

export const TRACKER_SRC = 'https://cdn.pulzivo.com/pulzivo-analytics.min.js';

export const INSTALL_TABS = [
  { id: 'html', label: 'HTML' },
  { id: 'wordpress', label: 'WordPress' },
  { id: 'shopify', label: 'Shopify' },
  { id: 'webflow', label: 'Webflow' },
  { id: 'next', label: 'Next.js' },
  { id: 'react', label: 'React / Vite' },
  { id: 'angular', label: 'Angular' },
] as const;

export type InstallTabId = (typeof INSTALL_TABS)[number]['id'];

export interface InstallGuide {
  id: InstallTabId;
  steps: string[];
  code: string;
}

export function scriptTag(apiKey: string): string {
  const key = String(apiKey || '').trim() || 'YOUR_API_KEY';
  return `<script src="${TRACKER_SRC}" data-api-key="${key}"></script>`;
}

export function installGuide(tab: InstallTabId, apiKey: string): InstallGuide {
  const key = String(apiKey || '').trim() || 'YOUR_API_KEY';
  const tag = scriptTag(key);
  switch (tab) {
    case 'wordpress':
      return {
        id: tab,
        steps: [
          'Go to Appearance → Theme File Editor and open header.php. A child theme keeps this change when the theme updates.',
          'Paste the snippet just before </head>. No plugin is required.',
          'Click Update File, then open the site once.',
        ],
        code: tag,
      };
    case 'shopify':
      return {
        id: tab,
        steps: [
          'In Shopify admin, open Online Store → Themes → … → Edit code.',
          'Open layout/theme.liquid.',
          'Paste the snippet just before </head> and save.',
        ],
        code: tag,
      };
    case 'webflow':
      return {
        id: tab,
        steps: [
          'Open Project settings → Custom code.',
          'Paste the snippet into the Head code field.',
          'Save, then publish the site.',
        ],
        code: tag,
      };
    case 'next':
      return {
        id: tab,
        steps: [
          'Put this in app/layout.tsx. next/script loads it after the page is interactive.',
          'The key below is already yours.',
        ],
        code: `import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <Script
          src="${TRACKER_SRC}"
          data-api-key="${key}"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}`,
      };
    case 'react':
      return {
        id: tab,
        steps: [
          'In a Vite project, open index.html.',
          'Paste the snippet inside <head>, before the module script.',
        ],
        code: tag,
      };
    case 'angular':
      return {
        id: tab,
        steps: [
          'Open src/index.html.',
          'Paste the snippet inside <head>. It loads before Angular starts.',
        ],
        code: tag,
      };
    default:
      return {
        id: 'html',
        steps: [
          'Paste this into the <head> of every page.',
          'Open the site once so the first visit can arrive.',
        ],
        code: tag,
      };
  }
}
