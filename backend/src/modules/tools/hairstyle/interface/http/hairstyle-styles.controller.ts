import { Controller, Get } from '@nestjs/common';
import { HairstyleTransformService } from '../../../../../workers/ocr/services/hairstyle-transform.service';

@Controller('hairstyle/styles')
export class HairstyleStylesController {
  constructor(private readonly hairstyleTransformService: HairstyleTransformService) {}

  @Get()
  list() {
    return this.hairstyleTransformService.listStyles();
  }
}
