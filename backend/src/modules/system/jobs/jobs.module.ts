import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { CreateJobUseCase } from './application/create-job.use-case';
import { GetJobUseCase } from './application/get-job.use-case';
import { GeneratedFileRepository } from './domain/generated-file.repository';
import { JobRepository } from './domain/job.repository';
import { InMemoryGeneratedFileRepository } from './infrastructure/in-memory-generated-file.repository';
import { InMemoryJobRepository } from './infrastructure/in-memory-job.repository';
import { PrismaGeneratedFileRepository } from './infrastructure/prisma-generated-file.repository';
import { PrismaJobRepository } from './infrastructure/prisma-job.repository';
import { FilesController } from './interface/http/files.controller';
import { JobsController } from './interface/http/jobs.controller';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [JobsController, FilesController],
  providers: [
    CreateJobUseCase,
    GetJobUseCase,
    InMemoryJobRepository,
    InMemoryGeneratedFileRepository,
    PrismaJobRepository,
    PrismaGeneratedFileRepository,
    {
      provide: JobRepository,
      useFactory: (
        inMemoryRepository: InMemoryJobRepository,
        prismaRepository: PrismaJobRepository,
      ) => (shouldUseInMemoryPersistence() ? inMemoryRepository : prismaRepository),
      inject: [InMemoryJobRepository, PrismaJobRepository],
    },
    {
      provide: GeneratedFileRepository,
      useFactory: (
        inMemoryRepository: InMemoryGeneratedFileRepository,
        prismaRepository: PrismaGeneratedFileRepository,
      ) => (shouldUseInMemoryPersistence() ? inMemoryRepository : prismaRepository),
      inject: [InMemoryGeneratedFileRepository, PrismaGeneratedFileRepository],
    },
  ],
  exports: [CreateJobUseCase, GetJobUseCase, JobRepository, GeneratedFileRepository],
})
export class JobsModule {}

function shouldUseInMemoryPersistence() {
  return !process.env.DATABASE_URL?.trim();
}
