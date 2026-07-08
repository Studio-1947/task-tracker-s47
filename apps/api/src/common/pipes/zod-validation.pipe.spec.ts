import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value for valid input', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ email: 'a@b.com', age: 21 })).toEqual({ email: 'a@b.com', age: 21 });
  });

  it('throws BadRequestException with field-level details for invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ email: 'nope', age: -1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res = (err as BadRequestException).getResponse() as {
        message: string;
        details: Record<string, string[]>;
      };
      expect(res.message).toBe('Validation failed');
      expect(res.details.email).toBeDefined();
      expect(res.details.age).toBeDefined();
    }
  });
});
