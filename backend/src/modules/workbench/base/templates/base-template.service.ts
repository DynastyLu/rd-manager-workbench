import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataTableSource, Prisma } from '@prisma/client';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { getValidatedTemplateCatalog } from './base-template-catalog';
import { DataTableTemplateDefinition } from './base-template.types';

@Injectable()
export class BaseTemplateService {
  constructor(private readonly prisma: PlatformPrismaService) {}

  list() {
    return getValidatedTemplateCatalog().map((template) => ({
      key: template.key,
      version: template.version,
      name: template.name,
      description: template.description,
      icon: template.icon,
      category: template.category,
      fieldCount: template.fields.length,
      viewTypes: [...new Set(template.views.map((view) => view.type))],
      primaryFields: template.fields.slice(0, 5).map((field) => field.name),
    }));
  }

  detail(key: string) {
    const template = this.find(key);
    return structuredClone(template);
  }

  instantiate(workspaceId: string, key: string, input: { name?: string }) {
    const template = this.find(key);
    const requestedName = input.name?.trim();
    if (requestedName && requestedName.length > 200) throw new BadRequestException('Table name exceeds 200 characters');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`base-template:${workspaceId}`}))`,
      );
      const workspace = await tx.dataWorkspace.findFirst({ where: { id: workspaceId, archivedAt: null } });
      if (!workspace) throw new NotFoundException('Data workspace not found');
      const projectTable = template.fields.some((field) => field.config?.targetPresetKey === 'projects')
        ? await tx.dataTable.findFirst({ where: { presetKey: 'projects', archivedAt: null } })
        : null;
      if (template.fields.some((field) => field.config?.targetPresetKey === 'projects') && !projectTable) {
        throw new BadRequestException('Projects preset table is unavailable');
      }
      const name = requestedName || (await this.nextName(tx, workspaceId, template.name));
      return tx.dataTable.create({
        data: {
          workspaceId,
          name,
          description: template.description,
          icon: template.icon,
          source: DataTableSource.CUSTOM,
          presetKey: null,
          fields: {
            create: template.fields.map((field) => ({
              key: field.key,
              name: field.name,
              type: field.type,
              sequence: field.sequence,
              isPrimary: field.isPrimary ?? false,
              isRequired: field.isRequired ?? false,
              config: this.resolveConfig(field.config ?? {}, projectTable?.id) as Prisma.InputJsonValue,
            })),
          },
          views: {
            create: template.views.map((view) => ({
              name: view.name,
              type: view.type,
              sequence: view.sequence,
              isDefault: view.isDefault ?? false,
              config: view.config as Prisma.InputJsonValue,
            })),
          },
        },
        include: {
          fields: { where: { archivedAt: null }, orderBy: [{ sequence: 'asc' }, { id: 'asc' }] },
          views: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] },
        },
      });
    });
  }

  private async nextName(tx: Prisma.TransactionClient, workspaceId: string, base: string) {
    const existing = new Set(
      (await tx.dataTable.findMany({ where: { workspaceId, archivedAt: null }, select: { name: true } })).map(
        (table) => table.name,
      ),
    );
    if (!existing.has(base)) return base;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base} ${suffix}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  private resolveConfig(config: Record<string, unknown>, projectTableId?: string) {
    if (config.targetPresetKey === 'projects') {
      const rest = Object.fromEntries(
        Object.entries(config).filter(([key]) => key !== 'targetPresetKey'),
      );
      return { ...rest, targetTableId: projectTableId };
    }
    return config;
  }

  private find(key: string): DataTableTemplateDefinition {
    const template = getValidatedTemplateCatalog().find((item) => item.key === key);
    if (!template) throw new NotFoundException('Data table template not found');
    return template;
  }
}
