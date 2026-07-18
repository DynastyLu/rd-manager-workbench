import { HttpStatus, Injectable } from '@nestjs/common';
import { DecisionStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { AppError } from '../../../../shared/errors/app-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';
import { TasksService } from '../../tasks/application/tasks.service';
import { CreateDecisionDto, CreateSourceTaskDto, ListDecisionsQueryDto, UpdateDecisionDto } from '../interface/http/dto/management.dto';
import { ManagementReferenceService } from './management-reference.service';

@Injectable()
export class DecisionsService {
  constructor(private readonly prisma: PlatformPrismaService, private readonly references: ManagementReferenceService, private readonly tasks: TasksService) {}
  async list(query: ListDecisionsQueryDto) { const page=query.page??1, pageSize=Math.min(query.pageSize??20,100); const where={archivedAt:null,...(query.projectId?{projectId:query.projectId}:{}),...(query.status?{status:query.status}:{})}; const [data,total]=await this.prisma.$transaction([this.prisma.decision.findMany({where,orderBy:[{updatedAt:'desc'},{id:'desc'}],skip:(page-1)*pageSize,take:pageSize}),this.prisma.decision.count({where})]); return {data,meta:{page,pageSize,total}}; }
  async get(id:string) { const entity=await this.prisma.decision.findFirst({where:{id,archivedAt:null}}); if(!entity) throw this.notFound(); return entity; }
  async create(dto:CreateDecisionDto) { return this.prisma.$transaction(async tx=>{await this.references.assertReference(tx,dto); if(dto.meetingId) await this.references.assertActiveMeeting(tx,dto.meetingId); return tx.decision.create({data:{...this.fields(dto),alternatives:dto.alternatives,status:dto.status??DecisionStatus.DRAFT,decidedAt:dto.status===DecisionStatus.DECIDED?new Date():null} as any});}); }
  async update(id:string,dto:UpdateDecisionDto) { return this.prisma.$transaction(async tx=>{const old=await tx.decision.findFirst({where:{id,archivedAt:null}});if(!old)throw this.notFound();const refs={projectId:dto.projectId??old.projectId??undefined,milestoneId:dto.milestoneId??old.milestoneId??undefined,taskId:dto.taskId??old.taskId??undefined};await this.references.assertReference(tx,refs);const meetingId=dto.meetingId??old.meetingId??undefined;if(meetingId)await this.references.assertActiveMeeting(tx,meetingId);const status=dto.status??old.status;return tx.decision.update({where:{id},data:{...this.fields(dto),...refs,meetingId,status,...(dto.alternatives?{alternatives:dto.alternatives}:{}),decidedAt:status===DecisionStatus.DECIDED?(old.decidedAt??new Date()):null}});}); }
  async archive(id:string){const result=await this.prisma.decision.updateMany({where:{id,archivedAt:null},data:{archivedAt:new Date()}});if(!result.count)throw this.notFound();}
  async createFollowUpTask(id:string,input:CreateSourceTaskDto){return this.prisma.$transaction(async tx=>{const decision=await tx.decision.findFirst({where:{id,archivedAt:null}});if(!decision)throw this.notFound();return this.tasks.createTaskInTransaction(tx,{...input,projectId:input.projectId??decision.projectId??undefined,sourceType:'DECISION',sourceId:decision.id});});}
  private fields(dto:Partial<CreateDecisionDto>){return {...(dto.title!==undefined?{title:dto.title}:{}),...(dto.background!==undefined?{background:dto.background}:{}),...(dto.basis!==undefined?{basis:dto.basis}:{}),...(dto.conclusion!==undefined?{conclusion:dto.conclusion}:{}),...(dto.participantNames!==undefined?{participantNames:dto.participantNames}:{}),...(dto.projectId!==undefined?{projectId:dto.projectId}:{}),...(dto.milestoneId!==undefined?{milestoneId:dto.milestoneId}:{}),...(dto.taskId!==undefined?{taskId:dto.taskId}:{})}};
  private notFound(){return new AppError({code:ErrorCodes.DECISION_NOT_FOUND,message:'Decision not found',statusCode:HttpStatus.NOT_FOUND});}
}
