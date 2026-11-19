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
export class SyncReportDataRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    reportCode;
    reportName;
    reportVersion;
    methodVersion;
    filters;
    propertyIds;
    fiscalYear;
    includePriorYear;
    periodStart;
    periodEnd;
    updateFiscalConfig;
    updateReforecast;
    reforecastPostMonth;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Report code (e.g. box_score, resident_retention)" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "reportCode", void 0);
__decorate([
    ApiPropertyOptional({ type: String }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "reportName", void 0);
__decorate([
    ApiPropertyOptional({ type: String }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "reportVersion", void 0);
__decorate([
    ApiPropertyOptional({ type: String }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "methodVersion", void 0);
__decorate([
    ApiPropertyOptional({ type: Object }),
    __metadata("design:type", Object)
], SyncReportDataRequestDto.prototype, "filters", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], description: "List of property IDs or codes" }),
    __metadata("design:type", Array)
], SyncReportDataRequestDto.prototype, "propertyIds", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "Fiscal year" }),
    __metadata("design:type", Number)
], SyncReportDataRequestDto.prototype, "fiscalYear", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, description: "Include prior year data" }),
    __metadata("design:type", Boolean)
], SyncReportDataRequestDto.prototype, "includePriorYear", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Period start date" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "periodStart", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Period end date" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "periodEnd", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean }),
    __metadata("design:type", Boolean)
], SyncReportDataRequestDto.prototype, "updateFiscalConfig", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false, description: "Whether to sync transformed actuals into occupancy reforecast" }),
    __metadata("design:type", Boolean)
], SyncReportDataRequestDto.prototype, "updateReforecast", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Optional reforecast cutoff month (e.g. 2026-10 or 2026-10-31) to lock and sync actuals through" }),
    __metadata("design:type", String)
], SyncReportDataRequestDto.prototype, "reforecastPostMonth", void 0);
//# sourceMappingURL=sync-report-data-request.dto.js.map