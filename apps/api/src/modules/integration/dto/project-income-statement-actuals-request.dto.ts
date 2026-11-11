export interface ProjectIncomeStatementActualsRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId?: string;
  propertyId?: string;
  fiscalYear?: number;
}