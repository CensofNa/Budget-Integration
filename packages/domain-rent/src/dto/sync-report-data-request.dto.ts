export class SyncReportDataRequestDto {
  companyId!: string;
  organisationId!: string;
  integrationSourceId!: string;
  reportCode?: string;
  reportName?: string;
  reportVersion?: string;
  methodVersion?: string;
  filters?: Record<string, any>;
  propertyIds?: string[];
  fiscalYear?: number;
  includePriorYear?: boolean;
  periodStart?: string;
  periodEnd?: string;
  updateFiscalConfig?: boolean;
}
