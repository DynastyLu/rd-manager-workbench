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
  afterAll(async()=>{await prisma.project.deleteMany({where:{code:{startsWith:prefix}}});await prisma.$disconnect();await app.close();});
  it('persists high risks and recalculates the project health', async()=>{const response=await request(app.getHttpServer()).post('/api/risks').send({projectId,title:`${prefix} risk`,likelihood:'HIGH',impact:'CRITICAL',level:'CRITICAL'}).expect(201);expect(response.body.data.status).toBe('OPEN');const snapshot=await prisma.projectHealthSnapshot.findFirst({where:{projectId},orderBy:{calculatedAt:'desc'}});expect(snapshot?.health).toBe('RED');await request(app.getHttpServer()).patch(`/api/risks/${response.body.data.id}`).send({title:`${prefix} risk`,likelihood:'HIGH',impact:'CRITICAL',level:'CRITICAL',status:'CLOSED'}).expect(200);});
  it('converts a meeting action to one source-traceable task', async()=>{const meeting=(await request(app.getHttpServer()).post('/api/meetings').send({title:`${prefix} meeting`,scheduledAt:'2026-08-01T00:00:00.000Z'}).expect(201)).body.data;const action=(await request(app.getHttpServer()).post(`/api/meetings/${meeting.id}/actions`).send({title:`${prefix} action`}).expect(201)).body.data;const task=await request(app.getHttpServer()).post(`/api/meeting-actions/${action.id}/task`).send({title:`${prefix} task`}).expect(201);expect(task.body.data).toMatchObject({sourceType:'MEETING_ACTION',sourceId:action.id});await request(app.getHttpServer()).post(`/api/meeting-actions/${action.id}/task`).send({title:'duplicate'}).expect(409);});
});
