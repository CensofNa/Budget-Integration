import { ApiProperty } from "@nestjs/swagger";

export class SendBudgetRequestDto {
  @ApiProperty({
    type: String,
    format: "uuid",
    description: "UUID of the property in Century Budget application",
    example: "323768dc-ecf6-49aa-9af3-0e41898b4cb9"
  })
  propertyId!: string;

  @ApiProperty({
    type: Number,
    required: false,
    default: 2027,
    description: "Fiscal year for the budget (defaults to 2027)",
    example: 2027
  })
  fiscalYear?: number;

  @ApiProperty({
    type: String,
    format: "uuid",
    required: false,
    description: "Optional UUID of the company (resolved automatically from property if omitted)",
    example: "b9a26559-9837-4215-95e9-f5ffd0a9fb5c"
  })
  companyId?: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    required: false,
    description: "Optional UUID of the organisation (resolved automatically from property if omitted)",
    example: "38bc82c3-a017-49fc-a441-0c75994527dd"
  })
  organisationId?: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    required: false,
    description: "Optional UUID of the Entrata integration source (resolved automatically if omitted)",
    example: "00005001-2f79-ff92-71d4-43aa25eac701"
  })
  integrationSourceId?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: true,
    description: "If true, generates and validates the Entrata payload without sending external HTTP POST (defaults to true)",
    example: true
  })
  dryRun?: boolean;

  @ApiProperty({
    type: Boolean,
    required: false,
    default: true,
    description: "If true, applies pending changeset into calc_lines and line_details before exporting (defaults to true)",
    example: true
  })
  applyLatestChangeset?: boolean;

  @ApiProperty({
    type: String,
    required: false,
    description: "Optional custom budget name to send to Entrata (defaults to Livano Cary (past))",
    example: "Livano Cary (past)"
  })
  budgetName?: string;

  @ApiProperty({
    type: String,
    enum: ["OPERATING", "CAPEX", "ALL"],
    required: false,
    default: "OPERATING",
    description: "Scope of accounts to export: OPERATING (P&L only), CAPEX (Capital/Fixed Assets only), or ALL (all accounts)",
    example: "OPERATING"
  })
  budgetScope?: "OPERATING" | "CAPEX" | "ALL";
}

export class UpdateBudgetRequestDto extends SendBudgetRequestDto {
  @ApiProperty({
    type: String,
    required: false,
    description: "Optional Entrata budget ID to update (defaults to 9692 or resolved from DB)",
    example: "9692"
  })
  budgetId?: string;
}

export interface SendBudgetResponse {
  success: boolean;
  dryRun?: boolean;
  message: string;
  budgetScope?: "OPERATING" | "CAPEX" | "ALL" | string;
  property: {
    id: string;
    propertyCode: string;
    propertyName: string;
  };
  targetEntrataProperty?: {
    propertyId: string;
    propertyName: string;
  };
  maskedEntrataProperty?: {
    propertyId: string;
    propertyName: string;
  };
  fiscalYear: number;
  requestId?: string;
  budgetId?: string;
  budgetName?: string;
  glAccountsCount?: number;
  endpointUrl: string;
  syncRunId?: string;
  stagingBatchId?: string;
  statusCode?: number;
  entrataResponse?: unknown;
  generatedPayload?: unknown;
  changesetApplied?: unknown;
}
