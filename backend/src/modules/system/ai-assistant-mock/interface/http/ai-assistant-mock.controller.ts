import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AiAssistantMockService } from '../../ai-assistant-mock.service';

@Controller(['sys', ':appId/sys', ':basePath/:appId/sys'])
export class AiAssistantMockController {
  constructor(private readonly aiAssistantMockService: AiAssistantMockService) {}

  @Post('knowledge/getList')
  listKnowledgeBases(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.listKnowledgeBases(body));
  }

  @Post('knowledge/addKnowledge')
  createKnowledgeBase(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.createKnowledgeBase(body));
  }

  @Post('knowledge/updateKnowledge')
  updateKnowledgeBase(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.updateKnowledgeBase(body));
  }

  @Post('knowledge/delKnowledge')
  deleteKnowledgeBase(@Query('knowledgeIdKey') knowledgeIdKey: string, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.deleteKnowledgeBase(knowledgeIdKey));
  }

  @Post('knowledgeFile/getList')
  listFiles(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.listFiles(body));
  }

  @Post('knowledgeFile/uploadFile')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: { originalname?: string } | undefined,
    @Res() response: Response,
  ) {
    return this.success(
      response,
      this.aiAssistantMockService.uploadFile({
        knowledgeIdKey: String(body.knowledgeIdKey || ''),
        fileName: file?.originalname || String(body.fileName || ''),
      }),
    );
  }

  @Post('knowledgeFile/delFile')
  deleteFile(
    @Query('fileIdKey') fileIdKey: string,
    @Query('knowledgeIdKey') knowledgeIdKey: string,
    @Res() response: Response,
  ) {
    return this.success(
      response,
      this.aiAssistantMockService.deleteFile({
        fileIdKey,
        knowledgeIdKey,
      }),
    );
  }

  @Get('knowledgeFile/downloadFile')
  downloadFile(@Query('fileIdKey') fileIdKey: string, @Res() response: Response) {
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.setHeader(
      'content-disposition',
      `attachment; filename="${encodeURIComponent(fileIdKey || 'mock-file')}.txt"`,
    );
    return response.status(200).send(`mock download content for ${fileIdKey || 'unknown file'}`);
  }

  @Post('knowledge/fileSearch')
  searchKnowledge(@Body() body: Record<string, unknown>, @Res() response: Response) {
    const result = this.aiAssistantMockService.searchKnowledge(body);
    return this.success(response, result.data, result.msg);
  }

  @Post('knowledgeSession/getList')
  listSessions(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.listSessions(body));
  }

  @Post('knowledgeSession/addSession')
  createSession(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.createSession(body));
  }

  @Get('knowledgeSession/getSessionDetail')
  getSessionDetail(@Query('sessionIdKey') sessionIdKey: string, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.getSessionDetail(sessionIdKey));
  }

  @Post('knowledgeSession/updateKnowledgeSession')
  updateSession(@Body() body: Record<string, unknown>, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.updateSession(body));
  }

  @Post('knowledgeSession/delKnowledgeSession')
  deleteSession(@Query('idKey') idKey: string, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.deleteSession(idKey));
  }

  @Get('knowledgeSession/clear')
  clearSession(@Query('idKey') idKey: string, @Res() response: Response) {
    return this.success(response, this.aiAssistantMockService.clearSession(idKey));
  }

  private success(response: Response, data: unknown, msg = 'success') {
    return response.status(200).json({
      code: 200,
      data,
      msg,
    });
  }
}
