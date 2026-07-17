import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const context = this.requestContextService.createContext({
      traceId: headerAsString(req.headers['x-trace-id']),
      sourceIp: req.ip,
      requestHeaders: req.headers,
    });

    this.requestContextService.run(context, () => {
      req['requestContext'] = context;
      next();
    });
  }
}

function headerAsString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
