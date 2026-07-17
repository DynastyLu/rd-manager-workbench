import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { GeneratedFileEntity } from '../domain/generated-file.entity';
import {
  CreateGeneratedFileInput,
  GeneratedFileRepository,
} from '../domain/generated-file.repository';

@Injectable()
export class InMemoryGeneratedFileRepository extends GeneratedFileRepository {
  private readonly files = new Map<string, GeneratedFileEntity>();

  async create(input: CreateGeneratedFileInput): Promise<GeneratedFileEntity> {
    const file: GeneratedFileEntity = {
      id: randomUUID(),
      ...input,
      createdAt: new Date(),
    };
    this.files.set(file.id, file);
    return file;
  }

  async findById(id: string): Promise<GeneratedFileEntity | null> {
    return this.files.get(id) ?? null;
  }
}
