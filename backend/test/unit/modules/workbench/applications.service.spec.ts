import { ApplicationNodeStatus, RequirementStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../src/infrastructure/prisma/platform-prisma.service';
import { ApplicationsService } from '../../../../src/modules/workbench/applications/application/applications.service';

describe('ApplicationsService', () => {
  it('snapshots workflow nodes when it creates an application case', async () => {
    const createdCase = { id: 'case-1', code: 'CASE-1' };
    const prisma = {
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(prisma),
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'project-1' }) },
      workflowTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'template-1',
          nodes: [
            {
              id: 'template-node-1',
              code: 'PREPARE',
              title: '准备材料',
              description: null,
              sequence: 1,
              prerequisiteNodeCodes: [],
              requiredRequirementCodes: ['QUALIFIED'],
              requiredMaterialCodes: ['APPLICATION_FORM'],
              isRequired: true,
            },
          ],
        }),
      },
      applicationCase: {
        create: jest.fn().mockResolvedValue(createdCase),
      },
    } as unknown as PlatformPrismaService;
    const service = new ApplicationsService(prisma);

    await service.createCase({
      code: 'CASE-1',
      title: '省级认定',
      projectId: 'project-1',
      workflowTemplateId: 'template-1',
    });

    expect(prisma.applicationCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nodes: {
            create: [
              expect.objectContaining({
                code: 'PREPARE',
                snapshot: expect.objectContaining({ code: 'PREPARE', title: '准备材料' }),
              }),
            ],
          },
        }),
      }),
    );
  });

  it('reports the missing condition and material when a node cannot be completed', async () => {
    const prisma = {
      $transaction: async (callback: (client: unknown) => Promise<unknown>) => callback(prisma),
      applicationCase: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-1', archivedAt: null }),
      },
      applicationNode: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'node-1',
          applicationCaseId: 'case-1',
          status: ApplicationNodeStatus.PENDING,
          prerequisiteNodeCodes: [],
          requiredRequirementCodes: ['QUALIFIED'],
          requiredMaterialCodes: ['APPLICATION_FORM'],
        }),
      },
      applicationRequirement: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { code: 'QUALIFIED', status: RequirementStatus.PENDING, isRequired: true },
          ]),
      },
      applicationMaterial: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ code: 'APPLICATION_FORM', isRequired: true, versions: [] }]),
      },
    } as unknown as PlatformPrismaService;
    const service = new ApplicationsService(prisma);

    await expect(
      service.updateNode('case-1', 'node-1', { status: ApplicationNodeStatus.COMPLETED }),
    ).rejects.toMatchObject({
      code: 'APPLICATION_NODE_COMPLETION_BLOCKED',
      details: {
        missingRequirementCodes: ['QUALIFIED'],
        missingMaterialCodes: ['APPLICATION_FORM'],
      },
    });
  });
});
