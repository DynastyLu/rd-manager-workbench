import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { configureBodyParser } from '../../../../src/bootstrap/body-parser';
import { HttpExceptionFilter } from '../../../../src/shared/filters/http-exception.filter';
import { ResponseInterceptor } from '../../../../src/shared/interceptors/response.interceptor';

describe('Management loop API', () => {
  const prisma = new PrismaClient(); const prefix = `TEST-MGMT-${Date.now()}`; let app: INestApplication; let projectId = '';
  beforeAll(async () => { const { AppModule } = await import('../../../../src/app.module'); const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication({ bodyParser: false }); configureBodyParser(app); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist:true, transform:true, forbidNonWhitelisted:true })); app.useGlobalFilters(app.get(HttpExceptionFilter)); app.useGlobalInterceptors(app.get(ResponseInterceptor)); await app.init(); projectId=(await prisma.project.create({data:{code:`${prefix}-P`,name:prefix}})).id; });
  afterAll(async()=>{await prisma.fileAsset.deleteMany({where:{name:{startsWith:prefix}}});await prisma.contentDocument.deleteMany({where:{title:{startsWith:prefix}}});await prisma.meetingAction.deleteMany({where:{meeting:{title:{startsWith:prefix}}}});await prisma.meeting.deleteMany({where:{title:{startsWith:prefix}}});await prisma.workTask.deleteMany({where:{title:{startsWith:prefix}}});await prisma.risk.deleteMany({where:{title:{startsWith:prefix}}});await prisma.project.deleteMany({where:{code:{startsWith:prefix}}});await prisma.$disconnect();await app.close();});
  it('persists high risks and recalculates the project health', async()=>{const response=await request(app.getHttpServer()).post('/api/risks').send({projectId,title:`${prefix} risk`,likelihood:'HIGH',impact:'CRITICAL',level:'CRITICAL'}).expect(201);expect(response.body.data.status).toBe('OPEN');const snapshot=await prisma.projectHealthSnapshot.findFirst({where:{projectId},orderBy:{calculatedAt:'desc'}});expect(snapshot?.health).toBe('RED');await request(app.getHttpServer()).patch(`/api/risks/${response.body.data.id}`).send({title:`${prefix} risk`,likelihood:'HIGH',impact:'CRITICAL',level:'CRITICAL',status:'CLOSED'}).expect(200);});
  it('filters meetings and converts one action to an idempotent source-traceable task', async()=>{
    const meeting=(await request(app.getHttpServer()).post('/api/meetings').send({projectId,title:`${prefix} meeting`,scheduledAt:'2026-08-01T00:00:00.000Z'}).expect(201)).body.data;
    await request(app.getHttpServer()).post('/api/meetings').send({title:`${prefix} outside range`,scheduledAt:'2026-09-01T00:00:00.000Z',status:'CANCELLED'}).expect(201);
    const filtered=await request(app.getHttpServer()).get('/api/meetings').query({projectId,status:'PLANNED',startFrom:'2026-08-01T00:00:00.000Z',startTo:'2026-08-31T23:59:59.999Z'}).expect(200);
    expect(filtered.body.data.data.map(({id}:{id:string})=>id)).toContain(meeting.id);
    expect(filtered.body.data.data).toEqual(expect.arrayContaining([expect.objectContaining({projectId,status:'PLANNED'})]));
    const minutes=await request(app.getHttpServer()).post(`/api/meetings/${meeting.id}/minutes-document`).expect(201);
    expect(minutes.body.data).toMatchObject({type:'MEETING_MINUTES',meetingId:meeting.id,projectId,title:`${prefix} meeting 会议纪要`});
    const repeatedMinutes=await request(app.getHttpServer()).post(`/api/meetings/${meeting.id}/minutes-document`).expect(201);
    expect(repeatedMinutes.body.data.id).toBe(minutes.body.data.id);
    const attachment=await prisma.fileAsset.create({data:{name:`${prefix} agenda.txt`,meetingId:meeting.id,versions:{create:{versionNumber:1,storageKey:`${prefix}-agenda`,originalName:'agenda.txt',mimeType:'text/plain',size:6,sha256:'a'.repeat(64)}}}});
    const detail=await request(app.getHttpServer()).get(`/api/meetings/${meeting.id}`).expect(200);
    expect(detail.body.data).toMatchObject({minutesDocument:{id:minutes.body.data.id},attachments:[{id:attachment.id,name:`${prefix} agenda.txt`,latestVersion:{versionNumber:1,originalName:'agenda.txt'}}]});
    const action=(await request(app.getHttpServer()).post(`/api/meetings/${meeting.id}/actions`).send({title:`${prefix} action`}).expect(201)).body.data;
    const first=await request(app.getHttpServer()).post(`/api/meeting-actions/${action.id}/task`).send({title:`${prefix} task`}).expect(201);
    expect(first.body.data).toMatchObject({alreadyExists:false,task:{sourceType:'MEETING_ACTION',sourceId:action.id}});
    const repeated=await request(app.getHttpServer()).post(`/api/meeting-actions/${action.id}/task`).send({title:'duplicate'}).expect(201);
    expect(repeated.body.data).toMatchObject({alreadyExists:true,task:{id:first.body.data.task.id,sourceType:'MEETING_ACTION',sourceId:action.id}});
    await expect(prisma.workTask.count({where:{sourceType:'MEETING_ACTION',sourceId:action.id}})).resolves.toBe(1);
  });
});
