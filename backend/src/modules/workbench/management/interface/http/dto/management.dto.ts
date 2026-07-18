import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { AgreementStatus, CommunicationType, DecisionStatus, IssueStatus, MeetingActionStatus, MeetingStatus, RiskImpact, RiskLevel, RiskLikelihood, RiskStatus, TaskPriority } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const strings = ({ value }: { value: unknown }) => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item.trim() : item) : value;

export class PageQueryDto {
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(1) page?: number;
  @Transform(({ value }) => Number(value)) @IsOptional() @IsInt() @Min(1) pageSize?: number;
}
export class ProjectFilterDto extends PageQueryDto {
  @Transform(trim) @IsOptional() @IsString() @IsNotEmpty() projectId?: string;
}
export class CreateRiskDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @IsEnum(RiskLikelihood) likelihood!: RiskLikelihood;
  @IsEnum(RiskImpact) impact!: RiskImpact;
  @IsEnum(RiskLevel) level!: RiskLevel;
  @Transform(trim) @IsOptional() @IsString() description?: string;
  @Transform(trim) @IsOptional() @IsString() mitigation?: string;
  @Transform(trim) @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsEnum(RiskStatus) status?: RiskStatus;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() milestoneId?: string;
  @Transform(trim) @IsOptional() @IsString() taskId?: string;
}
export class UpdateRiskDto extends CreateRiskDto {}
export class ListRisksQueryDto extends ProjectFilterDto {
  @IsOptional() @IsEnum(RiskStatus) status?: RiskStatus;
  @IsOptional() @IsEnum(RiskLevel) level?: RiskLevel;
}
export class CreateIssueDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(trim) @IsOptional() @IsString() description?: string;
  @Transform(trim) @IsOptional() @IsString() impactObject?: string;
  @Transform(trim) @IsOptional() @IsString() proposedResolution?: string;
  @Transform(trim) @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @Transform(trim) @IsOptional() @IsString() verificationResult?: string;
  @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() milestoneId?: string;
  @Transform(trim) @IsOptional() @IsString() taskId?: string;
}
export class UpdateIssueDto extends CreateIssueDto {}
export class ListIssuesQueryDto extends ProjectFilterDto { @IsOptional() @IsEnum(IssueStatus) status?: IssueStatus; @Transform(({ value }) => value === 'true') @IsOptional() overdue?: boolean; }
export class CreateDecisionDto {
  @Transform(trim) @IsString() @IsNotEmpty() title!: string;
  @Transform(strings) @IsArray() @ArrayUnique() @IsString({ each: true }) @IsNotEmpty({ each: true }) alternatives!: string[];
  @Transform(trim) @IsOptional() @IsString() background?: string;
  @Transform(trim) @IsOptional() @IsString() basis?: string;
  @Transform(trim) @IsOptional() @IsString() conclusion?: string;
  @Transform(strings) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) @IsNotEmpty({ each: true }) participantNames?: string[];
  @IsOptional() @IsEnum(DecisionStatus) status?: DecisionStatus;
  @Transform(trim) @IsOptional() @IsString() projectId?: string;
  @Transform(trim) @IsOptional() @IsString() milestoneId?: string;
  @Transform(trim) @IsOptional() @IsString() taskId?: string;
  @Transform(trim) @IsOptional() @IsString() meetingId?: string;
}
export class UpdateDecisionDto extends CreateDecisionDto {}
export class ListDecisionsQueryDto extends ProjectFilterDto { @IsOptional() @IsEnum(DecisionStatus) status?: DecisionStatus; }
export class CreatePartnerDto { @Transform(trim) @IsString() @IsNotEmpty() name!: string; @Transform(trim) @IsOptional() @IsString() shortName?: string; @Transform(trim) @IsOptional() @IsString() category?: string; @Transform(trim) @IsOptional() @IsString() address?: string; @Transform(trim) @IsOptional() @IsString() notes?: string; }
export class UpdatePartnerDto extends CreatePartnerDto {}
export class CreatePartnerContactDto { @Transform(trim) @IsString() @IsNotEmpty() name!: string; @Transform(trim) @IsOptional() @IsString() title?: string; @Transform(trim) @IsOptional() @IsString() phone?: string; @Transform(trim) @IsOptional() @IsString() email?: string; @Transform(trim) @IsOptional() @IsString() notes?: string; }
export class UpdatePartnerContactDto extends CreatePartnerContactDto {}
export class CreatePartnerAgreementDto { @Transform(trim) @IsString() @IsNotEmpty() title!: string; @Transform(trim) @IsOptional() @IsString() agreementNo?: string; @IsOptional() @IsEnum(AgreementStatus) status?: AgreementStatus; @IsOptional() @IsDateString() startAt?: string; @IsOptional() @IsDateString() endAt?: string; @Transform(trim) @IsOptional() @IsString() notes?: string; }
export class UpdatePartnerAgreementDto extends CreatePartnerAgreementDto {}
export class CreateCommunicationDto { @IsEnum(CommunicationType) type!: CommunicationType; @IsDateString() occurredAt!: string; @Transform(trim) @IsString() @IsNotEmpty() subject!: string; @Transform(trim) @IsOptional() @IsString() projectId?: string; @Transform(trim) @IsOptional() @IsString() contactId?: string; @Transform(trim) @IsOptional() @IsString() summary?: string; @Transform(trim) @IsOptional() @IsString() promises?: string; @Transform(trim) @IsOptional() @IsString() ownerName?: string; @IsOptional() @IsDateString() nextFollowUpAt?: string; }
export class UpdateCommunicationDto extends CreateCommunicationDto {}
export class ListCommunicationsQueryDto extends PageQueryDto { @IsOptional() @IsDateString() nextFollowUpBefore?: string; }
export class ListMeetingsQueryDto extends ProjectFilterDto {
  @IsOptional() @IsEnum(MeetingStatus) status?: MeetingStatus;
  @IsOptional() @IsDateString() startFrom?: string;
  @IsOptional() @IsDateString() startTo?: string;
}
export class CreateMeetingDto { @Transform(trim) @IsString() @IsNotEmpty() title!: string; @IsDateString() scheduledAt!: string; @Transform(trim) @IsOptional() @IsString() projectId?: string; @IsOptional() @IsDateString() heldAt?: string; @IsOptional() @IsEnum(MeetingStatus) status?: MeetingStatus; @Transform(trim) @IsOptional() @IsString() agenda?: string; @Transform(trim) @IsOptional() @IsString() minutes?: string; @Transform(strings) @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) @IsNotEmpty({ each: true }) participantNames?: string[]; }
export class UpdateMeetingDto extends CreateMeetingDto {}
export class CreateMeetingActionDto { @Transform(trim) @IsString() @IsNotEmpty() title!: string; @Transform(trim) @IsOptional() @IsString() description?: string; @Transform(trim) @IsOptional() @IsString() ownerName?: string; @IsOptional() @IsDateString() dueAt?: string; @IsOptional() @IsEnum(MeetingActionStatus) status?: MeetingActionStatus; }
export class UpdateMeetingActionDto extends CreateMeetingActionDto {}
export class CreateMeetingAgendaItemDto { @Transform(trim) @IsString() @IsNotEmpty() title!: string; @Transform(trim) @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() sequence?: number; }
export class CreateSourceTaskDto { @Transform(trim) @IsString() @IsNotEmpty() title!: string; @Transform(trim) @IsOptional() @IsString() description?: string; @Transform(trim) @IsOptional() @IsString() projectId?: string; @Transform(trim) @IsOptional() @IsString() assigneeName?: string; @IsOptional() @IsDateString() dueAt?: string; @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority; }
