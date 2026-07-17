import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../kernel/request-context';

export const RequestContextDecorator = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext | undefined => {
    const request = context.switchToHttp().getRequest<Request & { requestContext?: RequestContext }>();
    return request.requestContext;
  },
);
