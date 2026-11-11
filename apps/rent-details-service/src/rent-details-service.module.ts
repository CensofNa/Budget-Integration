import { Module } from "@nestjs/common";
import { RentDetailsSyncController } from "./rent-details-sync.controller.js";

@Module({
  controllers: [RentDetailsSyncController]
})
export class RentDetailsServiceModule {}
