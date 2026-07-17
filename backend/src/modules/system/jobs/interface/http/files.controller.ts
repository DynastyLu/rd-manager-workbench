import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { StoragePort } from '../../../../../infrastructure/storage/storage.port';
import { GeneratedFileRepository } from '../../domain/generated-file.repository';

@Controller('files')
export class FilesController {
  constructor(
    private readonly generatedFileRepository: GeneratedFileRepository,
    private readonly storage: StoragePort,
  ) {}

  @Get(':fileId/download')
  async download(@Param('fileId') fileId: string, @Res() response: Response) {
    const file = await this.generatedFileRepository.findById(fileId);
    if (!file) {
      throw new NotFoundException(`File not found: ${fileId}`);
    }

    const storedFile = await this.storage.read(file.storageKey);
    response.setHeader('Content-Type', file.mimeType || storedFile.mimeType);
    response.setHeader('Content-Length', storedFile.content.length);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    );
    return response.send(storedFile.content);
  }
}
