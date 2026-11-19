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
export class SyncBalanceSheetActualsRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    fiscalYear;
    propertyIds;
    propertyCodes;
    ownerFilter;
    glTreeId;
    glBookIds;
    accountingMethod;
    trailingPeriods;
    autoStage;
    autoTransform;
    autoProject;
    runSynchronously;
    syncMode;
    stream;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "The fiscal year for the sync (e.g. 2026)" }),
    __metadata("design:type", Number)
], SyncBalanceSheetActualsRequestDto.prototype, "fiscalYear", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], description: "List of property codes or UUIDs to sync" }),
    __metadata("design:type", Array)
], SyncBalanceSheetActualsRequestDto.prototype, "propertyIds", void 0);
__decorate([
    ApiPropertyOptional({ type: [String], description: "List of property codes to sync" }),
    __metadata("design:type", Array)
], SyncBalanceSheetActualsRequestDto.prototype, "propertyCodes", void 0);
__decorate([
    ApiPropertyOptional({ enum: ["all", "livano", "non-livano"], default: "all", description: "Filter properties by owner (Livano vs Non-Livano)" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "ownerFilter", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "GL Tree ID override (auto-resolves 1913 for Livano, 1812 for Non-Livano if omitted)" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "glTreeId", void 0);
__decorate([
    ApiPropertyOptional({ type: [Number], description: "List of GL Book IDs (defaults to [1909])" }),
    __metadata("design:type", Array)
], SyncBalanceSheetActualsRequestDto.prototype, "glBookIds", void 0);
__decorate([
    ApiPropertyOptional({ type: String, enum: ["accrual", "cash"], default: "accrual" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "accountingMethod", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "Trailing periods override (defaults to current month - fiscalYearStartMonth + 1)" }),
    __metadata("design:type", Number)
], SyncBalanceSheetActualsRequestDto.prototype, "trailingPeriods", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically stage rows after fetch" }),
    __metadata("design:type", Boolean)
], SyncBalanceSheetActualsRequestDto.prototype, "autoStage", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically transform rows after staging" }),
    __metadata("design:type", Boolean)
], SyncBalanceSheetActualsRequestDto.prototype, "autoTransform", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically project rows to budget_calc_lines after transform" }),
    __metadata("design:type", Boolean)
], SyncBalanceSheetActualsRequestDto.prototype, "autoProject", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false, description: "Run synchronously instead of enqueueing background job" }),
    __metadata("design:type", Boolean)
], SyncBalanceSheetActualsRequestDto.prototype, "runSynchronously", void 0);
__decorate([
    ApiPropertyOptional({ enum: ["SYNC", "QUEUE", "STREAM"], default: "QUEUE", description: "Execution mode: 'SYNC' for inline execution, 'QUEUE' for background job, 'STREAM' for live streaming" }),
    __metadata("design:type", String)
], SyncBalanceSheetActualsRequestDto.prototype, "syncMode", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: false, description: "Stream live logs progressively using chunked transfer encoding" }),
    __metadata("design:type", Boolean)
], SyncBalanceSheetActualsRequestDto.prototype, "stream", void 0);
//# sourceMappingURL=sync-balance-sheet-actuals-request.dto.js.map