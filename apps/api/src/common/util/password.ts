import { randomBytes, randomInt } from 'node:crypto';

const WORDS = [
  'amber', 'basil', 'cedar', 'delta', 'ember', 'flint', 'grove', 'hazel',
  'ivory', 'jade', 'koala', 'lunar', 'maple', 'nova', 'onyx', 'pearl',
  'quartz', 'raven', 'slate', 'topaz', 'umber', 'vivid', 'willow', 'zephyr',
];

/**
 * Human-relayable temp password (PRD §11.1) — two words + digits + symbol,
 * e.g. "Maple-Raven-7413!". Readable enough for an Admin to dictate once.
 */
export function generateTempPassword(): string {
  const w = () => {
    const word = WORDS[randomInt(WORDS.length)]!;
    return word.charAt(0).toUpperCase() + word.slice(1);
  };
  const digits = randomInt(1000, 9999);
  const symbol = '!@#$%'[randomInt(5)];
  return `${w()}-${w()}-${digits}${symbol}`;
}

/** Opaque random token (hex). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
