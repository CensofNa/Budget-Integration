import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SyncIncomeStatementActualsRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiProperty({ type: Number, description: "The fiscal year for the sync (e.g. 2026)" })
  fiscalYear!: number;

  @ApiPropertyOptional({ type: [String], description: "List of property codes to sync" })
  propertyIds?: string[];

  @ApiPropertyOptional({ type: String, description: "Latest closed month (e.g. 2026-06)" })
  latestPostMonth?: string;

  @ApiPropertyOptional({ type: String, description: "GL Tree ID" })
  glTreeId?: string;

  @ApiPropertyOptional({ type: [Number], default: [1909], description: "List of GL Book IDs to sync (defaults to [1909])" })
  glBookIds?: number[];

  @ApiPropertyOptional({ type: String, enum: ["accrual", "cash"], default: "accrual" })
  accountingMethod?: "accrual" | "cash";

  @ApiPropertyOptional({ type: String, default: "currentfyr" })
  periodType?: string;

  @ApiPropertyOptional({ type: Number, description: "Number of trailing periods to sync" })
  trailingPeriods?: number;

  @ApiPropertyOptional({ type: Boolean, default: false })
  includeDemo?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: false })
  autoProcess?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: false })
  updateReforecast?: boolean;

  @ApiPropertyOptional({
    type: String,
    enum: ["all", "livano", "non-livano"],
    default: "all",
    description: "Filter properties by owner (Livano vs Non-Livano). Defaults to 'all'.",
  })
  ownerFilter?: "all" | "livano" | "non-livano";

  @ApiPropertyOptional({ type: String, description: "Reforecast cutoff month (e.g. 2026-06)" })
  reforecastCutoffMonth?: string;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: "When true, forces sync of all properties regardless of whether gl_locked_through has changed. Defaults to false (only syncs properties where is_gl_locked_changed = true when propertyIds is omitted).",
  })
  forceAll?: boolean;
}