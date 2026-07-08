import { describe, expect, it } from 'vitest';
import { generateTempPassword, randomToken } from './password';

describe('generateTempPassword', () => {
  it('produces a non-trivial, unique-ish password each call', () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(a).not.toEqual(b);
    // two capitalized words, digits, and a trailing symbol
    expect(a).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}[!@#$%]$/);
  });
});

describe('randomToken', () => {
  it('returns hex of the requested byte length', () => {
    expect(randomToken(16)).toMatch(/^[0-9a-f]{32}$/);
  });
});
