import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import axios, { AxiosError } from "axios";
import { prisma } from "@budget-integration/database";
import type {
  SendBudgetRequestDto,
  UpdateBudgetRequestDto,
  SendBudgetResponse
} from "../dto/send-budget-request.dto.js";

// Testing masking values requested for Entrata
export const MASKED_ENTRATA_PROPERTY_ID = "100141352";
export const MASKED_ENTRATA_PROPERTY_NAME = "Livano Cary (past)";

@Injectable()
export class SendEntrataBudgetsService {
  private readonly logger = new Logger(SendEntrataBudgetsService.name);

  async execute(dto: SendBudgetRequestDto): Promise<SendBudgetResponse> {
    return this.executeMode("CREATE", dto);
  }

  async executeUpdate(dto: UpdateBudgetRequestDto): Promise<SendBudgetResponse> {
    return this.executeMode("UPDATE", dto);
  }

  private async executeMode(
    mode: "CREATE" | "UPDATE",
    dto: UpdateBudgetRequestDto
  ): Promise<SendBudgetResponse> {
    const isCreate = mode === "CREATE";
    const methodName = isCreate ? "sendBudgets" : "updateBudgets";
    const syncType = isCreate ? "BUDGET_EXPORT" : "BUDGET_UPDATE";
    const errorCode = isCreate ? "ENTRATA_SEND_BUDGETS_ERROR" : "ENTRATA_UPDATE_BUDGETS_ERROR";

    const {
      propertyId,
      fiscalYear = 2027,
      dryRun = true,
      applyLatestChangeset = true,
      budgetScope = "OPERATING"
    } = dto;

    this.logger.log(
      `Initiating Entrata ${methodName}. Input propertyId: ${propertyId}, fiscalYear: ${fiscalYear}, dryRun: ${dryRun}, budgetScope: ${budgetScope}`
    );

    // 1. Find the source property internally by UUID or property_code
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyId);

    const property = isUuid
      ? await prisma.property.findUnique({ where: { id: propertyId } })
      : await prisma.property.findFirst({ where: { code: propertyId } });

    if (!property) {
      throw new NotFoundException(
        `Property '${propertyId}' not found in internal database. Please provide a valid internal property UUID or property code.`
      );
    }

    const internalPropertyId = property.id;
    const internalPropertyCode = property.code ?? "";
    const internalPropertyName = property.name ?? "";
    const companyId = dto.companyId ?? property.companyId;
    const organisationId = dto.organisationId ?? property.organisationId;

    this.logger.log(
      `Found internal source property: ${internalPropertyName} (${internalPropertyCode}, id: ${internalPropertyId}). Generating budget data...`
    );

    // 2. Optional: apply latest changeset on this property before generating budget
    let changesetResult: unknown = null;
    if (applyLatestChangeset) {
      this.logger.log(
        `Applying latest budget changeset for internal property: ${internalPropertyId}, Fiscal Year: ${fiscalYear}`
      );
      const csRows: any[] = await prisma.$queryRawUnsafe(`
        SELECT public.fn_apply_latest_budget_changeset(
          '${internalPropertyId}'::uuid,
          ${fiscalYear},
          false
        ) AS result;
      `);
      changesetResult = csRows[0]?.result;
      this.logger.log(`Changeset applied result: ${JSON.stringify(changesetResult)}`);
    }

    // 3. Generate the Entrata JSON payload dynamically from this property
    this.logger.log(
      `Invoking ${isCreate ? 'public.fn_generate_entrata_send_budgets_json' : 'public.fn_generate_entrata_update_budgets_json'} for property: ${internalPropertyId}`
    );
    const genRows: any[] = isCreate
      ? await prisma.$queryRawUnsafe(`
          SELECT public.fn_generate_entrata_send_budgets_json(
            '${internalPropertyId}'::uuid,
            ${fiscalYear}::integer,
            true,
            '${budgetScope}'::text
          ) AS payload;
        `)
      : await prisma.$queryRawUnsafe(`
          SELECT public.fn_generate_entrata_update_budgets_json(
            '${internalPropertyId}'::uuid,
            ${fiscalYear}::integer,
            ${dto.budgetId ? `'${dto.budgetId}'::text` : 'NULL::text'},
            true,
            '${budgetScope}'::text
          ) AS payload;
        `);

