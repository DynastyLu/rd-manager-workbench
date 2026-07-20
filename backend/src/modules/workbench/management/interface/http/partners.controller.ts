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
} from '@nestjs/common';
import { PartnersService } from '../../application/partners.service';
import {
  CreateCommunicationDto,
  CreatePartnerAgreementDto,
  CreatePartnerContactDto,
  CreatePartnerDto,
  CreatePartnerProjectDto,
  CreateSourceTaskDto,
  ListCommunicationsQueryDto,
  ListPartnersQueryDto,
  UpdateCommunicationDto,
  UpdatePartnerAgreementDto,
  UpdatePartnerContactDto,
  UpdatePartnerDto,
} from './dto/management.dto';

@Controller('partners')
export class PartnersController {
  constructor(private readonly service: PartnersService) {}

  @Get()
  list(@Query() query: ListPartnersQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreatePartnerDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('id') id: string) {
    await this.service.archive(id);
  }

  @Post(':id/projects/:projectId')
  linkProject(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreatePartnerProjectDto,
  ) {
    return this.service.linkProject(id, projectId, dto);
  }

  @Delete(':id/projects/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkProject(@Param('id') id: string, @Param('projectId') projectId: string) {
    await this.service.unlinkProject(id, projectId);
  }

  @Post(':id/contacts')
  createContact(@Param('id') id: string, @Body() dto: CreatePartnerContactDto) {
    return this.service.createContact(id, dto);
  }

  @Patch(':id/contacts/:childId')
  updateContact(
    @Param('id') id: string,
    @Param('childId') childId: string,
    @Body() dto: UpdatePartnerContactDto,
  ) {
    return this.service.updateContact(id, childId, dto);
  }

  @Delete(':id/contacts/:childId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveContact(@Param('id') id: string, @Param('childId') childId: string) {
    await this.service.archiveContact(id, childId);
  }

  @Post(':id/agreements')
  createAgreement(@Param('id') id: string, @Body() dto: CreatePartnerAgreementDto) {
    return this.service.createAgreement(id, dto);
  }

  @Patch(':id/agreements/:childId')
  updateAgreement(
    @Param('id') id: string,
    @Param('childId') childId: string,
    @Body() dto: UpdatePartnerAgreementDto,
  ) {
    return this.service.updateAgreement(id, childId, dto);
  }

  @Delete(':id/agreements/:childId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveAgreement(@Param('id') id: string, @Param('childId') childId: string) {
    await this.service.archiveAgreement(id, childId);
  }

  @Get(':id/communications')
  listCommunications(@Param('id') id: string, @Query() query: ListCommunicationsQueryDto) {
    return this.service.listCommunications(id, query);
  }

  @Post(':id/communications')
  createCommunication(@Param('id') id: string, @Body() dto: CreateCommunicationDto) {
    return this.service.createCommunication(id, dto);
  }

  @Patch(':id/communications/:childId')
  updateCommunication(
    @Param('id') id: string,
    @Param('childId') childId: string,
    @Body() dto: UpdateCommunicationDto,
  ) {
    return this.service.updateCommunication(id, childId, dto);
  }

  @Delete(':id/communications/:childId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archiveCommunication(@Param('id') id: string, @Param('childId') childId: string) {
    await this.service.archiveCommunication(id, childId);
  }
}

@Controller('communications')
export class CommunicationsController {
  constructor(private readonly service: PartnersService) {}

  @Post(':id/task')
  createTask(@Param('id') id: string, @Body() dto: CreateSourceTaskDto) {
    return this.service.createTaskForCommunication(id, dto);
  }
}
