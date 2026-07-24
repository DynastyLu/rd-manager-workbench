import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { GovernanceModule } from '../governance/governance.module';
import { EmployeeImportCommitService } from './application/employee-import-commit.service';
import { EmployeeImportValidatorService } from './application/employee-import-validator.service';
import { EmployeeImportsService } from './application/employee-imports.service';
import { EmployeeProgressQueryService } from './application/employee-progress-query.service';
import { EmployeeProgressSnapshotService } from './application/employee-progress-snapshot.service';
import { EmployeeWorkbookService } from './application/employee-workbook.service';
import { EmployeesService } from './application/employees.service';
import { EmployeeImportsController } from './interface/http/employee-imports.controller';
import {
  EmployeeProgressController,
  EmployeesController,
} from './interface/http/employees.controller';

@Module({
  imports: [StorageModule, GovernanceModule],
  controllers: [EmployeesController, EmployeeProgressController, EmployeeImportsController],
  providers: [
    EmployeesService,
    EmployeeProgressQueryService,
    EmployeeWorkbookService,
    EmployeeImportValidatorService,
    EmployeeImportCommitService,
    EmployeeProgressSnapshotService,
    EmployeeImportsService,
  ],
  exports: [
    EmployeesService,
    EmployeeProgressQueryService,
    EmployeeWorkbookService,
    EmployeeImportValidatorService,
    EmployeeImportCommitService,
    EmployeeProgressSnapshotService,
    EmployeeImportsService,
  ],
})
export class EmployeesModule {}
