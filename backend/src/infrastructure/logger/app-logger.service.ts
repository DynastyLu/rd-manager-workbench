import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class AppLoggerService extends ConsoleLogger implements LoggerService {
  constructor() {
    const serviceName = process.env.SERVICE_NAME || 'rd-manager-workbench';
    const instanceId = process.env.INSTANCE_ID || process.env.HOSTNAME || 'local-instance';
    super(`${serviceName}:${instanceId}`);
  }
}
