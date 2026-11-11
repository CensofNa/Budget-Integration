import { ApiProperty } from "@nestjs/swagger";

export class SyncPropertyClosingsRequestDto {
  @ApiProperty({
    type: String,
    format: "uuid",
    description: "UUID of the company",
    example: "b9a26559-9837-4215-95e9-f5ffd0a9fb5c",
  })
  companyId!: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    description: "UUID of the organisation",
    example: "38bc82c3-a017-49fc-a441-0c75994527dd",
  })
  organisationId!: string;

  @ApiProperty({
    type: String,
    format: "uuid",
    description: "UUID of the integration source",
    example: "00005001-2f79-ff92-71d4-43aa25eac701",
  })
  integrationSourceId!: string;

  @ApiProperty({
    type: [String],
    required: false,
    description: "Optional list of Entrata property codes (e.g. ['100121170']) to filter by",
    example: ["100121170"],
  })
  propertyIds?: string[];
}
