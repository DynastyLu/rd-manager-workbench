import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { RequestContextService } from '../../infrastructure/context/request-context.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly requestContextService: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = this.requestContextService.getContext()?.traceId;

    if (exception instanceof AppError) {
      response.status(exception.statusCode).json({
        success: false,
        traceId,
        path: request.url,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = exception.getResponse();
      const isStructuredResponse = typeof responseBody === 'object' && responseBody !== null;
      const responsePayload = isStructuredResponse
        ? (responseBody as Record<string, unknown>)
        : { message: String(responseBody) };

      const message =
        typeof responsePayload.message === 'string'
          ? responsePayload.message
          : Array.isArray(responsePayload.message)
            ? 'Validation failed'
            : exception.message;

      response.status(status).json({
        success: false,
        traceId,
        path: request.url,
        error: {
          code: status >= HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
          message,
          details: isStructuredResponse ? responsePayload : undefined,
        },
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      traceId,
      path: request.url,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error',
      },
    });
  }
}
