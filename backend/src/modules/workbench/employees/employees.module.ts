import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { GovernanceModule } from '../governance/governance.module';
import { ManagementModule } from '../management/management.module';
import { TasksModule } from '../tasks/tasks.module';
import { EmployeeImportCommitService } from './application/employee-import-commit.service';
import { EmployeeImportValidatorService } from './application/employee-import-validator.service';
import { EmployeeImportsService } from './application/employee-imports.service';
import { EmployeeProgressQueryService } from './application/employee-progress-query.service';
import { EmployeeProgressSnapshotService } from './application/employee-progress-snapshot.service';
import { EmployeeWeekPlansService } from './application/employee-week-plans.service';
import { EmployeeWorkExportService } from './application/employee-work-export.service';
import { EmployeeWorkRiskService } from './application/employee-work-risk.service';
import { EmployeeWorkbookService } from './application/employee-workbook.service';
import { EmployeesService } from './application/employees.service';
import { EmployeeImportsController } from './interface/http/employee-imports.controller';
import {
  EmployeeProgressController,
  EmployeesController,
} from './interface/http/employees.controller';

@Module({
  imports: [StorageModule, GovernanceModule, ManagementModule, TasksModule],
  controllers: [EmployeesController, EmployeeProgressController, EmployeeImportsController],
  providers: [
    EmployeesService,
    EmployeeProgressQueryService,
    EmployeeWorkbookService,
    EmployeeImportValidatorService,
    EmployeeImportCommitService,
    EmployeeProgressSnapshotService,
    EmployeeWeekPlansService,
    EmployeeWorkExportService,
    EmployeeWorkRiskService,
    EmployeeImportsService,
  ],
  exports: [
    EmployeesService,
    EmployeeProgressQueryService,
    EmployeeWorkbookService,
    EmployeeImportValidatorService,
    EmployeeImportCommitService,
    EmployeeProgressSnapshotService,
    EmployeeWeekPlansService,
    EmployeeWorkExportService,
    EmployeeWorkRiskService,
    EmployeeImportsService,
  ],
})
export class EmployeesModule {}
