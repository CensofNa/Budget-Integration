import { Module } from "@nestjs/common";

import { IntegrationSyncController } from "./integration-sync.controller.js";
import { SendEntrataBudgetsService } from "./services/send-entrata-budgets.service.js";

@Module({
  controllers: [IntegrationSyncController],
  providers: [SendEntrataBudgetsService],
  exports: [SendEntrataBudgetsService]
})
export class IntegrationModule {}