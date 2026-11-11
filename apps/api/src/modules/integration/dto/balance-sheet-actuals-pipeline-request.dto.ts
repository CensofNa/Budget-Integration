import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StageBalanceSheetActualsRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiProperty({ type: String, description: "The UUID of the sync run" })
  syncRunId!: string;

  @ApiPropertyOptional({ type: String, description: "Optional single reportLogId to stage" })
  reportLogId?: string;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically trigger transform after staging" })
  autoTransform?: boolean;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically trigger projection after transform" })
  autoProject?: boolean;
}

export class TransformBalanceSheetActualsRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiProperty({ type: String, description: "The UUID of the sync run" })
  syncRunId!: string;

  @ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically trigger projection after transform" })
  autoProject?: boolean;
}

export class ProjectBalanceSheetActualsRequestDto {
  @ApiProperty({ type: String, description: "The UUID of the company" })
  companyId!: string;

  @ApiProperty({ type: String, description: "The UUID of the organisation" })
  organisationId!: string;

  @ApiProperty({ type: String, description: "The UUID of the integration source" })
  integrationSourceId!: string;

  @ApiPropertyOptional({ type: String, description: "The UUID of the sync run" })
  syncRunId?: string;

  @ApiPropertyOptional({ type: String, description: "Optional property UUID to project" })
  propertyId?: string;

  @ApiPropertyOptional({ type: Number, description: "Optional fiscal year to project" })
  fiscalYear?: number;
}
