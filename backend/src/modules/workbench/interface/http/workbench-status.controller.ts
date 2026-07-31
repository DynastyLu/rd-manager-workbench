import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../iam/interface/http/public.decorator';

@Controller('workbench')
export class WorkbenchStatusController {
  @Get('status')
  @Public()
  status() {
    return {
      mode: 'local',
      database: 'postgresql',
    };
  }
}
