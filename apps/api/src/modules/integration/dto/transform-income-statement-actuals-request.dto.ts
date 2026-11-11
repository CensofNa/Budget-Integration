export interface TransformIncomeStatementActualsRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  autoProject?: boolean;
}