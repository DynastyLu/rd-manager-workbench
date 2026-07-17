import { Global, Module } from '@nestjs/common';

/**
 * Queue boundary retained for future local workbench jobs. v1 deliberately
 * supplies no transport, so starting the API never requires Redis.
 */
@Global()
@Module({})
export class QueueInfrastructureModule {}
