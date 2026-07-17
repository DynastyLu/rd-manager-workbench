import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Request, Response } from 'express'

interface ErrorDescriptor {
  code: string
  message: string
}

const ERROR_DESCRIPTORS: Readonly<Record<number, ErrorDescriptor>> = {
  [HttpStatus.BAD_REQUEST]: { code: 'BAD_REQUEST', message: 'Bad Request' },
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'Forbidden' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'Not Found' },
  [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: 'Conflict' },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'UNPROCESSABLE_ENTITY',
    message: 'Unprocessable Entity',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service Unavailable',
  },
}

const INTERNAL_SERVER_ERROR: ErrorDescriptor = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Internal Server Error',
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const descriptor =
      ERROR_DESCRIPTORS[status] ??
      (status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? INTERNAL_SERVER_ERROR
        : { code: `HTTP_${status}`, message: 'Request Failed' })

    response.status(status).json({
      success: false,
      error: descriptor,
      path: request.path,
      timestamp: new Date().toISOString(),
    })
  }
}