    const payload = genRows[0]?.payload;
    if (!payload || !payload.method?.params?.budgets?.budget?.length) {
      throw new BadRequestException(
        `No working budget lines or snapshot found for property ${internalPropertyName} (${internalPropertyCode}) in fiscal year ${fiscalYear}.`
      );
    }

    // 4. Configure outbound property details for Entrata using actual property code and name
    const budgetObj = payload.method?.params?.budgets?.budget?.[0];
    const targetPropertyId = internalPropertyCode;
    const defaultBudgetName = (budgetObj?.budgetName && budgetObj.budgetName.includes(String(fiscalYear)))
      ? budgetObj.budgetName
      : `${internalPropertyName} ${fiscalYear}${budgetScope === "CAPEX" ? " Capex" : ""}`;
    const targetBudgetName = dto.budgetName ?? defaultBudgetName;

    if (payload.method?.params) {
      payload.method.params.propertyId = targetPropertyId;
      if (budgetObj) {
        if (isCreate) {
          budgetObj.budgetName = targetBudgetName;
          delete budgetObj.id;
          delete budgetObj.propertyName;
        } else if (dto.budgetId) {
          budgetObj.budgetId = Number(dto.budgetId);
        }
      }
    }

    // Ensure requestId is formatted as: property_code + unique number (timestamp)
    const propertyCodeForRequestId =
      internalPropertyCode || payload.method?.params?.propertyId || "100141352";
    payload.requestId = `${propertyCodeForRequestId}_${Date.now()}`;

    const budgetName = isCreate ? budgetObj?.budgetName : undefined;
    const budgetId = !isCreate ? String(budgetObj?.budgetId ?? dto.budgetId ?? "") : undefined;
    const glAccountsCount = budgetObj?.glAccounts?.glAccount?.length ?? 0;

    // 5. Resolve active Entrata integration source & credentials
    const integrationSource = await prisma.integrationSource.findFirst({
      where: {
        ...(dto.integrationSourceId ? { id: dto.integrationSourceId } : {}),
        companyId,
        organisationId,
        sourceType: "entrata",
        isActive: true
      },
      include: {
        config: true
      }
    });

    const configConn = (integrationSource?.config?.connectionJson as Record<string, any>) ?? {};
    const configCreds = (integrationSource?.config?.credentialsJson as Record<string, any>) ?? {};

    const baseUrl =
      configConn.baseUrl ??
      process.env.ENTRATA_BASE_URL ??
      "https://apis.entrata.com";
    const orgSlug = configConn.orgSlug ?? "galleryresidential";
    const apiKey =
      configCreds.apiKey ??
      process.env.ENTRATA_API_KEY ??
      "";

    const endpointUrl = `${baseUrl.replace(/\/+$/, "")}/ext/orgs/${orgSlug}/v1/financial`;

    // 6. Handle Dry Run mode (preview without transmitting)
    if (dryRun) {
      this.logger.log(`DryRun requested. Returning generated payload without transmitting.`);
      return {
        success: true,
        dryRun: true,
        message: `Dry run completed successfully for ${methodName}. Target property: ${internalPropertyName} (Entrata ID: ${targetPropertyId}).`,
        property: {
          id: internalPropertyId,
          propertyCode: internalPropertyCode,
          propertyName: internalPropertyName
        },
        targetEntrataProperty: {
          propertyId: targetPropertyId,
          propertyName: targetBudgetName
        },
        maskedEntrataProperty: {
          propertyId: targetPropertyId,
          propertyName: targetBudgetName
        },
        fiscalYear,
        budgetScope,
        requestId: payload.requestId,
        ...(budgetName ? { budgetName } : {}),
        ...(budgetId ? { budgetId } : {}),
        glAccountsCount,
        endpointUrl,
        generatedPayload: payload,
        changesetApplied: changesetResult
      };
    }

    if (!apiKey) {
      throw new BadRequestException(
        "Entrata API key is not configured in integration_source_configs or ENTRATA_API_KEY environment variable."
      );
    }

    // 7. Record Integration Sync Run
    const requestId = String(payload.requestId ?? `${methodName}-${Date.now()}`);
    const syncRun = await prisma.integrationSyncRun.create({
      data: {
        companyId,
        organisationId,
        integrationSourceId: integrationSource?.id ?? property.companyId,
        entityName: "Budget",
        syncType,
        status: "STARTED",
        requestId,
        recordsReceived: 1,
        recordsProcessed: 0,
        recordsFailed: 0
      }
    });

