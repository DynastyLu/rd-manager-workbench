import { Injectable } from '@nestjs/common';
import { RiskStatus } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { RequestContextService } from '../../../../infrastructure/context/request-context.service';
import { DataScopeService } from '../../../iam/application/data-scope.service';
import { buildSearchSnippet, limitSearchCandidates } from '../domain/search-ranking';
import { SearchAdapter, SearchCandidate, SearchType } from '../domain/search.types';

const LIMIT = 100;

@Injectable()
export class ManagementSearchAdapter implements SearchAdapter {
  readonly types = [
    'MEETING',
    'RISK',
    'ISSUE',
    'DECISION',
    'PARTNER',
    'COMMUNICATION',
  ] as const satisfies readonly SearchType[];

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly requestContext: RequestContextService,
    private readonly dataScope: DataScopeService,
  ) {}

  private principal() {
    return this.requestContext.requirePrincipal();
  }

  async search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]> {
    const requested = new Set(types);
    const contains = { contains: query, mode: 'insensitive' as const };
    const meetings = requested.has('MEETING')
      ? await this.prisma.meeting.findMany({
          where: {
            AND: [
              {
                archivedAt: null,
                AND: [{ OR: [{ projectId: null }, { project: { archivedAt: null } }] }],
                OR: [{ title: contains }, { agenda: contains }, { minutes: contains }],
              },
              this.dataScope.meetings(this.principal(), 'meeting.read'),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: LIMIT,
        })
      : [];
    const risks = requested.has('RISK')
      ? await this.prisma.risk.findMany({
          where: {
            AND: [
              {
                archivedAt: null,
                AND: [
                  { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                  { OR: [{ taskId: null }, { task: { archivedAt: null } }] },
                ],
                OR: [
                  { title: contains },
                  { description: contains },
                  { mitigation: contains },
                ],
              },
              this.dataScope.risks(this.principal(), 'risk.read'),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: LIMIT,
        })
      : [];
    const issues = requested.has('ISSUE')
      ? await this.prisma.issue.findMany({
          where: {
            AND: [
              {
                archivedAt: null,
                AND: [
                  { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                  { OR: [{ taskId: null }, { task: { archivedAt: null } }] },
                ],
                OR: [
                  { title: contains },
                  { description: contains },
                  { impactObject: contains },
                  { proposedResolution: contains },
                ],
              },
              this.dataScope.issues(this.principal(), 'issue.read'),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: LIMIT,
        })
      : [];
    const decisions = requested.has('DECISION')
      ? await this.prisma.decision.findMany({
          where: {
            AND: [
              {
                archivedAt: null,
                AND: [
                  { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
                  { OR: [{ taskId: null }, { task: { archivedAt: null } }] },
                  { OR: [{ meetingId: null }, { meeting: { archivedAt: null } }] },
                ],
                OR: [
                  { title: contains },
                  { background: contains },
                  { basis: contains },
                  { conclusion: contains },
                ],
              },
              this.dataScope.decisions(this.principal(), 'decision.read'),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: LIMIT,
        })
      : [];
    const partners = requested.has('PARTNER')
      ? await this.prisma.partner.findMany({
          where: {
            AND: [
              {
                archivedAt: null,
                OR: [
                  { name: contains },
                  { shortName: contains },
                  { category: contains },
                  { notes: contains },
                ],
              },
              this.dataScope.partners(this.principal(), 'partner.read'),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: LIMIT,
        })
      : [];
    const communications = requested.has('COMMUNICATION')
      ? await this.prisma.communicationRecord.findMany({
          where: {
            AND: [
              {
                archivedAt: null,
                partner: { archivedAt: null },
                AND: [{ OR: [{ projectId: null }, { project: { archivedAt: null } }] }],
                OR: [{ subject: contains }, { summary: contains }, { promises: contains }],
              },
              this.dataScope.communications(this.principal(), 'partner.read'),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: LIMIT,
        })
      : [];

    const candidates: SearchCandidate[] = [
      ...meetings.map((item) =>
        this.candidate(
          'MEETING',
          item.id,
          item.title,
          buildSearchSnippet(query, [item.agenda, item.minutes]),
          `/calendar?meetingId=${encodeURIComponent(item.id)}`,
          item.updatedAt,
        ),
      ),
      ...risks.map((item) =>
        this.candidate(
          'RISK',
          item.id,
          item.title,
          buildSearchSnippet(query, [item.description, item.mitigation]),
          this.governancePath('risks', item.id, item.projectId),
          item.updatedAt,
          item.status === RiskStatus.CLOSED
            ? ['OPEN', 'COPY_LINK']
            : ['OPEN', 'COPY_LINK', 'CLOSE_RISK'],
        ),
      ),
      ...issues.map((item) =>
        this.candidate(
          'ISSUE',
          item.id,
          item.title,
          buildSearchSnippet(query, [
            item.description,
            item.impactObject,
            item.proposedResolution,
          ]),
          this.governancePath('issues', item.id, item.projectId),
          item.updatedAt,
        ),
      ),
      ...decisions.map((item) =>
        this.candidate(
          'DECISION',
          item.id,
          item.title,
          buildSearchSnippet(query, [item.background, item.conclusion, item.basis]),
          this.governancePath('decisions', item.id, item.projectId),
          item.updatedAt,
        ),
      ),
      ...partners.map((item) =>
        this.candidate(
          'PARTNER',
          item.id,
          item.name,
          buildSearchSnippet(query, [item.shortName, item.category, item.notes]),
          `/library/governance/partners?recordId=${encodeURIComponent(item.id)}`,
          item.updatedAt,
        ),
      ),
      ...communications.map((item) =>
        this.candidate(
          'COMMUNICATION',
          item.id,
          item.subject,
          buildSearchSnippet(query, [item.summary, item.promises]),
          `/library/governance/partners?recordId=${encodeURIComponent(item.partnerId)}&communicationId=${encodeURIComponent(item.id)}`,
          item.updatedAt,
        ),
      ),
    ];
    return limitSearchCandidates(query, candidates, LIMIT);
  }

  private candidate(
    type: SearchCandidate['type'],
    id: string,
    title: string,
    snippet: string | null,
    path: string,
    updatedAt: Date,
    actions: SearchCandidate['actions'] = ['OPEN', 'COPY_LINK'],
  ): SearchCandidate {
    return { type, id, title, snippet, path, updatedAt, actions };
  }

  private governancePath(section: string, id: string, projectId: string | null): string {
    const params = new URLSearchParams({ recordId: id });
    if (projectId) params.set('projectId', projectId);
    return `/library/governance/${section}?${params.toString()}`;
  }

}
