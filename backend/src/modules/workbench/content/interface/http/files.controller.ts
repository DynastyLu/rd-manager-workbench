import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FilesService, UploadedContentFile } from '../../application/files.service';
import { RequirePermissions, PERMISSIONS } from '../../../../iam/interface/http/permissions.decorator';
import {
  CreateFileDto,
  DownloadFileQueryDto,
  ListFilesQueryDto,
  UpdateFileDto,
} from './dto/files.dto';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const uploadOptions = { limits: { files: 1, fileSize: MAX_UPLOAD_BYTES } };

@Controller('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  list(@Query() query: ListFilesQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @RequirePermissions(PERMISSIONS.DOCUMENT_CREATE)
  create(@UploadedFile() file: UploadedContentFile | undefined, @Body() dto: CreateFileDto) {
    return this.service.create(file, dto);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  addVersion(@Param('id') id: string, @UploadedFile() file: UploadedContentFile | undefined) {
    return this.service.addVersion(id, file);
  }

  @Get(':id/download')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  async download(
    @Param('id') id: string,
    @Query() query: DownloadFileQueryDto,
    @Res() response: Response,
  ) {
    const { version, content } = await this.service.download(id, query.versionId);
    const encodedName = encodeURIComponent(version.originalName);
    const fallbackName = version.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    response.setHeader('Content-Type', version.mimeType);
    response.setHeader('Content-Length', content.length);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
    response.setHeader('ETag', `"${version.sha256}"`);
    response.status(HttpStatus.OK).send(content);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateFileDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  async trash(@Param('id') id: string) {
    await this.service.trash(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Post('batch')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE, PERMISSIONS.DOCUMENT_DELETE)
  async batch(@Body() dto: { ids: string[]; action: 'trash' | 'move'; spaceId?: string }) {
    if (dto.action === 'trash') {
      await Promise.all(dto.ids.map((id: string) => this.service.trash(id)));
      return { trashed: dto.ids.length };
    }
    if (dto.action === 'move') {
      await Promise.all(dto.ids.map((id: string) =>
        this.service.update(id, { spaceId: dto.spaceId ?? null } as UpdateFileDto),
      ));
      return { moved: dto.ids.length };
    }
    return { ok: false };
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  async permanentDelete(@Param('id') id: string) {
    await this.service.permanentDelete(id);
  }
}
