export interface SyncPropertiesRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;

  propertyId?: string;
  propertyIds?: string[];
  fiscalYears?: string;
  forceTransform?: boolean;
}
