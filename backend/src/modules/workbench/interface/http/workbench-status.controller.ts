import { Controller, Get } from '@nestjs/common';

@Controller('workbench')
export class WorkbenchStatusController {
  @Get('status')
  status() {
    return {
      mode: 'local',
      database: 'postgresql',
    };
  }
}
