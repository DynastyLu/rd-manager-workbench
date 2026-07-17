import { Module } from '@nestjs/common';
import { AiAssistantMockService } from './ai-assistant-mock.service';
import { AiAssistantMockController } from './interface/http/ai-assistant-mock.controller';

@Module({
  controllers: [AiAssistantMockController],
  providers: [AiAssistantMockService],
})
export class AiAssistantMockModule {}
