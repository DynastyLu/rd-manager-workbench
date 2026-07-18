import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('application case Prisma client contract', () => {
  const prismaClient = new PrismaClient();

  afterAll(async () => {
    await prismaClient.$disconnect();
  });

  it('exposes every application-domain delegate', () => {
    for (const delegate of [
      'workflowTemplate',
      'workflowTemplateNode',
      'applicationCase',
      'applicationNode',
      'applicationRequirement',
      'applicationMaterial',
      'materialVersion',
      'evidenceRecord',
      'evidenceRecordLink',
      'correctionRecord',
      'submissionRecord',
    ]) {
      expect(prismaClient).toHaveProperty(delegate);
    }
  });

  it('keeps the project-to-application-case relation available for includes', () => {
    const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

    expect(schema).toMatch(/model Project \{[\s\S]*?applicationCases\s+ApplicationCase\[\]/);
  });

  it('uses explicit statuses for cases, workflow nodes, requirements, materials, corrections, and submissions', () => {
    const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');

    for (const enumName of [
      'ApplicationCaseStatus',
      'ApplicationNodeStatus',
      'RequirementStatus',
      'MaterialReviewStatus',
      'CorrectionStatus',
      'SubmissionStatus',
    ]) {
      expect(schema).toContain(`enum ${enumName} {`);
    }
  });
});
