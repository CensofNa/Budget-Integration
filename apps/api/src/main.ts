import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);
	const port = Number(process.env.PORT ?? 3000);

	const config = new DocumentBuilder()
		.setTitle("Budget Integration API")
		.setDescription("API documentation for the budget integration sync platform")
		.setVersion("1.0.0")
		.addTag("integration-sync")
		.build();
	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup("api", app, document);

	await app.listen(port, "0.0.0.0");
	console.log(`Budget Integration API started on http://localhost:${port}`);
	console.log(`Swagger UI is available on http://localhost:${port}/api`);
}

bootstrap().catch((error: unknown) => {
	console.error("Failed to start Budget Integration API", error);
	process.exitCode = 1;
});
