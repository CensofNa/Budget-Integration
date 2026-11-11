import { IntegrationModule } from "./modules/integration/integration.module.js";
import { Module } from "@nestjs/common";

@Module({
  imports: [
    IntegrationModule
  ]
})
export class AppModule {}