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
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateKnowledgeSpaceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeSpaceDto) {
    return this.service.update(id, dto);
  }
}

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  list(@Query() query: ListDocumentsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async trash(@Param('id') id: string) {
    await this.service.trash(id);
  }

  @Get(':id/preview-html')
  async previewHtml(@Param('id') id: string, @Res() res: Response) {
    const html = await this.service.getPreviewHtml(id);
    if (!html) {
      res.status(404).json({ success: false, error: { message: 'No HTML preview available for this document' } });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Get(':id/versions')
  listVersions(@Param('id') id: string) {
    return this.service.listVersions(id);
  }

  @Post(':id/versions')
  saveVersion(@Param('id') id: string) {
    return this.service.saveVersion(id);
  }

  @Post(':id/versions/:versionId/restore')
  restoreVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.service.restoreVersion(id, versionId);
  }
}
