import { Module } from "@nestjs/common";
import { BudgetSyncController } from "./budget-sync.controller.js";
import { SendEntrataBudgetsService } from "@budget-integration/domain-budget";

@Module({
  controllers: [BudgetSyncController],
  providers: [SendEntrataBudgetsService],
  exports: [SendEntrataBudgetsService]
})
export class BudgetServiceModule {}
