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
export class SyncBudgetReportRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    budgetType;
    fiscalYear;
    targetBudgetYear;
    propertyIds;
    ownerFilter;
    glTreeId;
    glBookIds;
    budgetStatus;
    includeZeroBalance;
    autoProcess;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiPropertyOptional({
        type: String,
        enum: ["currentfy", "previousfy"],
        description: "Budget type: 'currentfy' (uses current FY as reference to create next FY budget) or 'previousfy' (uses previous FY as reference)",
    }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "budgetType", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "The reference fiscal year for the sync (e.g. 2026). If omitted, determined by budgetType." }),
    __metadata("design:type", Number)
], SyncBudgetReportRequestDto.prototype, "fiscalYear", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "The target budget year being created (defaults to reference fiscalYear + 1, e.g. 2027)" }),
    __metadata("design:type", Number)
], SyncBudgetReportRequestDto.prototype, "targetBudgetYear", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], description: "List of property codes (sourcePropertyIds) to sync" }),
    __metadata("design:type", Array)
], SyncBudgetReportRequestDto.prototype, "propertyIds", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Filter properties by owner (e.g. 'Livano' or 'Non-Livano')", enum: ["all", "livano", "non-livano"], default: "all" }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "ownerFilter", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "GL Tree ID (e.g. '1913')", default: "1913" }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "glTreeId", void 0);
__decorate([
    ApiPropertyOptional({ type: [Number], description: "List of GL Book IDs (e.g. [1909])" }),
    __metadata("design:type", Array)
], SyncBudgetReportRequestDto.prototype, "glBookIds", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Budget Status ID (e.g. '3')" }),
    __metadata("design:type", String)
], SyncBudgetReportRequestDto.prototype, "budgetStatus", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Include zero balances" }),
    __metadata("design:type", Boolean)
], SyncBudgetReportRequestDto.prototype, "includeZeroBalance", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false, description: "Auto-trigger stage, transform, and project pipeline" }),
    __metadata("design:type", Boolean)
], SyncBudgetReportRequestDto.prototype, "autoProcess", void 0);
//# sourceMappingURL=sync-budget-report-request.dto.js.map