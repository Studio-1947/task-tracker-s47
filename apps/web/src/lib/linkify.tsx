import type { ReactNode } from 'react';

/**
 * Bare URLs in user-typed text (comments, chat). Matches http(s) only — the same
 * rule the link-attachment API enforces — so `javascript:`/`data:` text can never
 * become a live href.
 */
const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

/** Trailing punctuation that reads as sentence structure, not part of the URL. */
const TRAILING = /[.,;:!?]+$/;

/**
 * Split a matched URL into the href and any trailing punctuation that belongs to
 * the sentence. Also balances a trailing ")" — "(see https://x.com/a)" should not
 * swallow the closing paren, but "https://x.com/a_(b)" should keep it.
 */
function trimUrl(match: string): { href: string; tail: string } {
  let href = match;
  let tail = '';

  const punct = href.match(TRAILING);
  if (punct) {
    tail = punct[0] + tail;
    href = href.slice(0, -punct[0].length);
  }

  while (href.endsWith(')') && (href.match(/\)/g)?.length ?? 0) > (href.match(/\(/g)?.length ?? 0)) {
    tail = ')' + tail;
    href = href.slice(0, -1);
  }

  return { href, tail };
}

/**
 * Link styling on a neutral surface (comments, other people's message bubbles).
 */
export const LINK_ON_SURFACE =
  'text-indigo-600 decoration-indigo-300 hover:text-indigo-700 hover:decoration-indigo-500 dark:text-indigo-400 dark:decoration-indigo-500/50 dark:hover:text-indigo-300';

/**
 * Link styling on a saturated accent surface — your own chat bubble, which is an
 * indigo→violet gradient in BOTH themes. The default indigo would render the link
 * in almost exactly the bubble's own colour, so it must be light and theme-fixed
 * (no `dark:` variants: the background doesn't change between themes).
 */
export const LINK_ON_ACCENT = 'text-white decoration-white/60 hover:decoration-white';

/**
 * Turn bare URLs in plain text into clickable links. Input is rendered as text
 * nodes throughout — never dangerouslySetInnerHTML — so user content cannot
 * inject markup.
 *
 * `className` styles the anchor; pass LINK_ON_ACCENT when the text sits on a
 * coloured background. `[overflow-wrap:anywhere]` lets a long URL break mid-token:
 * plain `break-words` wraps visually but does NOT shrink min-content width, so
 * inside a flex row it would stretch the container instead of wrapping.
 */
export function linkify(
  text: string,
  { keyPrefix = 'l', className = LINK_ON_SURFACE }: { keyPrefix?: string; className?: string } = {},
): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0 || !/^https?:\/\//i.test(part)) return <span key={`${keyPrefix}${i}`}>{part}</span>;

    const { href, tail } = trimUrl(part);
    return (
      <span key={`${keyPrefix}${i}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`font-medium underline underline-offset-2 [overflow-wrap:anywhere] ${className}`}
          // Comments/messages can sit inside a clickable row — don't trigger it.
          onClick={(e) => e.stopPropagation()}
        >
          {href}
        </a>
        {tail}
      </span>
    );
  });
}
