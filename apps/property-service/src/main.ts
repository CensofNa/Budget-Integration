import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { PropertyServiceModule } from "./property-service.module.js";
import { startDomainWorker, stopDomainWorker } from "../../worker/src/domain-worker-loader.js";

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PROPERTY_SERVICE_PORT ?? process.env.PORT ?? 3001);
  const enableWorker = (process.env.ENABLE_EMBEDDED_WORKER ?? "true").toLowerCase() !== "false";

  if (enableWorker) {
    console.log("[property-service] Starting pg-boss worker for PROPERTY_DOMAIN...");
    await startDomainWorker("PROPERTY_DOMAIN");
  }

  const app = await NestFactory.create(PropertyServiceModule);

  const config = new DocumentBuilder()
    .setTitle("Property Domain Integration API")
    .setDescription("Property, Property Units, Unit Types, and GL Trees sync API & Worker")
    .setVersion("1.0.0")
    .addTag("property-sync")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(port, "0.0.0.0");
  console.log(`[property-service] API started on http://localhost:${port}`);
  console.log(`[property-service] Swagger UI is available on http://localhost:${port}/api`);

  const shutdown = async (signal: string) => {
    console.log(`[property-service] ${signal} received, shutting down gracefully...`);
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
  console.error("[property-service] Failed to start", error);
  process.exitCode = 1;
});
