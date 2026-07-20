import { Injectable } from '@nestjs/common';
import { PlatformPrismaService } from '../../../../infrastructure/prisma/platform-prisma.service';
import { UpdateGovernanceSettingsDto } from '../interface/http/dto/governance.dto';
import { AuditLogService } from './audit-log.service';

const SINGLETON_ID = 'singleton';

@Injectable()
export class GovernanceSettingsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly audit: AuditLogService,
  ) {}

  get() {
    return this.prisma.governanceSetting.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
  }

  update(dto: UpdateGovernanceSettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.governanceSetting.upsert({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...dto },
        update: dto,
      });
      await this.audit.record(
        {
          action: 'GOVERNANCE_SETTINGS_UPDATE',
          entityType: 'governanceSetting',
          entityId: SINGLETON_ID,
          outcome: 'SUCCEEDED',
          changedFields: Object.keys(dto),
          metadata: {
            status: dto.autoBackupEnabled === undefined
              ? 'UNCHANGED'
              : dto.autoBackupEnabled
                ? 'ENABLED'
                : 'DISABLED',
          },
        },
        tx,
      );
      return updated;
    });
  }

  markAutoBackupSucceeded(localDate: Date) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.governanceSetting.update({
        where: { id: SINGLETON_ID },
        data: { lastAutoBackupLocalDate: localDate },
      });
      await this.audit.record(
        {
          action: 'AUTO_BACKUP_DATE_ADVANCE',
          entityType: 'governanceSetting',
          entityId: SINGLETON_ID,
          outcome: 'SUCCEEDED',
          changedFields: ['lastAutoBackupLocalDate'],
          metadata: { status: 'SUCCEEDED' },
        },
        tx,
      );
      return updated;
    });
  }
}
