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
export class SyncPropertyClosingsRequestDto {
    companyId;
    organisationId;
    integrationSourceId;
    propertyIds;
}
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        description: "UUID of the company",
        example: "b9a26559-9837-4215-95e9-f5ffd0a9fb5c",
    }),
    __metadata("design:type", String)
], SyncPropertyClosingsRequestDto.prototype, "companyId", void 0);
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        description: "UUID of the organisation",
        example: "38bc82c3-a017-49fc-a441-0c75994527dd",
    }),
    __metadata("design:type", String)
], SyncPropertyClosingsRequestDto.prototype, "organisationId", void 0);
__decorate([
    ApiProperty({
        type: String,
        format: "uuid",
        description: "UUID of the integration source",
        example: "00005001-2f79-ff92-71d4-43aa25eac701",
    }),
    __metadata("design:type", String)
], SyncPropertyClosingsRequestDto.prototype, "integrationSourceId", void 0);
__decorate([
    ApiProperty({
        type: [String],
        required: false,
        description: "Optional list of Entrata property codes (e.g. ['100121170']) to filter by",
        example: ["100121170"],
    }),
    __metadata("design:type", Array)
], SyncPropertyClosingsRequestDto.prototype, "propertyIds", void 0);
//# sourceMappingURL=sync-property-closings-request.dto.js.map