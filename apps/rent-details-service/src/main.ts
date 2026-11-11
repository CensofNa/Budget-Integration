import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { RentDetailsServiceModule } from "./rent-details-service.module.js";
import { startDomainWorker, stopDomainWorker } from "../../worker/src/domain-worker-loader.js";

async function bootstrap(): Promise<void> {
  const port = Number(process.env.RENT_DETAILS_SERVICE_PORT ?? process.env.PORT ?? 3003);
  const enableWorker = (process.env.ENABLE_EMBEDDED_WORKER ?? "true").toLowerCase() !== "false";

  if (enableWorker) {
    console.log("[rent-details-service] Starting pg-boss worker for RENT_DETAILS_DOMAIN...");
    await startDomainWorker("RENT_DETAILS_DOMAIN");
  }

  const app = await NestFactory.create(RentDetailsServiceModule);

  const config = new DocumentBuilder()
    .setTitle("Rent Details Domain Integration API")
    .setDescription("Box Score, Resident Retention, and Occupancy Projection sync API & Worker")
    .setVersion("1.0.0")
    .addTag("rent-details-sync")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(port, "0.0.0.0");
  console.log(`[rent-details-service] API started on http://localhost:${port}`);
  console.log(`[rent-details-service] Swagger UI is available on http://localhost:${port}/api`);

  const shutdown = async (signal: string) => {
    console.log(`[rent-details-service] ${signal} received, shutting down gracefully...`);
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
  console.error("[rent-details-service] Failed to start", error);
  process.exitCode = 1;
});
