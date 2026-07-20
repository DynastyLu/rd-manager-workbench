import { Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import {
  SearchAdapter,
  SearchCandidate,
  SearchType,
} from '../domain/search.types';
import { buildSearchSnippet } from '../domain/search-ranking';

const CANDIDATE_LIMIT = 100;

@Injectable()
export class TasksSearchAdapter implements SearchAdapter {
  readonly types = ['TASK'] as const;

  constructor(private readonly prisma: PlatformPrismaService) {}

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    if (!types.includes('TASK')) return [];

    const where: Prisma.WorkTaskWhereInput = {
      archivedAt: null,
      AND: [{ OR: [{ projectId: null }, { project: { archivedAt: null } }] }],
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { assigneeName: { contains: query, mode: 'insensitive' } },
        { collaboratorNames: { has: query } },
      ],
    };
    const tasks = await this.prisma.workTask.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        assigneeName: true,
        collaboratorNames: true,
        status: true,
        projectId: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_LIMIT,
    });

    return tasks.map((task) => ({
      type: 'TASK',
      id: task.id,
      title: task.title,
      snippet: buildSearchSnippet(query, [
        task.description,
        task.assigneeName,
        task.collaboratorNames.join(' · '),
      ]),
      path: `/my-work?taskId=${encodeURIComponent(task.id)}`,
      updatedAt: task.updatedAt,
      actions:
        task.status === TaskStatus.DONE
          ? ['OPEN', 'COPY_LINK', 'REOPEN_TASK']
          : task.status === TaskStatus.CANCELLED
            ? ['OPEN', 'COPY_LINK']
            : ['OPEN', 'COPY_LINK', 'COMPLETE_TASK'],
    }));
  }

}
