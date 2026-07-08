import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@task-tracker/shared';

/**
 * Global exception filter producing one consistent error envelope for every
 * endpoint (PRD §11.5): { statusCode, error, message, details? }.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';
    let details: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      error = exception.constructor.name.replace(/Exception$/, '');
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        message = typeof b.message === 'string' ? b.message : Array.isArray(b.message) ? b.message.join('; ') : message;
        if (b.details && typeof b.details === 'object') {
          details = b.details as Record<string, string[]>;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (statusCode >= 500) {
      this.logger.error(`${req.method} ${req.url} -> ${statusCode}: ${message}`, (exception as Error)?.stack);
      // Don't leak internal messages to clients.
      message = 'Internal server error';
    }

    const payload: ApiError = { statusCode, error, message, ...(details ? { details } : {}) };
    res.status(statusCode).json(payload);
  }
}
