export interface StageIncomeStatementActualsRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  reportLogId?: string;
  autoTransform?: boolean;
  autoProject?: boolean;
}