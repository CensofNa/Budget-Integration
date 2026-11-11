import { Module } from "@nestjs/common";
import { PropertySyncController } from "./property-sync.controller.js";

@Module({
  controllers: [PropertySyncController]
})
export class PropertyServiceModule {}
