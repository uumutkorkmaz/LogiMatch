import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { InvalidTransitionError, CurrencyMismatchError } from '@logimatch/shared';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { DomainError, mapPersistenceError } from './errors';

interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId?: string;
  errors?: { path: string; message: string }[];
  [k: string]: unknown;
}

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** Tüm hataları RFC 7807 application/problem+json olarak döner. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const problem = this.toProblem(exception, req);
    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId: problem.requestId }, 'Unhandled error');
      if (process.env.NODE_ENV === 'test') console.error(exception);
    }
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  toProblem(exception: unknown, req: Request & { id?: string }): Problem {
    const base = (status: number, code: string, detail: string): Problem => ({
      type: `https://logimatch.app/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      instance: req.originalUrl ?? req.url,
      code,
      requestId: typeof req.id === 'string' ? req.id : undefined,
    });

    if (exception instanceof DomainError) {
      return { ...base(exception.status, exception.code, exception.message), ...exception.details };
    }
    if (exception instanceof ZodValidationException || exception instanceof ZodError) {
      const zerr = exception instanceof ZodError ? exception : exception.getZodError();
      return {
        ...base(400, 'VALIDATION_FAILED', 'İstek doğrulanamadı'),
        errors: zerr.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (exception instanceof InvalidTransitionError) {
      return {
        ...base(409, exception.code, exception.message),
        from: exception.from,
        event: exception.event,
      };
    }
    if (exception instanceof CurrencyMismatchError) {
      return base(422, 'CURRENCY_MISMATCH', exception.message);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
      const code =
        status === 429
          ? 'RATE_LIMITED'
          : status === 404
            ? 'ROUTE_NOT_FOUND'
            : status === 413
              ? 'PAYLOAD_TOO_LARGE'
              : `HTTP_${status}`;
      return base(status, code, detail);
    }
    const mapped = mapPersistenceError(exception);
    if (mapped) return { ...base(mapped.status, mapped.code, mapped.message), ...mapped.details };
    return base(500, 'INTERNAL_ERROR', 'Beklenmeyen bir hata oluştu');
  }
}
