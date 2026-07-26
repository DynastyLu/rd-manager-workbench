import { Module } from '@nestjs/common';
import { WorkbenchStatusController } from './interface/http/workbench-status.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { ApplicationsModule } from './applications/applications.module';
import { ManagementModule } from './management/management.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ContentModule } from './content/content.module';
import { BaseModule } from './base/base.module';
import { SearchModule } from './search/search.module';
import { OperationsModule } from './operations/operations.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { GovernanceModule } from './governance/governance.module';
import { ExtensionsModule } from './extensions/extensions.module';
import { ReportingModule } from './reporting/reporting.module';
import { EmployeesModule } from './employees/employees.module';
import { KnowledgeModule } from './knowledge/knowledge.module';

@Module({
  imports: [
    DashboardModule,
    ProjectsModule,
    TasksModule,
    ApplicationsModule,
    ManagementModule,
    CalendarModule,
    NotificationsModule,
    ContentModule,
    BaseModule,
    SearchModule,
    OperationsModule,
    IntelligenceModule,
    GovernanceModule,
    ExtensionsModule,
    ReportingModule,
    EmployeesModule,
    KnowledgeModule,
  ],
  controllers: [WorkbenchStatusController],
})
export class WorkbenchModule {}
