import { Module } from '@nestjs/common';
import { ReportsService } from './application/reports.service';
import { ReportsController } from './interface/http/reports.controller';
import { GovernanceModule } from '../governance/governance.module';

@Module({ imports: [GovernanceModule], providers: [ReportsService], controllers: [ReportsController], exports: [ReportsService] })
export class ReportingModule {}
