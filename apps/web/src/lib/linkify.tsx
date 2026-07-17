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
 * Turn bare URLs in plain text into clickable links. Input is rendered as text
 * nodes throughout — never dangerouslySetInnerHTML — so user content cannot
 * inject markup.
 */
export function linkify(text: string, keyPrefix = 'l'): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0 || !/^https?:\/\//i.test(part)) return <span key={`${keyPrefix}${i}`}>{part}</span>;

    const { href, tail } = trimUrl(part);
    return (
      <span key={`${keyPrefix}${i}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-700 hover:decoration-indigo-500 dark:text-indigo-400 dark:decoration-indigo-500/50 dark:hover:text-indigo-300"
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
