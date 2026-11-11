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
export class SyncIncomeStatementActualsRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    fiscalYear;
    propertyIds;
    latestPostMonth;
    glTreeId;
    glBookIds;
    accountingMethod;
    periodType;
    trailingPeriods;
    includeDemo;
    autoProcess;
    updateReforecast;
    reforecastCutoffMonth;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiProperty({ type: Number, description: "The fiscal year for the sync (e.g. 2026)" }),
    __metadata("design:type", Number)
], SyncIncomeStatementActualsRequestDto.prototype, "fiscalYear", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], description: "List of property codes to sync" }),
    __metadata("design:type", Array)
], SyncIncomeStatementActualsRequestDto.prototype, "propertyIds", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Latest closed month (e.g. 2026-06)" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "latestPostMonth", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "GL Tree ID" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "glTreeId", void 0);
__decorate([
    ApiProperty({ type: [Number], description: "List of GL Book IDs to sync" }),
    __metadata("design:type", Array)
], SyncIncomeStatementActualsRequestDto.prototype, "glBookIds", void 0);
__decorate([
    ApiPropertyOptional({ type: String, enum: ["accrual", "cash"], default: "accrual" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "accountingMethod", void 0);
__decorate([
    ApiPropertyOptional({ type: String, default: "currentfyr" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "periodType", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "Number of trailing periods to sync" }),
    __metadata("design:type", Number)
], SyncIncomeStatementActualsRequestDto.prototype, "trailingPeriods", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], SyncIncomeStatementActualsRequestDto.prototype, "includeDemo", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], SyncIncomeStatementActualsRequestDto.prototype, "autoProcess", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], SyncIncomeStatementActualsRequestDto.prototype, "updateReforecast", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Reforecast cutoff month (e.g. 2026-06)" }),
    __metadata("design:type", String)
], SyncIncomeStatementActualsRequestDto.prototype, "reforecastCutoffMonth", void 0);
//# sourceMappingURL=sync-income-statement-actuals-request.dto.js.map