import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SyncBalanceSheetActualsRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({ type: Number, description: "The fiscal year for the sync (e.g. 2026)" })
  fiscalYear?: number;

  @ApiPropertyOptional({ type: [String], description: "List of property codes or UUIDs to sync" })
  propertyIds?: string[];

  @ApiPropertyOptional({ type: [String], description: "List of property codes to sync" })
  propertyCodes?: string[];

  @ApiPropertyOptional({ enum: ["all", "livano", "non-livano"], default: "all", description: "Filter properties by owner (Livano vs Non-Livano)" })
  ownerFilter?: "all" | "livano" | "non-livano";

  @ApiPropertyOptional({ type: String, description: "GL Tree ID override (auto-resolves 1913 for Livano, 1812 for Non-Livano if omitted)" })
  glTreeId?: string;

  @ApiPropertyOptional({ type: [Number], description: "List of GL Book IDs (defaults to [1909])" })
  glBookIds?: number[];

  @ApiPropertyOptional({ type: String, enum: ["accrual", "cash"], default: "accrual" })
  accountingMethod?: "accrual" | "cash";

  @ApiPropertyOptional({ type: Number, description: "Trailing periods override (defaults to current month - fiscalYearStartMonth + 1)" })
  trailingPeriods?: number;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically stage rows after fetch" })
  autoStage?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically transform rows after staging" })
  autoTransform?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically project rows to budget_calc_lines after transform" })
  autoProject?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: false, description: "Run synchronously instead of enqueueing background job" })
  runSynchronously?: boolean;

  @ApiPropertyOptional({ enum: ["SYNC", "QUEUE", "STREAM"], default: "QUEUE", description: "Execution mode: 'SYNC' for inline execution, 'QUEUE' for background job, 'STREAM' for live streaming" })
  syncMode?: "SYNC" | "QUEUE" | "STREAM";

  @ApiPropertyOptional({ type: Boolean, default: false, description: "Stream live logs progressively using chunked transfer encoding" })
  stream?: boolean;
}
