export interface SyncBudgetActualRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;

  propertyId?: string;
  budgetIds?: string;

  startPostMonth?: string;
  endPostMonth?: string;

  accountingMethod?: "Cash" | "Accrual";
  budgetStatusTypeIds?: string;
}