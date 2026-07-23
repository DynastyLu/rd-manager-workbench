import { Module } from '@nestjs/common';
import { EmployeesService } from './application/employees.service';
import { EmployeesController } from './interface/http/employees.controller';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
