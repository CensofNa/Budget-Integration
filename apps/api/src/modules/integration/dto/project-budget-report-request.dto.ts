import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ProjectBudgetReportRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({ type: String, description: "Specific Sync Run UUID to project" })
  syncRunId?: string;

  @ApiPropertyOptional({ type: String, description: "Specific Property UUID (null = all properties)" })
  propertyId?: string;

  @ApiPropertyOptional({ type: Number, default: 2026, description: "Fiscal year (e.g. 2026)" })
  fiscalYear?: number;

  @ApiPropertyOptional({ type: String, description: "Specific GL account code (null = all accounts)" })
  accountCode?: string;
}
