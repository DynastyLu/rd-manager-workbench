import type { Prisma } from '@prisma/client';
import type { AuthenticatedPrincipal } from './principal';

export interface DataScopeBuilders {
  projects(principal: AuthenticatedPrincipal): Prisma.ProjectWhereInput;
  tasks(principal: AuthenticatedPrincipal): Prisma.WorkTaskWhereInput;
  employees(principal: AuthenticatedPrincipal): Prisma.ResourceProfileWhereInput;
  employeeWork(principal: AuthenticatedPrincipal): Prisma.EmployeeWorkItemWhereInput;
  employeeWeekPlanItems(principal: AuthenticatedPrincipal): Prisma.EmployeeWeekPlanItemWhereInput;
  meetings(principal: AuthenticatedPrincipal): Prisma.MeetingWhereInput;
  documents(principal: AuthenticatedPrincipal): Prisma.ContentDocumentWhereInput;
  knowledge(principal: AuthenticatedPrincipal): Prisma.DocumentChunkWhereInput;
  knowledgeSpaces(principal: AuthenticatedPrincipal): Prisma.KnowledgeSpaceWhereInput;
  decisions(principal: AuthenticatedPrincipal): Prisma.DecisionWhereInput;
  issues(principal: AuthenticatedPrincipal): Prisma.IssueWhereInput;
  risks(principal: AuthenticatedPrincipal): Prisma.RiskWhereInput;
  intelligenceItems(principal: AuthenticatedPrincipal): Prisma.IntelligenceItemWhereInput;
  partners(principal: AuthenticatedPrincipal): Prisma.PartnerWhereInput;
  communications(principal: AuthenticatedPrincipal): Prisma.CommunicationRecordWhereInput;
  baseTables(principal: AuthenticatedPrincipal): Prisma.DataTableWhereInput;
  baseRecords(principal: AuthenticatedPrincipal): Prisma.DataRecordWhereInput;
  activities(principal: AuthenticatedPrincipal): Prisma.ActivityRecordWhereInput;
}
