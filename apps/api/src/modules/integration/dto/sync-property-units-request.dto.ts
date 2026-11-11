export interface SyncPropertyUnitsRequestDto {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;

  propertyId?: string;
  propertyIds?: string[];
  propertyBatchSize?: number;
}
