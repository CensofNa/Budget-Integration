import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SyncReportDataRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({ type: String, description: "Report code (e.g. box_score, resident_retention)" })
  reportCode?: string;

  @ApiPropertyOptional({ type: String })
  reportName?: string;

  @ApiPropertyOptional({ type: String })
  reportVersion?: string;

  @ApiPropertyOptional({ type: String })
  methodVersion?: string;

  @ApiPropertyOptional({ type: Object })
  filters?: Record<string, any>;

  @ApiPropertyOptional({ type: [String], description: "List of property IDs or codes" })
  propertyIds?: string[];

  @ApiPropertyOptional({ type: Number, description: "Fiscal year" })
  fiscalYear?: number;

  @ApiPropertyOptional({ type: Boolean, description: "Include prior year data" })
  includePriorYear?: boolean;

  @ApiPropertyOptional({ type: String, description: "Period start date" })
  periodStart?: string;

  @ApiPropertyOptional({ type: String, description: "Period end date" })
  periodEnd?: string;

  @ApiPropertyOptional({ type: Boolean })
  updateFiscalConfig?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: false, description: "Whether to sync transformed actuals into occupancy reforecast" })
  updateReforecast?: boolean;

  @ApiPropertyOptional({ type: String, description: "Optional reforecast cutoff month (e.g. 2026-10 or 2026-10-31) to lock and sync actuals through" })
  reforecastPostMonth?: string;
}
