var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
export class ProjectBudgetReportRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    syncRunId;
    propertyId;
    fiscalYear;
    accountCode;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], ProjectBudgetReportRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], ProjectBudgetReportRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], ProjectBudgetReportRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Specific Sync Run UUID to project" }),
    __metadata("design:type", String)
], ProjectBudgetReportRequestDto.prototype, "syncRunId", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Specific Property UUID (null = all properties)" }),
    __metadata("design:type", String)
], ProjectBudgetReportRequestDto.prototype, "propertyId", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, default: 2026, description: "Fiscal year (e.g. 2026)" }),
    __metadata("design:type", Number)
], ProjectBudgetReportRequestDto.prototype, "fiscalYear", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Specific GL account code (null = all accounts)" }),
    __metadata("design:type", String)
], ProjectBudgetReportRequestDto.prototype, "accountCode", void 0);
//# sourceMappingURL=project-budget-report-request.dto.js.map