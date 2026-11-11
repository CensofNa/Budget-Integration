import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { BudgetServiceModule } from "./budget-service.module.js";
import { startDomainWorker, stopDomainWorker } from "../../worker/src/domain-worker-loader.js";

async function bootstrap(): Promise<void> {
  const port = Number(process.env.BUDGET_SERVICE_PORT ?? process.env.PORT ?? 3002);
  const enableWorker = (process.env.ENABLE_EMBEDDED_WORKER ?? "true").toLowerCase() !== "false";

  if (enableWorker) {
    console.log("[budget-service] Starting pg-boss worker for BUDGET_DOMAIN...");
    await startDomainWorker("BUDGET_DOMAIN");
  }

  const app = await NestFactory.create(BudgetServiceModule);

  const config = new DocumentBuilder()
    .setTitle("Budget Domain Integration API")
    .setDescription("Budgets, Budget Actuals, Income Statement Actuals, Budget Reports, and Property Closings sync API & Worker")
    .setVersion("1.0.0")
    .addTag("budget-sync")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(port, "0.0.0.0");
  console.log(`[budget-service] API started on http://localhost:${port}`);
  console.log(`[budget-service] Swagger UI is available on http://localhost:${port}/api`);

  const shutdown = async (signal: string) => {
    console.log(`[budget-service] ${signal} received, shutting down gracefully...`);
    await app.close();
    if (enableWorker) {
      await stopDomainWorker();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((error: unknown) => {
  console.error("[budget-service] Failed to start", error);
  process.exitCode = 1;
});
