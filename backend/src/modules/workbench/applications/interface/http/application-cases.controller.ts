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
import { RequirePermissions } from '../../../../iam/interface/http/permissions.decorator';
import { ApplicationsService } from '../../application/applications.service';
import {
  CreateApplicationCaseDto,
  ListApplicationCasesQueryDto,
  UpdateApplicationCaseDto,
} from './dto/application-case.dto';
import {
  CreateApplicationMaterialDto,
  CreateApplicationRequirementDto,
  CreateCorrectionRecordDto,
  CreateEvidenceRecordDto,
  CreateMaterialVersionDto,
  CreateSubmissionRecordDto,
  UpdateApplicationNodeDto,
  UpdateApplicationRequirementDto,
} from './dto/application-workspace.dto';

@Controller('application-cases')
export class ApplicationCasesController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @RequirePermissions('application.manage')
  create(@Body() dto: CreateApplicationCaseDto) {
    return this.applicationsService.createCase(dto);
  }

  @Get()
  @RequirePermissions('application.read')
  list(@Query() query: ListApplicationCasesQueryDto) {
    return this.applicationsService.listCases(query);
  }

  @Get(':id')
  @RequirePermissions('application.read')
  get(@Param('id') id: string) {
    return this.applicationsService.getCase(id);
  }

  @Patch(':id')
  @RequirePermissions('application.manage')
  update(@Param('id') id: string, @Body() dto: UpdateApplicationCaseDto) {
    return this.applicationsService.updateCase(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('application.manage')
  async archive(@Param('id') id: string): Promise<void> {
    await this.applicationsService.archiveCase(id);
  }

  @Patch(':caseId/nodes/:nodeId')
  @RequirePermissions('application.manage')
  updateNode(
    @Param('caseId') caseId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateApplicationNodeDto,
  ) {
    return this.applicationsService.updateNode(caseId, nodeId, dto);
  }

  @Post(':caseId/requirements')
  @RequirePermissions('application.manage')
  createRequirement(@Param('caseId') caseId: string, @Body() dto: CreateApplicationRequirementDto) {
    return this.applicationsService.createRequirement(caseId, dto);
  }

  @Patch(':caseId/requirements/:requirementId')
  @RequirePermissions('application.manage')
  updateRequirement(
    @Param('caseId') caseId: string,
    @Param('requirementId') requirementId: string,
    @Body() dto: UpdateApplicationRequirementDto,
  ) {
    return this.applicationsService.updateRequirement(caseId, requirementId, dto);
  }

  @Post(':caseId/materials')
  @RequirePermissions('application.manage')
  createMaterial(@Param('caseId') caseId: string, @Body() dto: CreateApplicationMaterialDto) {
    return this.applicationsService.createMaterial(caseId, dto);
  }

  @Post(':caseId/materials/:materialId/versions')
  @RequirePermissions('application.manage')
  createMaterialVersion(
    @Param('caseId') caseId: string,
    @Param('materialId') materialId: string,
    @Body() dto: CreateMaterialVersionDto,
  ) {
    return this.applicationsService.createMaterialVersion(caseId, materialId, dto);
  }

  @Post(':caseId/evidence-records')
  @RequirePermissions('application.manage')
  createEvidence(@Param('caseId') caseId: string, @Body() dto: CreateEvidenceRecordDto) {
    return this.applicationsService.createEvidence(caseId, dto);
  }

  @Post(':caseId/corrections')
  @RequirePermissions('application.manage')
  createCorrection(@Param('caseId') caseId: string, @Body() dto: CreateCorrectionRecordDto) {
    return this.applicationsService.createCorrection(caseId, dto);
  }

  @Post(':caseId/submissions')
  @RequirePermissions('application.manage')
  createSubmission(@Param('caseId') caseId: string, @Body() dto: CreateSubmissionRecordDto) {
    return this.applicationsService.createSubmission(caseId, dto);
  }
}
