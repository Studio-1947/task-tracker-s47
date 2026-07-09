import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@task-tracker/shared';
import { ErrorLogService } from '../../superdev/error-log.service';

/**
 * Global exception filter producing one consistent error envelope for every
 * endpoint (PRD §11.5): { statusCode, error, message, details? }.
 *
 * As a side effect it persists 5xx / unhandled errors to the error journal that
 * powers the super-dev "what is breaking" view. The sink is optional so the filter
 * still works when constructed outside the DI container (e.g. in unit tests).
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(@Optional() private readonly errorLog?: ErrorLogService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { user?: { id?: string } }>();

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

    // A genuine server fault is any 5xx EXCEPT an intentional 503 (e.g. maintenance
    // mode), which carries a user-facing message and must not be masked or journaled
    // — otherwise every blocked request would flood the error log.
    const isServerFault = statusCode >= 500 && statusCode !== HttpStatus.SERVICE_UNAVAILABLE;
    if (isServerFault) {
      const stack = (exception as Error)?.stack;
      this.logger.error(`${req.method} ${req.url} -> ${statusCode}: ${message}`, stack);
      // Persist for the super-dev console (best-effort; never throws).
      void this.errorLog?.record({
        statusCode,
        method: req.method,
        path: req.originalUrl ?? req.url,
        message,
        stack: stack ?? null,
        userId: req.user?.id ?? null,
      });
      // Don't leak internal messages to clients.
      message = 'Internal server error';
    }

    const payload: ApiError = { statusCode, error, message, ...(details ? { details } : {}) };
    res.status(statusCode).json(payload);
  }
}
