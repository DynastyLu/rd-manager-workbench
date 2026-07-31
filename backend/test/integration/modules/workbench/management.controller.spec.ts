import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataScope, PrismaClient } from '@prisma/client';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { PERMISSIONS } from '../../../../src/modules/iam/domain/permission-catalog';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';
import { authenticatedRequest } from '../../../helpers/authenticated-request';

describe('Management loop API', () => {
  const prisma = new PrismaClient(); const prefix = `TEST-MGMT-${Date.now()}`; let app: INestApplication; let authenticated: Awaited<ReturnType<typeof authenticatedRequest>>; let projectId = '';
  beforeAll(async () => { const { AppModule } = await import('../../../../src/app.module'); const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication({ bodyParser: false }); configureBodyParser(app); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist:true, transform:true, forbidNonWhitelisted:true })); app.useGlobalFilters(app.get(HttpExceptionFilter)); app.useGlobalInterceptors(app.get(ResponseInterceptor)); await app.init(); authenticated = await authenticatedRequest(app, prisma, `${prefix}-ROLE`, [{ code: PERMISSIONS.RISK_READ, dataScope: DataScope.ALL }, { code: PERMISSIONS.RISK_CREATE, dataScope: DataScope.ALL }, { code: PERMISSIONS.RISK_UPDATE, dataScope: DataScope.ALL }, { code: PERMISSIONS.MEETING_READ, dataScope: DataScope.ALL }, { code: PERMISSIONS.MEETING_CREATE, dataScope: DataScope.ALL }, { code: PERMISSIONS.MEETING_UPDATE, dataScope: DataScope.ALL }, { code: PERMISSIONS.TASK_CREATE, dataScope: DataScope.ALL }]); projectId=(await prisma.project.create({data:{code:`${prefix}-P`,name:prefix}})).id; });
  afterAll(async()=>{await prisma.fileAsset.deleteMany({where:{name:{startsWith:prefix}}});await prisma.contentDocument.deleteMany({where:{title:{startsWith:prefix}}});await prisma.meetingAction.deleteMany({where:{meeting:{title:{startsWith:prefix}}}});await prisma.meeting.deleteMany({where:{title:{startsWith:prefix}}});await prisma.workTask.deleteMany({where:{title:{startsWith:prefix}}});await prisma.risk.deleteMany({where:{title:{startsWith:prefix}}});await prisma.project.deleteMany({where:{code:{startsWith:prefix}}});if(authenticated){await prisma.loginAudit.deleteMany({where:{userId:authenticated.user.id}});await prisma.authSession.deleteMany({where:{userId:authenticated.user.id}});await prisma.userRole.deleteMany({where:{userId:authenticated.user.id}});await prisma.rolePermission.deleteMany({where:{roleId:authenticated.role.id}});await prisma.user.delete({where:{id:authenticated.user.id}});await prisma.role.delete({where:{id:authenticated.role.id}});await prisma.resourceProfile.delete({where:{id:authenticated.employee.id}});}await prisma.$disconnect();await app.close();});
  it('persists high risks and recalculates the project health', async()=>{const response=await authenticated.agent.post('/api/risks').send({projectId,title:`${prefix} risk`,likelihood:'HIGH',impact:'CRITICAL',level:'CRITICAL'}).expect(201);expect(response.body.data.status).toBe('OPEN');const snapshot=await prisma.projectHealthSnapshot.findFirst({where:{projectId},orderBy:{calculatedAt:'desc'}});expect(snapshot?.health).toBe('RED');await authenticated.agent.patch(`/api/risks/${response.body.data.id}`).send({title:`${prefix} risk`,likelihood:'HIGH',impact:'CRITICAL',level:'CRITICAL',status:'CLOSED'}).expect(200);});
  it('filters meetings and converts one action to an idempotent source-traceable task', async()=>{
    const meeting=(await authenticated.agent.post('/api/meetings').send({projectId,title:`${prefix} meeting`,scheduledAt:'2026-08-01T00:00:00.000Z'}).expect(201)).body.data;
    await authenticated.agent.post('/api/meetings').send({title:`${prefix} outside range`,scheduledAt:'2026-09-01T00:00:00.000Z',status:'CANCELLED'}).expect(201);
    const filtered=await authenticated.agent.get('/api/meetings').query({projectId,status:'PLANNED',startFrom:'2026-08-01T00:00:00.000Z',startTo:'2026-08-31T23:59:59.999Z'}).expect(200);
    expect(filtered.body.data.data.map(({id}:{id:string})=>id)).toContain(meeting.id);
    expect(filtered.body.data.data).toEqual(expect.arrayContaining([expect.objectContaining({projectId,status:'PLANNED'})]));
    const minutes=await authenticated.agent.post(`/api/meetings/${meeting.id}/minutes-document`).expect(201);
    expect(minutes.body.data).toMatchObject({type:'MEETING_MINUTES',meetingId:meeting.id,projectId,title:`${prefix} meeting 会议纪要`});
    const repeatedMinutes=await authenticated.agent.post(`/api/meetings/${meeting.id}/minutes-document`).expect(201);
    expect(repeatedMinutes.body.data.id).toBe(minutes.body.data.id);
    const attachment=await prisma.fileAsset.create({data:{name:`${prefix} agenda.txt`,meetingId:meeting.id,versions:{create:{versionNumber:1,storageKey:`${prefix}-agenda`,originalName:'agenda.txt',mimeType:'text/plain',size:6,sha256:'a'.repeat(64)}}}});
    const detail=await authenticated.agent.get(`/api/meetings/${meeting.id}`).expect(200);
    expect(detail.body.data).toMatchObject({minutesDocument:{id:minutes.body.data.id},attachments:[{id:attachment.id,name:`${prefix} agenda.txt`,latestVersion:{versionNumber:1,originalName:'agenda.txt'}}]});
    const action=(await authenticated.agent.post(`/api/meetings/${meeting.id}/actions`).send({title:`${prefix} action`}).expect(201)).body.data;
    const first=await authenticated.agent.post(`/api/meeting-actions/${action.id}/task`).send({title:`${prefix} task`}).expect(201);
    expect(first.body.data).toMatchObject({alreadyExists:false,task:{sourceType:'MEETING_ACTION',sourceId:action.id}});
    const repeated=await authenticated.agent.post(`/api/meeting-actions/${action.id}/task`).send({title:'duplicate'}).expect(201);
    expect(repeated.body.data).toMatchObject({alreadyExists:true,task:{id:first.body.data.task.id,sourceType:'MEETING_ACTION',sourceId:action.id}});
    await expect(prisma.workTask.count({where:{sourceType:'MEETING_ACTION',sourceId:action.id}})).resolves.toBe(1);
  });
});
