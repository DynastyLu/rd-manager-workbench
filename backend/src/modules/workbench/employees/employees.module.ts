import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { GovernanceModule } from '../governance/governance.module';
import { EmployeeImportCommitService } from './application/employee-import-commit.service';
import { EmployeeImportValidatorService } from './application/employee-import-validator.service';
import { EmployeeImportsService } from './application/employee-imports.service';
import { EmployeeWorkbookService } from './application/employee-workbook.service';
import { EmployeesService } from './application/employees.service';
import { EmployeeImportsController } from './interface/http/employee-imports.controller';
import { EmployeesController } from './interface/http/employees.controller';

@Module({
  imports: [StorageModule, GovernanceModule],
  controllers: [EmployeesController, EmployeeImportsController],
  providers: [
    EmployeesService,
    EmployeeWorkbookService,
    EmployeeImportValidatorService,
    EmployeeImportCommitService,
    EmployeeImportsService,
  ],
  exports: [
    EmployeesService,
    EmployeeWorkbookService,
    EmployeeImportValidatorService,
    EmployeeImportCommitService,
    EmployeeImportsService,
  ],
})
export class EmployeesModule {}
