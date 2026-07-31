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
} from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from '../../application/documents.service';
import { KnowledgeSpacesService } from '../../application/knowledge-spaces.service';
import { RequirePermissions, PERMISSIONS } from '../../../../iam/interface/http/permissions.decorator';
import {
  CreateDocumentDto,
  CreateKnowledgeSpaceDto,
  ListDocumentsQueryDto,
  UpdateDocumentDto,
  UpdateKnowledgeSpaceDto,
} from './dto/content.dto';

@Controller('knowledge-spaces')
export class KnowledgeSpacesController {
  constructor(private readonly service: KnowledgeSpacesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENT_CREATE)
  create(@Body() dto: CreateKnowledgeSpaceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeSpaceDto) {
    return this.service.update(id, dto);
  }
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  list(@Query() query: ListDocumentsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DOCUMENT_CREATE)
  create(@Body() dto: CreateDocumentDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.service.update(id, dto);
  }

  @Delete('trash')
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  clearTrash() {
    return this.service.clearTrash();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  async trash(@Param('id') id: string) {
    await this.service.trash(id);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  async permanentDelete(@Param('id') id: string) {
    await this.service.permanentDelete(id);
  }

  @Get(':id/preview-html')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  async previewHtml(@Param('id') id: string, @Res() res: Response) {
    const result = await this.service.getPreviewHtml(id);
    if (result === 'not-pdf') {
      res.status(204).send();
      return;
    }
    if (!result) {
      res.status(500).json({ success: false, error: { message: 'PDF preview generation failed' } });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(result);
  }

  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.DOCUMENT_READ)
  listVersions(@Param('id') id: string) {
    return this.service.listVersions(id);
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  saveVersion(@Param('id') id: string) {
    return this.service.saveVersion(id);
  }

  @Post(':id/versions/:versionId/restore')
  @RequirePermissions(PERMISSIONS.DOCUMENT_UPDATE)
  restoreVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.service.restoreVersion(id, versionId);
  }
}
