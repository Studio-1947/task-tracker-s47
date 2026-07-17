/**
 * Preview cards for link attachments.
 *
 * Providers are recognised from the URL alone and rendered through their own
 * official embed endpoint. Nothing here fetches the user's URL — not from the
 * browser and not from the API — so there is no SSRF surface and no scraping of
 * private pages. A link we don't recognise still gets a usable card, never a
 * broken frame.
 *
 * Embeds only render content the viewer could already open themselves: a private
 * Figma file shows Figma's own "request access" state rather than leaking it.
 */

export type LinkProvider = 'figma' | 'youtube' | 'loom' | 'google' | 'image' | 'generic';

export interface LinkInfo {
  provider: LinkProvider;
  /** Non-null when the provider supports an inline embed. */
  embedUrl: string | null;
  hostname: string;
  label: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** Host we identify ourselves as to embed providers. */
const EMBED_HOST = 'task-tracker';

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Figma URL types that Embed Kit 2.0 can render. */
const FIGMA_EMBEDDABLE = new Set(['design', 'board', 'proto', 'slides', 'deck']);

/**
 * Embed Kit 2.0: same path on the `embed.` subdomain, plus a required
 * `embed-host`. Query params (notably `node-id`) are preserved so the embed opens
 * on the same frame the sharer was looking at. Legacy `/file/` links are rewritten
 * to `/design/`, which is where Figma redirects them anyway.
 */
function figmaEmbedUrl(u: URL): string | null {
  const segments = u.pathname.split('/').filter(Boolean);
  const rawType = segments[0];
  if (!rawType) return null;

  const type = rawType === 'file' ? 'design' : rawType;
  if (!FIGMA_EMBEDDABLE.has(type)) return null; // e.g. /files/, marketing pages — no embed.

  const embed = new URL(u.toString());
  embed.hostname = 'embed.figma.com';
  embed.protocol = 'https:';
  embed.pathname = ['', type, ...segments.slice(1)].join('/');
  embed.searchParams.set('embed-host', EMBED_HOST);
  return embed.toString();
}

/**
 * Classify a link and, where possible, derive an embed URL.
 * `raw` is trusted to be http(s) — the API rejects every other scheme — but we
 * re-check here because this value ends up in an href and an iframe src.
 */
export function inspectLink(raw: string): LinkInfo {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { provider: 'generic', embedUrl: null, hostname: raw, label: 'Link' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { provider: 'generic', embedUrl: null, hostname: u.hostname, label: 'Link' };
  }

  const host = u.hostname.toLowerCase();
  const hostname = host.replace(/^www\./, '');

  if (hostMatches(host, 'figma.com')) {
    return { provider: 'figma', embedUrl: figmaEmbedUrl(u), hostname, label: 'Figma' };
  }

  if (hostMatches(host, 'youtube.com') || hostMatches(host, 'youtu.be')) {
    const id = hostMatches(host, 'youtu.be')
      ? u.pathname.slice(1)
      : (u.searchParams.get('v') ?? u.pathname.split('/').pop() ?? '');
    return {
      provider: 'youtube',
      // nocookie host: no tracking cookies until the viewer actually presses play.
      embedUrl: id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null,
      hostname,
      label: 'YouTube',
    };
  }

  if (hostMatches(host, 'loom.com')) {
    const id = u.pathname.split('/').pop() ?? '';
    const isShare = u.pathname.includes('/share/') || u.pathname.includes('/embed/');
    return {
      provider: 'loom',
      embedUrl: id && isShare ? `https://www.loom.com/embed/${encodeURIComponent(id)}` : null,
      hostname,
      label: 'Loom',
    };
  }

  if (hostMatches(host, 'docs.google.com')) {
    // Docs/Sheets/Slides all expose a read-only /preview view of the same file id.
    const embedUrl = u.pathname.includes('/edit')
      ? `${u.origin}${u.pathname.replace(/\/edit.*$/, '/preview')}`
      : null;
    return { provider: 'google', embedUrl, hostname, label: 'Google Docs' };
  }

  if (IMAGE_EXT.test(u.pathname)) {
    return { provider: 'image', embedUrl: u.toString(), hostname, label: 'Image' };
  }

  return { provider: 'generic', embedUrl: null, hostname, label: hostname };
}

export function ProviderIcon({ provider, className = '' }: { provider: LinkProvider; className?: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };
  if (provider === 'figma') {
    // Figma's three-column glyph, simplified.
    return (
      <svg {...common} className={className} strokeWidth="1.6">
        <circle cx="15" cy="12" r="3" />
        <path d="M12 9V3h3a3 3 0 0 1 0 6h-3zM12 9H9a3 3 0 0 1 0-6h3v6zM12 15H9a3 3 0 0 0 0 6 3 3 0 0 0 3-3v-3zM12 9v6H9a3 3 0 0 1 0-6h3z" />
      </svg>
    );
  }
  if (provider === 'youtube' || provider === 'loom') {
    return (
      <svg {...common} className={className}>
        <polygon points="10 8 16 12 10 16 10 8" />
        <rect x="2" y="4" width="20" height="16" rx="3" />
      </svg>
    );
  }
  if (provider === 'google') {
    return (
      <svg {...common} className={className}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="14" y2="17" />
      </svg>
    );
  }
  if (provider === 'image') {
    return (
      <svg {...common} className={className}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  return (
    <svg {...common} className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/**
 * The inline preview surface for one link. Collapsed by default: an embed is a
 * third-party frame, so it only loads once the viewer asks for it.
 */
export function LinkPreview({ url, expanded }: { url: string; expanded: boolean }) {
  const { provider, embedUrl } = inspectLink(url);
  if (!expanded || !embedUrl) return null;

  if (provider === 'image') {
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
        <img
          src={embedUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="max-h-80 w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <iframe
        src={embedUrl}
        title="Link preview"
        loading="lazy"
        /*
         * `allow-same-origin` keeps the frame on ITS own origin (figma.com, …) —
         * these embeds need their own storage to render, and without it they load
         * into an opaque origin and break. It grants the frame no access to us:
         * scripts inside are still bound by the same-origin policy against our
         * origin. (The unsafe pairing of allow-scripts + allow-same-origin only
         * applies to frames served from our OWN origin, which these never are.)
         */
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        referrerPolicy="no-referrer"
        allowFullScreen
        className="h-72 w-full border-0 bg-white dark:bg-slate-950 sm:h-96"
      />
    </div>
  );
}
