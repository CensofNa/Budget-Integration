import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TransformBudgetReportRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({ type: String, description: "Specific Sync Run UUID to transform" })
  syncRunId?: string;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Auto-trigger project step after transformation" })
  autoProcess?: boolean;
}
