import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Validates a request payload against a shared Zod schema and returns the parsed,
 * typed value. On failure it throws a BadRequestException whose response carries
 * field-level `details` — the global filter renders it into the standard error shape.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        const details: Record<string, string[]> = {};
        for (const issue of err.issues) {
          const key = issue.path.join('.') || '_';
          (details[key] ??= []).push(issue.message);
        }
        throw new BadRequestException({ message: 'Validation failed', details });
      }
      throw err;
    }
  }
}
