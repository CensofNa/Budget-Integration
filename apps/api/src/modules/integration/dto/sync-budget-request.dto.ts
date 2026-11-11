export interface SyncBudgetRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;

  fiscalYears?: string;
  budgetIds?: string;
  budgetStatusTypeIds?: string;
  propertyId?: string;
  propertyIds?: string[] | string;
  updateFiscalConfig?: boolean;
}
