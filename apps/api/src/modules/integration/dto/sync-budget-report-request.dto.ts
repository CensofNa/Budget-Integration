import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SyncBudgetReportRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({
    type: String,
    enum: ["currentfy", "previousfy"],
    description: "Budget type: 'currentfy' (uses current FY as reference to create next FY budget) or 'previousfy' (uses previous FY as reference)",
  })
  budgetType?: "currentfy" | "previousfy" | string;

  @ApiPropertyOptional({ type: Number, description: "The reference fiscal year for the sync (e.g. 2026). If omitted, determined by budgetType." })
  fiscalYear?: number;

  @ApiPropertyOptional({ type: Number, description: "The target budget year being created (defaults to reference fiscalYear + 1, e.g. 2027)" })
  targetBudgetYear?: number;

  @ApiPropertyOptional({ type: [String], description: "List of property IDs to sync" })
  propertyIds?: string[];

  @ApiPropertyOptional({ type: [String], description: "List of property codes (sourcePropertyIds) to sync" })
  propertyCodes?: string[];

  @ApiPropertyOptional({ type: Boolean, default: false, description: "Whether to include balance sheet accounts (balance_sheet_accounts: '1' or '0')" })
  balanceSheetAccounts?: boolean;

  @ApiPropertyOptional({ type: String, description: "Filter properties by owner (e.g. 'Livano' or 'Non-Livano')", enum: ["all", "livano", "non-livano"], default: "all" })
  ownerFilter?: "all" | "livano" | "non-livano";

  @ApiPropertyOptional({ type: String, description: "GL Tree ID (e.g. '1913')", default: "1913" })
  glTreeId?: string;

  @ApiPropertyOptional({ type: [Number], description: "List of GL Book IDs (e.g. [1909])" })
  glBookIds?: number[];

  @ApiPropertyOptional({ type: String, description: "Budget Status ID (e.g. '3')" })
  budgetStatus?: string;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Include zero balances" })
  includeZeroBalance?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: false, description: "Auto-trigger stage, transform, and project pipeline" })
  autoProcess?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: "Whether to update property fiscal configuration (budgetYear, fiscalYearStartDate, fiscalYearEndDate) from report payload",
  })
  updateFiscalConfig?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: "Stream logs in real-time using chunked transfer encoding",
  })
  stream?: boolean;

  @ApiPropertyOptional({
    type: String,
    enum: ["SYNC", "QUEUE", "STREAM"],
    default: "SYNC",
    description: "Execution mode: SYNC (blocking), QUEUE (background worker), or STREAM (live text stream)",
  })
  syncMode?: "SYNC" | "QUEUE" | "STREAM";
}
