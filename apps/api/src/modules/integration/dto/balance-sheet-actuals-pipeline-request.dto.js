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
export class StageBalanceSheetActualsRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    syncRunId;
    reportLogId;
    autoTransform;
    autoProject;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], StageBalanceSheetActualsRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], StageBalanceSheetActualsRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], StageBalanceSheetActualsRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the sync run" }),
    __metadata("design:type", String)
], StageBalanceSheetActualsRequestDto.prototype, "syncRunId", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Optional single reportLogId to stage" }),
    __metadata("design:type", String)
], StageBalanceSheetActualsRequestDto.prototype, "reportLogId", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically trigger transform after staging" }),
    __metadata("design:type", Boolean)
], StageBalanceSheetActualsRequestDto.prototype, "autoTransform", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically trigger projection after transform" }),
    __metadata("design:type", Boolean)
], StageBalanceSheetActualsRequestDto.prototype, "autoProject", void 0);
export class TransformBalanceSheetActualsRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    syncRunId;
    autoProject;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], TransformBalanceSheetActualsRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], TransformBalanceSheetActualsRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], TransformBalanceSheetActualsRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the sync run" }),
    __metadata("design:type", String)
], TransformBalanceSheetActualsRequestDto.prototype, "syncRunId", void 0);
__decorate([
    ApiPropertyOptional({ type: Boolean, default: true, description: "Automatically trigger projection after transform" }),
    __metadata("design:type", Boolean)
], TransformBalanceSheetActualsRequestDto.prototype, "autoProject", void 0);
export class ProjectBalanceSheetActualsRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    syncRunId;
    propertyId;
    fiscalYear;
}
__decorate([
    ApiProperty({ type: String, description: "The UUID of the company" }),
    __metadata("design:type", String)
], ProjectBalanceSheetActualsRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the organisation" }),
    __metadata("design:type", String)
], ProjectBalanceSheetActualsRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({ type: String, description: "The UUID of the integration source" }),
    __metadata("design:type", String)
], ProjectBalanceSheetActualsRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "The UUID of the sync run" }),
    __metadata("design:type", String)
], ProjectBalanceSheetActualsRequestDto.prototype, "syncRunId", void 0);
__decorate([
    ApiPropertyOptional({ type: String, description: "Optional property UUID to project" }),
    __metadata("design:type", String)
], ProjectBalanceSheetActualsRequestDto.prototype, "propertyId", void 0);
__decorate([
    ApiPropertyOptional({ type: Number, description: "Optional fiscal year to project" }),
    __metadata("design:type", Number)
], ProjectBalanceSheetActualsRequestDto.prototype, "fiscalYear", void 0);
//# sourceMappingURL=balance-sheet-actuals-pipeline-request.dto.js.map