import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StageBudgetReportRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({ type: String, description: "Specific Sync Run UUID to stage" })
  syncRunId?: string;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Auto-trigger transform & project pipeline after staging" })
  autoProcess?: boolean;
}
