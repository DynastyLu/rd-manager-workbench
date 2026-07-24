import { Module } from '@nestjs/common';
import { EmployeeWorkbookService } from './application/employee-workbook.service';
import { EmployeesService } from './application/employees.service';
import { EmployeesController } from './interface/http/employees.controller';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeWorkbookService],
  exports: [EmployeesService, EmployeeWorkbookService],
})
export class EmployeesModule {}
