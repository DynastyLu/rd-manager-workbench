import { GeneratedFileEntity } from './generated-file.entity';

export interface CreateGeneratedFileInput {
  jobId: string;
  kind: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
}

export abstract class GeneratedFileRepository {
  abstract create(input: CreateGeneratedFileInput): Promise<GeneratedFileEntity>;
  abstract findById(id: string): Promise<GeneratedFileEntity | null>;
}