    // 8. Dispatch HTTP POST to Entrata endpoint & record StagingApiBatch
    try {
      this.logger.log(`Sending HTTP POST to Entrata: ${endpointUrl} (PropertyId: ${targetPropertyId}, BudgetName: ${targetBudgetName})`);
      const response = await axios.post(endpointUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey
        },
        timeout: 90000
      });

      const responseCode = response.status;
      const responseData = response.data;
      const isSuccess = responseCode >= 200 && responseCode < 300;

      // Persist in staging_api_batches
      const batch = await prisma.stagingApiBatch.create({
        data: {
          companyId,
          organisationId,
          integrationSourceId: integrationSource?.id ?? property.companyId,
          syncRunId: syncRun.id,
          entityName: "Budget",
          sourceMethod: methodName,
          requestId,
          responseCode,
          rawRequest: payload,
          rawResponse: responseData,
          status: isSuccess ? "SUCCESS" : "FAILED"
        }
      });

      // Update sync run
      await prisma.integrationSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: isSuccess ? "COMPLETED" : "FAILED",
          responseCode,
          recordsProcessed: isSuccess ? 1 : 0,
          recordsFailed: isSuccess ? 0 : 1,
          completedAt: new Date()
        }
      });

      this.logger.log(
        `Entrata ${methodName} completed with HTTP ${responseCode}. SyncRun: ${syncRun.id}, Batch: ${batch.id}`
      );

      // If budget creation was successful, query Entrata getBudgets to retrieve the generated budgetId and upsert property_budgets
      let retrievedBudgetId = budgetId;
      if (isSuccess && isCreate) {
        try {
          this.logger.log(
            `Querying Entrata getBudgets to retrieve newly created budgetId for ${targetBudgetName}...`
          );
          const foundId = await this.fetchAndStoreEntrataBudgetId({
            endpointUrl,
            apiKey,
            internalPropertyId,
            propertyCodeForRequestId,
            targetPropertyId,
            fiscalYear,
            budgetName: targetBudgetName,
            companyId,
            organisationId
          });
          if (foundId) {
            retrievedBudgetId = foundId;
            this.logger.log(
              `Successfully retrieved Entrata budgetId '${retrievedBudgetId}' and saved to property_budgets.`
            );
          }
        } catch (fetchErr: any) {
          this.logger.warn(
            `Failed to auto-retrieve budgetId via getBudgets: ${fetchErr?.message}`
          );
        }
      }

      return {
        success: isSuccess,
        dryRun: false,
        message: isSuccess
          ? `Budget ${isCreate ? 'exported' : 'updated'} and sent to Entrata successfully for property ${internalPropertyName} (Entrata ID: ${targetPropertyId}).`
          : `Entrata returned status code ${responseCode}`,
        property: {
          id: internalPropertyId,
          propertyCode: internalPropertyCode,
          propertyName: internalPropertyName
        },
        targetEntrataProperty: {
          propertyId: targetPropertyId,
          propertyName: targetBudgetName
        },
        maskedEntrataProperty: {
          propertyId: targetPropertyId,
          propertyName: targetBudgetName
        },
        fiscalYear,
        budgetScope,
        requestId,
        ...(budgetName ? { budgetName } : {}),
        ...(retrievedBudgetId ? { budgetId: retrievedBudgetId } : {}),
        glAccountsCount,
        endpointUrl,
        syncRunId: syncRun.id,
        stagingBatchId: batch.id,
        statusCode: responseCode,
        entrataResponse: responseData,
        changesetApplied: changesetResult
      };
    } catch (error: unknown) {
      let statusCode = 500;
      let errorResponse: any = null;
      let errorMessage = "Unknown error occurred while contacting Entrata";

      if (error instanceof AxiosError) {
        statusCode = error.response?.status ?? 502;
        errorResponse = error.response?.data ?? null;
        errorMessage = error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.logger.error(
        `Failed to send budget to Entrata: ${errorMessage} (Status: ${statusCode})`,
        error instanceof Error ? error.stack : undefined
      );

      // Record failed batch in staging_api_batches
      const failedBatch = await prisma.stagingApiBatch.create({
        data: {
          companyId,
          organisationId,
          integrationSourceId: integrationSource?.id ?? property.companyId,
          syncRunId: syncRun.id,
          entityName: "Budget",
          sourceMethod: methodName,
          requestId,
          responseCode: statusCode,
          rawRequest: payload,
          rawResponse: errorResponse ?? { error: errorMessage },
          status: "FAILED",
          errorMessage
        }
      });

      // Record failed sync run
      await prisma.integrationSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "FAILED",
          responseCode: statusCode,
          recordsFailed: 1,
          errorMessage,
          completedAt: new Date()
        }
      });

      // Record error log in integration_error_logs
      await prisma.integrationErrorLog.create({
        data: {
          companyId,
          organisationId,
          integrationSourceId: integrationSource?.id ?? null,
          syncRunId: syncRun.id,
          entityName: "Budget",
          errorCode,
          errorMessage,
          errorCategory: "API_ERROR",
          severity: "ERROR",
          contextJson: {
            internalPropertyId,
            targetPropertyId,
            fiscalYear,
            endpointUrl,
            statusCode,
            entrataErrorResponse: errorResponse
          },
          stackTrace: error instanceof Error ? (error.stack ?? null) : null
        }
      });

      throw new InternalServerErrorException({
        message: `Failed to transmit budget to Entrata: ${errorMessage}`,
        internalPropertyId,
        targetPropertyId,
        propertyCode: targetPropertyId,
        fiscalYear,
        statusCode,
        syncRunId: syncRun.id,
        stagingBatchId: failedBatch.id,
        entrataResponse: errorResponse
      });
    }
  }

  private async fetchAndStoreEntrataBudgetId(params: {
    endpointUrl: string;
    apiKey: string;
    internalPropertyId: string;
    propertyCodeForRequestId: string;
    targetPropertyId: string;
    fiscalYear: number;
    budgetName: string;
    companyId: string;
    organisationId: string;
  }): Promise<string | undefined> {
    const getBudgetsPayload = {
      auth: { type: "apikey" },
      requestId: `${params.propertyCodeForRequestId}_get_budgets_${Date.now()}`,
      method: {
        name: "getBudgets",
        version: "r1",
        params: {
          propertyIds: params.targetPropertyId,
          fiscalYears: String(params.fiscalYear)
        }
      }
    };

    const getRes = await axios.post(params.endpointUrl, getBudgetsPayload, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": params.apiKey
      },
      timeout: 30000
    });

    const properties = getRes.data?.response?.result?.properties?.property;
    const propArr = Array.isArray(properties) ? properties : properties ? [properties] : [];
    let matchedBudgetId: string | undefined;

    for (const p of propArr) {
      const budgets = p.budgets?.budget;
      const bArr = Array.isArray(budgets) ? budgets : budgets ? [budgets] : [];
      for (const b of bArr) {
        if (
          String(b.budgetName).trim().toLowerCase() === params.budgetName.trim().toLowerCase() &&
          Number(b.fiscalYear) === params.fiscalYear
        ) {
          matchedBudgetId = String(b.id);
          break;
        }
      }
      if (matchedBudgetId) break;
    }

    // Fallback: If exact name match not found but only one budget for that fiscal year exists
    if (!matchedBudgetId && propArr[0]?.budgets?.budget) {
      const bArr = Array.isArray(propArr[0].budgets.budget)
        ? propArr[0].budgets.budget
        : [propArr[0].budgets.budget];
      const matchYear = bArr.filter((b: any) => Number(b.fiscalYear) === params.fiscalYear);
      if (matchYear.length === 1) {
        matchedBudgetId = String(matchYear[0].id);
      }
    }

    if (matchedBudgetId) {
      const existingPb = await prisma.propertyBudget.findFirst({
        where: {
          propertyId: params.internalPropertyId,
          fiscalYear: params.fiscalYear
        }
      });

      if (existingPb) {
        await prisma.propertyBudget.update({
          where: { id: existingPb.id },
          data: {
            sourceBudgetId: matchedBudgetId,
            budgetName: params.budgetName,
            lastSyncedAt: new Date(),
            updatedSource: "ENTRATA"
          }
        });
      } else {
        await prisma.propertyBudget.create({
          data: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            propertyId: params.internalPropertyId,
            sourceBudgetId: matchedBudgetId,
            budgetName: params.budgetName,
            fiscalYear: params.fiscalYear,
            budgetStatusTypeId: "3",
            isDefault: true,
            createdSource: "ENTRATA",
            updatedSource: "ENTRATA",
            lastSyncedAt: new Date()
          }
        });
      }
    }

    return matchedBudgetId;
  }
}

