var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ApiProperty } from "@nestjs/swagger";
export class SendBudgetRequestDto {
    propertyId;
    fiscalYear;
    companyId;
    organisationId;
    integrationSourceId;
    dryRun;
    applyLatestChangeset;
    budgetName;
}
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        description: "UUID of the property in Century Budget application",
        example: "323768dc-ecf6-49aa-9af3-0e41898b4cb9"
    }),
    __metadata("design:type", String)
], SendBudgetRequestDto.prototype, "propertyId", void 0);
__decorate([
    ApiProperty({
        type: Number,
        required: false,
        default: 2027,
        description: "Fiscal year for the budget (defaults to 2027)",
        example: 2027
    }),
    __metadata("design:type", Number)
], SendBudgetRequestDto.prototype, "fiscalYear", void 0);
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        required: false,
        description: "Optional UUID of the company (resolved automatically from property if omitted)",
        example: "b9a26559-9837-4215-95e9-f5ffd0a9fb5c"
    }),
    __metadata("design:type", String)
], SendBudgetRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        required: false,
        description: "Optional UUID of the organisation (resolved automatically from property if omitted)",
        example: "38bc82c3-a017-49fc-a441-0c75994527dd"
    }),
    __metadata("design:type", String)
], SendBudgetRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        required: false,
        description: "Optional UUID of the Entrata integration source (resolved automatically if omitted)",
        example: "00005001-2f79-ff92-71d4-43aa25eac701"
    }),
    __metadata("design:type", String)
], SendBudgetRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiProperty({
        type: Boolean,
        required: false,
        default: true,
        description: "If true, generates and validates the Entrata payload without sending external HTTP POST (defaults to true)",
        example: true
    }),
    __metadata("design:type", Boolean)
], SendBudgetRequestDto.prototype, "dryRun", void 0);
__decorate([
    ApiProperty({
        type: Boolean,
        required: false,
        default: true,
        description: "If true, applies pending changeset into calc_lines and line_details before exporting (defaults to true)",
        example: true
    }),
    __metadata("design:type", Boolean)
], SendBudgetRequestDto.prototype, "applyLatestChangeset", void 0);
__decorate([
    ApiProperty({
        type: String,
        required: false,
        description: "Optional custom budget name to send to Entrata (defaults to Livano Cary (past))",
        example: "Livano Cary (past)"
    }),
    __metadata("design:type", String)
], SendBudgetRequestDto.prototype, "budgetName", void 0);
export class UpdateBudgetRequestDto extends SendBudgetRequestDto {
    budgetId;
}
__decorate([
    ApiProperty({
        type: String,
        required: false,
        description: "Optional Entrata budget ID to update (defaults to 9692 or resolved from DB)",
        example: "9692"
    }),
    __metadata("design:type", String)
], UpdateBudgetRequestDto.prototype, "budgetId", void 0);
//# sourceMappingURL=send-budget-request.dto.js.map