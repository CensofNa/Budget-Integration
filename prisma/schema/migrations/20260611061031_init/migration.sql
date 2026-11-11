-- CreateEnum
CREATE TYPE "UserPrincipalType" AS ENUM ('PLATFORM', 'COMPANY', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'MICROSOFT_ENTRA');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN_2FA', 'PASSWORD_RESET', 'EMAIL_VERIFICATION', 'INVITE_ACCEPTANCE');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS', 'AUTH_APP');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('PLATFORM', 'COMPANY', 'ORGANISATION', 'PROPERTY');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'DRAFT', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'CONFIGURED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('LEGAL_ENTITY', 'GROUPING');

-- CreateEnum
CREATE TYPE "EntityTypeDetail" AS ENUM ('LLC', 'LLP', 'CORPORATION', 'PARTNERSHIP', 'TRUST', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganisationKind" AS ENUM ('ROOT', 'OPERATIONAL');

-- CreateEnum
CREATE TYPE "OrganisationStatus" AS ENUM ('SETUP', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LicenseDurationUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('PREPARER', 'REVIEWER', 'APPROVER', 'OBSERVER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RefreshSessionRevokeReason" AS ENUM ('ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'PASSWORD_RESET', 'PASSWORD_CHANGE', 'ADMIN_REVOKED');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('ENTRATA');

-- CreateEnum
CREATE TYPE "GlobalAssumptionMethod" AS ENUM ('PER_PROPERTY_PER_WEEK', 'PER_PROPERTY_PER_MONTH', 'PER_PROPERTY_PER_YEAR', 'PER_PROPERTY_IN_PARTICULAR_MONTH', 'PER_UNIT_PER_MONTH', 'PER_UNIT_PER_YEAR', 'PER_APPLICATION_TIMES_2');

-- CreateEnum
CREATE TYPE "PayrollSalaryType" AS ENUM ('SINGLE', 'SPLIT', 'FULL_TIME', 'PART_TIME');

-- CreateEnum
CREATE TYPE "PayrollSalaryMeasureCode" AS ENUM ('SALARY_PER_HOUR', 'SALARY', 'OT_PAY', 'BONUS', 'EMPLOYEE_UNIT', 'TOTAL_SALARY');

-- CreateEnum
CREATE TYPE "PayrollCalculationMethod" AS ENUM ('MANUAL', 'EVENLY', 'REPEAT', 'STRAIGHT_LINE_GROWTH', 'COMPOUNDED_GROWTH');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "principalType" "UserPrincipalType" NOT NULL DEFAULT 'COMPANY',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "designation" TEXT,
    "notes" TEXT,
    "profileMetadata" JSONB,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "isSystemHidden" BOOLEAN NOT NULL DEFAULT false,
    "companyId" UUID,
    "organisationId" UUID,
    "isPrimaryCompanyAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isRootOrganisationAdmin" BOOLEAN NOT NULL DEFAULT false,
    "employeeCode" TEXT,
    "invitedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "loginName" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastAuthenticatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_credential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "destinationMasked" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otp_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "deviceName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" "RefreshSessionRevokeReason",
    "replacedBySessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dashboardKey" TEXT,
    "menuConfig" JSONB,
    "permissionConfig" JSONB,
    "isPlatformManaged" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_role_assignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "systemRoleId" UUID NOT NULL,
    "scopeType" "ScopeType" NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "companyId" UUID,
    "organisationId" UUID,
    "propertyId" UUID,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedByUserId" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigation_menu_item" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "route" TEXT,
    "section" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "scopeType" "ScopeType" NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "permissionCodes" JSONB,
    "navigationMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "navigation_menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_actvie" BOOLEAN NOT NULL DEFAULT true,
    "shortDisplayName" TEXT,
    "isSystemInternal" BOOLEAN NOT NULL DEFAULT false,
    "industry" TEXT,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "accessStatus" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "registeredAddressLine1" TEXT,
    "registeredAddressLine2" TEXT,
    "registeredCity" TEXT,
    "registeredState" TEXT,
    "registeredPostalCode" TEXT,
    "registeredCountry" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "primaryContactDesignation" TEXT,
    "billingContactName" TEXT,
    "billingContactEmail" TEXT,
    "billingContactPhone" TEXT,
    "contractStartDate" TIMESTAMP(3),
    "contractEndDate" TIMESTAMP(3),
    "canCompanyAdminAddOrganisation" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "auditCreatedByUserId" UUID,
    "auditModifiedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_budgets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "source_budget_id" VARCHAR(150),
    "budget_name" VARCHAR(250),
    "budget_status_type_id" VARCHAR(50),
    "is_default" BOOLEAN,
    "fiscal_year" INTEGER,
    "fiscal_start_date" TIMESTAMP(3),
    "fiscal_end_date" TIMESTAMP(3),
    "budget_total" DECIMAL(18,2),
    "currency_code" VARCHAR(20),
    "created_source" VARCHAR(100),
    "updated_source" VARCHAR(100),
    "last_synced_at" TIMESTAMP(3),
    "is_manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_budget_gl_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "source_gl_account_id" VARCHAR(150),
    "account_number" VARCHAR(100),
    "account_name" VARCHAR(250),
    "total_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_budget_gl_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_budget_monthly_amounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "budget_gl_account_id" UUID NOT NULL,
    "month_date" TIMESTAMP(3) NOT NULL,
    "month_no" INTEGER NOT NULL,
    "fiscal_year" INTEGER,
    "amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_budget_monthly_amounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_assumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "account_code" VARCHAR(50) NOT NULL,
    "account_name" VARCHAR(250) NOT NULL,
    "description" VARCHAR(250) NOT NULL,
    "method" "GlobalAssumptionMethod" NOT NULL,
    "amount" DECIMAL(18,5) NOT NULL,
    "setup_fee_per_month" DECIMAL(18,5) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_methods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "value_count" INTEGER NOT NULL DEFAULT 1,
    "formula" TEXT,
    "value_label_1" VARCHAR(100),
    "value_label_2" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_benefit_assumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "coa_account_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "amount_1" DECIMAL(18,5) NOT NULL,
    "amount_2" DECIMAL(18,5),
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "excluded_property" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "payroll_benefit_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_global_assumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "account_code" VARCHAR(50),
    "value" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_global_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_state_configs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "measure" VARCHAR(20) NOT NULL DEFAULT 'percentage',
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_state_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_state_assumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "state_id" UUID NOT NULL,
    "suta_percentage" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "suta_amount" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_state_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_position_assumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "position_code" VARCHAR(100) NOT NULL,
    "position_name" VARCHAR(200) NOT NULL,
    "classification" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "parent_position_id" UUID,

    CONSTRAINT "payroll_position_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_position_owner_values" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "owner_name" VARCHAR(100) NOT NULL,
    "overtime_hours_per_month" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "overhead_support_emp" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "workers_comp_percentage" DECIMAL(18,5) NOT NULL DEFAULT 0,
    "coa_account_id" UUID,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_position_owner_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_salary_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "position_assumption_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "salary_type" "PayrollSalaryType" NOT NULL DEFAULT 'FULL_TIME',
    "allocation_pct" DECIMAL(10,4),
    "notes" TEXT,
    "created_by" VARCHAR(100),
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_salary_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_salary_detail_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_salary_detail_id" UUID NOT NULL,
    "measure_code" "PayrollSalaryMeasureCode" NOT NULL,
    "measure_name" VARCHAR(100) NOT NULL,
    "calculation_method" "PayrollCalculationMethod" NOT NULL DEFAULT 'MANUAL',
    "input_value" DECIMAL(18,4),
    "percent_value" DECIMAL(10,4),
    "jan_amount" DECIMAL(18,2),
    "feb_amount" DECIMAL(18,2),
    "mar_amount" DECIMAL(18,2),
    "apr_amount" DECIMAL(18,2),
    "may_amount" DECIMAL(18,2),
    "jun_amount" DECIMAL(18,2),
    "jul_amount" DECIMAL(18,2),
    "aug_amount" DECIMAL(18,2),
    "sep_amount" DECIMAL(18,2),
    "oct_amount" DECIMAL(18,2),
    "nov_amount" DECIMAL(18,2),
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_salary_detail_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_input_methods" (
    "method_id" UUID NOT NULL,
    "method_name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "coa_input_methods_pkey" PRIMARY KEY ("method_id")
);

-- CreateTable
CREATE TABLE "coa_account_types" (
    "type_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "type_name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_account_types_pkey" PRIMARY KEY ("type_id")
);

-- CreateTable
CREATE TABLE "coa_account_heads" (
    "head_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "type_id" UUID NOT NULL,
    "head_name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_account_heads_pkey" PRIMARY KEY ("head_id")
);

-- CreateTable
CREATE TABLE "coa_account_groups" (
    "group_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "head_id" UUID NOT NULL,
    "group_name" VARCHAR(150) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_account_groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "coa_owners" (
    "owner_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "owner_name" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "email" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "coa_owners_pkey" PRIMARY KEY ("owner_id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "coa_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "account_desc" VARCHAR(250),
    "account_name" VARCHAR(250) NOT NULL,
    "type_id" UUID NOT NULL,
    "head_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "input_item" VARCHAR(150),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "import_flag" BOOLEAN NOT NULL DEFAULT false,
    "export_flag" BOOLEAN NOT NULL DEFAULT false,
    "required_comment" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("coa_id")
);

-- CreateTable
CREATE TABLE "coa_account_detail_items" (
    "detail_item_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "coa_id" UUID NOT NULL,
    "account_code" VARCHAR(100) NOT NULL,
    "account_name" VARCHAR(250) NOT NULL,
    "line_type" VARCHAR(50) NOT NULL DEFAULT 'DETAIL',
    "input_method" VARCHAR(50),
    "input_value" DECIMAL(18,4),
    "percent_value" DECIMAL(10,6),
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "is_calculated" BOOLEAN NOT NULL DEFAULT false,
    "comment_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coa_account_detail_items_pkey" PRIMARY KEY ("detail_item_id")
);

-- CreateTable
CREATE TABLE "coa_account_owners" (
    "id" UUID NOT NULL,
    "coa_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,

    CONSTRAINT "coa_account_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_audit_log" (
    "log_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "coa_id" UUID NOT NULL,
    "account_code" VARCHAR(20) NOT NULL,
    "field_name" VARCHAR(50) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" VARCHAR(100),
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coa_audit_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "company_microsoft_entra_config" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "backendRedirectUri" TEXT NOT NULL,
    "frontendRedirectUri" TEXT NOT NULL,
    "postLogoutRedirectUri" TEXT,
    "scopes" JSONB,
    "allowedEmailDomains" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_microsoft_entra_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "parentOrganisationId" UUID,
    "name" TEXT NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "isSystemInternal" BOOLEAN NOT NULL DEFAULT false,
    "kind" "OrganisationKind" NOT NULL DEFAULT 'OPERATIONAL',
    "entityType" "EntityType" NOT NULL DEFAULT 'LEGAL_ENTITY',
    "entityTypeDetail" "EntityTypeDetail",
    "status" "OrganisationStatus" NOT NULL DEFAULT 'SETUP',
    "timeZone" TEXT,
    "notes" TEXT,
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "primaryContactDesignation" TEXT,
    "billingContactName" TEXT,
    "billingContactEmail" TEXT,
    "billingContactPhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "workflowConfig" JSONB,
    "pmsConfig" JSONB,
    "configuration" JSONB,
    "licensedProperties" INTEGER,
    "licensedUsers" INTEGER,
    "licenseStatus" "LicenseStatus" NOT NULL DEFAULT 'DRAFT',
    "licenseStartDate" TIMESTAMP(3),
    "licenseDurationValue" INTEGER,
    "licenseDurationUnit" "LicenseDurationUnit",
    "licenseEndDate" TIMESTAMP(3),
    "licenseNotes" TEXT,
    "auditCreatedByUserId" UUID,
    "auditModifiedByUserId" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_start_windows" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_lease_term_id" UUID NOT NULL,
    "external_lease_start_window_id" VARCHAR(150),
    "window_start_date" TIMESTAMP(3),
    "window_end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_start_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_company_access" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_company_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_role" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dashboardKey" TEXT,
    "menuConfig" JSONB,
    "permissionConfig" JSONB,
    "scopeConfig" JSONB,
    "isSystemTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isCompanyAdminRole" BOOLEAN NOT NULL DEFAULT false,
    "isOrganisationAdminRole" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_role_assignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "businessRoleId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "organisationId" UUID,
    "propertyId" UUID,
    "scopeType" "ScopeType" NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedByUserId" UUID,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definition" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step" (
    "id" UUID NOT NULL,
    "workflowDefinitionId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stepType" "WorkflowStepType" NOT NULL DEFAULT 'CUSTOM',
    "businessRoleId" UUID,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "slaDays" INTEGER,
    "canDelegate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "impersonatedUserId" UUID,
    "companyId" UUID,
    "organisationId" UUID,
    "propertyId" UUID,
    "scopeType" "ScopeType" NOT NULL,
    "scopeRef" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_master" (
    "state_id" UUID NOT NULL,
    "state_code" VARCHAR(2) NOT NULL,
    "state_name" TEXT NOT NULL,
    "region" TEXT NOT NULL,

    CONSTRAINT "state_master_pkey" PRIMARY KEY ("state_id")
);

-- CreateTable
CREATE TABLE "organisation_states" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "state_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_snapshots" (
    "snapshot_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "snapshot_type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "source_snapshot_id" UUID,
    "forecast_basis" VARCHAR(50),
    "forecast_method" VARCHAR(50),
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "source_system" VARCHAR(50),
    "source_batch_id" UUID,
    "imported_at" TIMESTAMP(3),
    "generated_by" UUID,
    "generated_at" TIMESTAMP(3),
    "submitted_by" UUID,
    "submitted_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_snapshots_pkey" PRIMARY KEY ("snapshot_id")
);

-- CreateTable
CREATE TABLE "budget_calc_lines" (
    "calc_line_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "snapshot_type" VARCHAR(40) NOT NULL,
    "coa_id" UUID,
    "account_code" VARCHAR(20),
    "account_name" VARCHAR(250),
    "account_group" VARCHAR(150),
    "line_code" VARCHAR(100) NOT NULL,
    "line_name" VARCHAR(250) NOT NULL,
    "line_type" VARCHAR(50) NOT NULL,
    "parent_line_code" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_editable" BOOLEAN NOT NULL DEFAULT false,
    "is_calculated" BOOLEAN NOT NULL DEFAULT true,
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "formula_json" JSONB,
    "jan_amount" DECIMAL(18,2),
    "feb_amount" DECIMAL(18,2),
    "mar_amount" DECIMAL(18,2),
    "apr_amount" DECIMAL(18,2),
    "may_amount" DECIMAL(18,2),
    "jun_amount" DECIMAL(18,2),
    "jul_amount" DECIMAL(18,2),
    "aug_amount" DECIMAL(18,2),
    "sep_amount" DECIMAL(18,2),
    "oct_amount" DECIMAL(18,2),
    "nov_amount" DECIMAL(18,2),
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_calc_lines_pkey" PRIMARY KEY ("calc_line_id")
);

-- CreateTable
CREATE TABLE "budget_calc_line_baselines" (
    "calc_line_baseline_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "source_snapshot_id" UUID,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "snapshot_type" VARCHAR(40) NOT NULL,
    "coa_id" UUID,
    "account_code" VARCHAR(20),
    "account_name" VARCHAR(250),
    "account_group" VARCHAR(150),
    "line_code" VARCHAR(100) NOT NULL,
    "line_name" VARCHAR(250) NOT NULL,
    "line_type" VARCHAR(50) NOT NULL,
    "parent_line_code" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_editable" BOOLEAN NOT NULL DEFAULT false,
    "is_calculated" BOOLEAN NOT NULL DEFAULT true,
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "jan_amount" DECIMAL(18,2),
    "feb_amount" DECIMAL(18,2),
    "mar_amount" DECIMAL(18,2),
    "apr_amount" DECIMAL(18,2),
    "may_amount" DECIMAL(18,2),
    "jun_amount" DECIMAL(18,2),
    "jul_amount" DECIMAL(18,2),
    "aug_amount" DECIMAL(18,2),
    "sep_amount" DECIMAL(18,2),
    "oct_amount" DECIMAL(18,2),
    "nov_amount" DECIMAL(18,2),
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_calc_line_baselines_pkey" PRIMARY KEY ("calc_line_baseline_id")
);

-- CreateTable
CREATE TABLE "budget_change_sets" (
    "change_set_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "change_set_no" INTEGER NOT NULL,
    "change_type" VARCHAR(50) NOT NULL,
    "status_before" VARCHAR(30),
    "status_after" VARCHAR(30),
    "changed_by" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "source_command" TEXT,

    CONSTRAINT "budget_change_sets_pkey" PRIMARY KEY ("change_set_id")
);

-- CreateTable
CREATE TABLE "budget_calc_line_changes" (
    "calc_line_change_id" UUID NOT NULL,
    "coa_id" UUID,
    "change_set_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "calc_line_id" UUID,
    "change_set_no" INTEGER NOT NULL,
    "line_code" VARCHAR(100) NOT NULL,
    "line_name" VARCHAR(250),
    "line_type" VARCHAR(50),
    "account_code" VARCHAR(20),
    "account_group" VARCHAR(150),
    "change_scope" VARCHAR(30) NOT NULL DEFAULT 'SELECTED_MONTHS',
    "from_month_no" INTEGER,
    "to_month_no" INTEGER,
    "jan_changed" BOOLEAN NOT NULL DEFAULT false,
    "jan_amount" DECIMAL(18,2),
    "feb_changed" BOOLEAN NOT NULL DEFAULT false,
    "feb_amount" DECIMAL(18,2),
    "mar_changed" BOOLEAN NOT NULL DEFAULT false,
    "mar_amount" DECIMAL(18,2),
    "apr_changed" BOOLEAN NOT NULL DEFAULT false,
    "apr_amount" DECIMAL(18,2),
    "may_changed" BOOLEAN NOT NULL DEFAULT false,
    "may_amount" DECIMAL(18,2),
    "jun_changed" BOOLEAN NOT NULL DEFAULT false,
    "jun_amount" DECIMAL(18,2),
    "jul_changed" BOOLEAN NOT NULL DEFAULT false,
    "jul_amount" DECIMAL(18,2),
    "aug_changed" BOOLEAN NOT NULL DEFAULT false,
    "aug_amount" DECIMAL(18,2),
    "sep_changed" BOOLEAN NOT NULL DEFAULT false,
    "sep_amount" DECIMAL(18,2),
    "oct_changed" BOOLEAN NOT NULL DEFAULT false,
    "oct_amount" DECIMAL(18,2),
    "nov_changed" BOOLEAN NOT NULL DEFAULT false,
    "nov_amount" DECIMAL(18,2),
    "dec_changed" BOOLEAN NOT NULL DEFAULT false,
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_calc_line_changes_pkey" PRIMARY KEY ("calc_line_change_id")
);

-- CreateTable
CREATE TABLE "budget_line_details" (
    "detail_line_id" UUID NOT NULL,
    "budget_item_id" UUID,
    "detail_item_id" UUID,
    "snapshot_id" UUID NOT NULL,
    "calc_line_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "snapshot_type" VARCHAR(40) NOT NULL,
    "coa_id" UUID,
    "account_code" VARCHAR(20),
    "account_name" VARCHAR(250),
    "account_group" VARCHAR(150),
    "line_code" VARCHAR(100) NOT NULL,
    "line_name" VARCHAR(250) NOT NULL,
    "line_type" VARCHAR(50) NOT NULL,
    "parent_line_code" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "input_method" VARCHAR(50),
    "input_value" DECIMAL(18,4),
    "percent_value" DECIMAL(10,6),
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "is_calculated" BOOLEAN NOT NULL DEFAULT false,
    "formula_json" JSONB,
    "jan_amount" DECIMAL(18,2),
    "feb_amount" DECIMAL(18,2),
    "mar_amount" DECIMAL(18,2),
    "apr_amount" DECIMAL(18,2),
    "may_amount" DECIMAL(18,2),
    "jun_amount" DECIMAL(18,2),
    "jul_amount" DECIMAL(18,2),
    "aug_amount" DECIMAL(18,2),
    "sep_amount" DECIMAL(18,2),
    "oct_amount" DECIMAL(18,2),
    "nov_amount" DECIMAL(18,2),
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "comment" TEXT,
    "comment_required" BOOLEAN NOT NULL DEFAULT false,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "validation_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coaAccountDetailItemDetailItemId" UUID,

    CONSTRAINT "budget_line_details_pkey" PRIMARY KEY ("detail_line_id")
);

-- CreateTable
CREATE TABLE "budget_line_detail_baselines" (
    "detail_line_baseline_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "calc_line_baseline_id" UUID NOT NULL,
    "source_snapshot_id" UUID,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "snapshot_type" VARCHAR(40) NOT NULL,
    "coa_id" UUID,
    "account_code" VARCHAR(20),
    "account_name" VARCHAR(250),
    "account_group" VARCHAR(150),
    "line_code" VARCHAR(100) NOT NULL,
    "line_name" VARCHAR(250) NOT NULL,
    "line_type" VARCHAR(50) NOT NULL,
    "parent_line_code" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "input_method" VARCHAR(50),
    "input_value" DECIMAL(18,4),
    "percent_value" DECIMAL(10,6),
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "is_calculated" BOOLEAN NOT NULL DEFAULT false,
    "jan_amount" DECIMAL(18,2),
    "feb_amount" DECIMAL(18,2),
    "mar_amount" DECIMAL(18,2),
    "apr_amount" DECIMAL(18,2),
    "may_amount" DECIMAL(18,2),
    "jun_amount" DECIMAL(18,2),
    "jul_amount" DECIMAL(18,2),
    "aug_amount" DECIMAL(18,2),
    "sep_amount" DECIMAL(18,2),
    "oct_amount" DECIMAL(18,2),
    "nov_amount" DECIMAL(18,2),
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "comment" TEXT,
    "comment_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_line_detail_baselines_pkey" PRIMARY KEY ("detail_line_baseline_id")
);

-- CreateTable
CREATE TABLE "budget_line_detail_changes" (
    "detail_line_change_id" UUID NOT NULL,
    "change_set_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "detail_line_id" UUID,
    "calc_line_id" UUID,
    "coa_id" UUID,
    "detail_item_id" UUID,
    "change_set_no" INTEGER NOT NULL,
    "line_code" VARCHAR(100) NOT NULL,
    "line_name" VARCHAR(250),
    "line_type" VARCHAR(50),
    "account_code" VARCHAR(20),
    "account_group" VARCHAR(150),
    "change_scope" VARCHAR(30) NOT NULL DEFAULT 'SELECTED_MONTHS',
    "from_month_no" INTEGER,
    "to_month_no" INTEGER,
    "input_method_changed" BOOLEAN NOT NULL DEFAULT false,
    "input_method" VARCHAR(50),
    "input_value_changed" BOOLEAN NOT NULL DEFAULT false,
    "input_value" DECIMAL(18,4),
    "percent_value_changed" BOOLEAN NOT NULL DEFAULT false,
    "percent_value" DECIMAL(10,6),
    "comment_changed" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "jan_changed" BOOLEAN NOT NULL DEFAULT false,
    "jan_amount" DECIMAL(18,2),
    "feb_changed" BOOLEAN NOT NULL DEFAULT false,
    "feb_amount" DECIMAL(18,2),
    "mar_changed" BOOLEAN NOT NULL DEFAULT false,
    "mar_amount" DECIMAL(18,2),
    "apr_changed" BOOLEAN NOT NULL DEFAULT false,
    "apr_amount" DECIMAL(18,2),
    "may_changed" BOOLEAN NOT NULL DEFAULT false,
    "may_amount" DECIMAL(18,2),
    "jun_changed" BOOLEAN NOT NULL DEFAULT false,
    "jun_amount" DECIMAL(18,2),
    "jul_changed" BOOLEAN NOT NULL DEFAULT false,
    "jul_amount" DECIMAL(18,2),
    "aug_changed" BOOLEAN NOT NULL DEFAULT false,
    "aug_amount" DECIMAL(18,2),
    "sep_changed" BOOLEAN NOT NULL DEFAULT false,
    "sep_amount" DECIMAL(18,2),
    "oct_changed" BOOLEAN NOT NULL DEFAULT false,
    "oct_amount" DECIMAL(18,2),
    "nov_changed" BOOLEAN NOT NULL DEFAULT false,
    "nov_amount" DECIMAL(18,2),
    "dec_changed" BOOLEAN NOT NULL DEFAULT false,
    "dec_amount" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_line_detail_changes_pkey" PRIMARY KEY ("detail_line_change_id")
);

-- CreateTable
CREATE TABLE "periodic_drivers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "month_flag" JSONB NOT NULL,
    "number_of_days" JSONB NOT NULL,
    "calendar_days" JSONB NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodic_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_drivers" (
    "driver_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_code" VARCHAR(20) NOT NULL,
    "account_name" VARCHAR(250) NOT NULL,
    "account_description" VARCHAR(250),
    "account_rule" VARCHAR(250) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "amount_type" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_drivers_pkey" PRIMARY KEY ("driver_id")
);

-- CreateTable
CREATE TABLE "market_rent_unit_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "unit_type_id" UUID,
    "floorplan_id" VARCHAR(100),
    "floorplan_name" VARCHAR(150) NOT NULL,
    "square_feet" DECIMAL(18,2),
    "unit_count" INTEGER NOT NULL DEFAULT 0,
    "method" VARCHAR(50),
    "input_amount" DECIMAL(18,2),
    "percent_value" DECIMAL(10,4),
    "effective_from_month_no" INTEGER,
    "jan_amount" DECIMAL(18,2),
    "feb_amount" DECIMAL(18,2),
    "mar_amount" DECIMAL(18,2),
    "apr_amount" DECIMAL(18,2),
    "may_amount" DECIMAL(18,2),
    "jun_amount" DECIMAL(18,2),
    "jul_amount" DECIMAL(18,2),
    "aug_amount" DECIMAL(18,2),
    "sep_amount" DECIMAL(18,2),
    "oct_amount" DECIMAL(18,2),
    "nov_amount" DECIMAL(18,2),
    "dec_amount" DECIMAL(18,2),
    "jan_total" DECIMAL(18,2),
    "feb_total" DECIMAL(18,2),
    "mar_total" DECIMAL(18,2),
    "apr_total" DECIMAL(18,2),
    "may_total" DECIMAL(18,2),
    "jun_total" DECIMAL(18,2),
    "jul_total" DECIMAL(18,2),
    "aug_total" DECIMAL(18,2),
    "sep_total" DECIMAL(18,2),
    "oct_total" DECIMAL(18,2),
    "nov_total" DECIMAL(18,2),
    "dec_total" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "full_year_total" DECIMAL(18,2),
    "source" VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_rent_unit_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_rent_change_sets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "change_set_no" INTEGER NOT NULL,
    "change_type" VARCHAR(50) NOT NULL DEFAULT 'MARKET_RENT_EDIT',
    "status_before" VARCHAR(30),
    "status_after" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "source_command" VARCHAR(100) NOT NULL DEFAULT 'SAVE_MARKET_RENT',
    "bulk_method" VARCHAR(50),
    "bulk_input_amount" DECIMAL(18,2),
    "bulk_percent_value" DECIMAL(10,4),
    "bulk_effective_from_month_no" INTEGER,
    "description" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_rent_change_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_rent_unit_changes" (
    "id" UUID NOT NULL,
    "change_set_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "market_rent_rate_id" UUID,
    "unit_type_id" UUID,
    "floorplan_id" VARCHAR(100),
    "floorplan_name" VARCHAR(150) NOT NULL,
    "square_feet" DECIMAL(18,2),
    "unit_count" INTEGER NOT NULL DEFAULT 0,
    "change_scope" VARCHAR(30) NOT NULL DEFAULT 'SELECTED_MONTHS',
    "method_changed" BOOLEAN NOT NULL DEFAULT false,
    "method" VARCHAR(50),
    "input_amount_changed" BOOLEAN NOT NULL DEFAULT false,
    "input_amount" DECIMAL(18,2),
    "percent_value_changed" BOOLEAN NOT NULL DEFAULT false,
    "percent_value" DECIMAL(10,4),
    "effective_from_month_no" INTEGER,
    "jan_changed" BOOLEAN NOT NULL DEFAULT false,
    "jan_amount" DECIMAL(18,2),
    "jan_total" DECIMAL(18,2),
    "feb_changed" BOOLEAN NOT NULL DEFAULT false,
    "feb_amount" DECIMAL(18,2),
    "feb_total" DECIMAL(18,2),
    "mar_changed" BOOLEAN NOT NULL DEFAULT false,
    "mar_amount" DECIMAL(18,2),
    "mar_total" DECIMAL(18,2),
    "apr_changed" BOOLEAN NOT NULL DEFAULT false,
    "apr_amount" DECIMAL(18,2),
    "apr_total" DECIMAL(18,2),
    "may_changed" BOOLEAN NOT NULL DEFAULT false,
    "may_amount" DECIMAL(18,2),
    "may_total" DECIMAL(18,2),
    "jun_changed" BOOLEAN NOT NULL DEFAULT false,
    "jun_amount" DECIMAL(18,2),
    "jun_total" DECIMAL(18,2),
    "jul_changed" BOOLEAN NOT NULL DEFAULT false,
    "jul_amount" DECIMAL(18,2),
    "jul_total" DECIMAL(18,2),
    "aug_changed" BOOLEAN NOT NULL DEFAULT false,
    "aug_amount" DECIMAL(18,2),
    "aug_total" DECIMAL(18,2),
    "sep_changed" BOOLEAN NOT NULL DEFAULT false,
    "sep_amount" DECIMAL(18,2),
    "sep_total" DECIMAL(18,2),
    "oct_changed" BOOLEAN NOT NULL DEFAULT false,
    "oct_amount" DECIMAL(18,2),
    "oct_total" DECIMAL(18,2),
    "nov_changed" BOOLEAN NOT NULL DEFAULT false,
    "nov_amount" DECIMAL(18,2),
    "nov_total" DECIMAL(18,2),
    "dec_changed" BOOLEAN NOT NULL DEFAULT false,
    "dec_amount" DECIMAL(18,2),
    "dec_total" DECIMAL(18,2),
    "full_year_amount" DECIMAL(18,2),
    "full_year_total" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_rent_unit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitAndLoss" (
    "Id" UUID,
    "property_id" UUID,
    "assignedto" UUID,
    "comments" TEXT
);

-- CreateTable
CREATE TABLE "ProfitandLossHistory" (
    "id" UUID,
    "profitlossid" UUID,
    "status" VARCHAR(100)[],
    "comments" TEXT
);

-- CreateTable
CREATE TABLE "occupancy_master" (
    "id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "description_name" TEXT NOT NULL,
    "is_Editable" BOOLEAN DEFAULT false,

    CONSTRAINT "occupancy_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy_transaction" (
    "id" UUID NOT NULL,
    "property_id" UUID,
    "budget_year" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "occupancy_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_income_units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "property_unit_id" UUID NOT NULL,
    "use" VARCHAR(50) NOT NULL,
    "apt_type" VARCHAR(150) NOT NULL,
    "unit_number" VARCHAR(100) NOT NULL,
    "reason" TEXT,
    "fiscal_year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "non_income_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupancy_transaction_detail" (
    "id" UUID,
    "method" TEXT,
    "input_value" DECIMAL(18,4),
    "pct" DECIMAL(9,4),
    "jan" DECIMAL(18,4),
    "feb" DECIMAL(18,4),
    "mar" DECIMAL(18,4),
    "apr" DECIMAL(18,4),
    "may" DECIMAL(18,4),
    "jun" DECIMAL(18,4),
    "jul" DECIMAL(18,4),
    "aug" DECIMAL(18,4),
    "sep" DECIMAL(18,4),
    "oct" DECIMAL(18,4),
    "nov" DECIMAL(18,4),
    "dec" DECIMAL(18,4),
    "occupancy_transaction_id" UUID,
    "occupancy_master_id" UUID,
    "full_year" DECIMAL(18,4)
);

-- CreateTable
CREATE TABLE "integration_plugins" (
    "plugin_id" VARCHAR(100) NOT NULL,
    "company_id" UUID NOT NULL,
    "plugin_name" VARCHAR(200) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(200) NOT NULL,
    "source_kind" VARCHAR(100) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "manifest_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_plugins_pkey" PRIMARY KEY ("plugin_id")
);

-- CreateTable
CREATE TABLE "integration_sources" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "plugin_id" VARCHAR(100) NOT NULL,
    "source_code" VARCHAR(100) NOT NULL,
    "source_name" VARCHAR(200) NOT NULL,
    "source_kind" VARCHAR(100) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_source_configs" (
    "id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "connection_json" JSONB,
    "credentials_json" JSONB,
    "sync_settings_json" JSONB,
    "mapping_profile_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_source_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_source_entities" (
    "id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_mode" VARCHAR(50) NOT NULL DEFAULT 'incremental',
    "is_authoritative" BOOLEAN NOT NULL DEFAULT false,
    "priority_order" INTEGER NOT NULL DEFAULT 1,
    "sync_settings_json" JSONB,
    "mapping_profile_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_source_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_report_definitions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "report_code" VARCHAR(150) NOT NULL,
    "report_name" VARCHAR(150) NOT NULL,
    "display_name" VARCHAR(250) NOT NULL,
    "description" TEXT,
    "report_version" VARCHAR(50),
    "method_version" VARCHAR(50),
    "entity_name" VARCHAR(100) NOT NULL DEFAULT 'ReportData',
    "endpoint_path" VARCHAR(100) NOT NULL DEFAULT 'reports',
    "method_name" VARCHAR(100) NOT NULL DEFAULT 'getReportData',
    "params_schema_json" JSONB,
    "default_params_json" JSONB,
    "source_key_fields_json" JSONB,
    "sync_settings_json" JSONB,
    "is_system_defined" BOOLEAN NOT NULL DEFAULT true,
    "is_custom_report" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_report_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "report_definition_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "report_code" VARCHAR(150) NOT NULL,
    "report_name" VARCHAR(150) NOT NULL,
    "report_version" VARCHAR(50),
    "method_version" VARCHAR(50),
    "request_params_json" JSONB NOT NULL,
    "response_summary_json" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "records_staged" INTEGER NOT NULL DEFAULT 0,
    "records_transformed" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "integration_report_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_queue_jobs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID,
    "sync_run_id" UUID,
    "staging_batch_id" UUID,
    "queue_name" VARCHAR(100) NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "bull_job_id" VARCHAR(150),
    "entity_name" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    "payload_json" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_error_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID,
    "sync_run_id" UUID,
    "entity_name" VARCHAR(100),
    "queue_name" VARCHAR(150),
    "job_name" VARCHAR(150),
    "bull_job_id" VARCHAR(150),
    "error_code" VARCHAR(150) NOT NULL,
    "error_message" TEXT NOT NULL,
    "error_category" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(50) NOT NULL DEFAULT 'ERROR',
    "is_retryable" BOOLEAN NOT NULL DEFAULT false,
    "context_json" JSONB,
    "stack_trace" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_api_batches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "source_method" VARCHAR(150),
    "request_id" VARCHAR(150),
    "response_code" INTEGER,
    "raw_request" JSONB,
    "raw_response" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_api_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_properties" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "staging_batch_id" UUID NOT NULL,
    "source_record_id" VARCHAR(150),
    "parent_source_record_id" VARCHAR(150),
    "property_code" VARCHAR(100),
    "property_name" VARCHAR(255),
    "property_type" VARCHAR(100),
    "raw_property_payload" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB,
    "transform_errors" JSONB,
    "source_hash" VARCHAR(200),
    "staged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_property_units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "staging_batch_id" UUID NOT NULL,
    "source_property_id" VARCHAR(150),
    "source_unit_id" VARCHAR(150),
    "remote_primary_key" VARCHAR(300),
    "unit_number" VARCHAR(100),
    "floorplan_name" VARCHAR(150),
    "unit_type_name" VARCHAR(150),
    "source_hash" VARCHAR(200),
    "raw_unit_payload" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB,
    "transform_errors" JSONB,
    "staged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_property_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_unit_types" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "staging_batch_id" UUID NOT NULL,
    "source_property_id" VARCHAR(150),
    "source_unit_type_id" VARCHAR(150),
    "unit_type_name" VARCHAR(150),
    "floorplan_id" VARCHAR(150),
    "floorplan_name" VARCHAR(150),
    "source_hash" VARCHAR(200),
    "raw_unit_type_payload" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB,
    "transform_errors" JSONB,
    "staged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_budgets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "staging_batch_id" UUID NOT NULL,
    "source_property_id" VARCHAR(150),
    "source_budget_id" VARCHAR(150),
    "budget_name" VARCHAR(250),
    "fiscal_year" INTEGER,
    "source_hash" VARCHAR(200),
    "raw_budget_payload" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB,
    "transform_errors" JSONB,
    "staged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_gl_trees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID,
    "staging_batch_id" UUID,
    "source_gl_tree_id" VARCHAR(100),
    "source_branch_id" VARCHAR(100),
    "source_gl_account_id" VARCHAR(100),
    "record_type" VARCHAR(50) NOT NULL,
    "source_record_id" VARCHAR(300) NOT NULL,
    "source_hash" VARCHAR(128) NOT NULL,
    "raw_payload_json" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB,
    "transform_errors" JSONB,
    "transformed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_gl_trees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_report_data" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "staging_batch_id" UUID NOT NULL,
    "report_name" VARCHAR(150) NOT NULL,
    "report_code" VARCHAR(150) NOT NULL,
    "report_version" VARCHAR(50),
    "source_record_id" VARCHAR(500) NOT NULL,
    "source_hash" VARCHAR(200),
    "report_definition_id" UUID NOT NULL,
    "report_run_id" UUID NOT NULL,
    "raw_record_payload" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_errors" JSONB,
    "staged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMP(3),

    CONSTRAINT "staging_report_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_record_maps" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "source_record_id" VARCHAR(150) NOT NULL,
    "canonical_table_name" VARCHAR(100) NOT NULL,
    "canonical_record_id" UUID NOT NULL,
    "match_status" VARCHAR(50) NOT NULL DEFAULT 'AUTO_MATCHED',
    "confidence_score" DECIMAL(5,2),
    "is_authoritative" BOOLEAN NOT NULL DEFAULT false,
    "source_hash" VARCHAR(200),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_record_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "entity_name" VARCHAR(100) NOT NULL,
    "sync_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    "request_id" VARCHAR(150),
    "response_code" INTEGER,
    "records_received" INTEGER NOT NULL DEFAULT 0,
    "records_staged" INTEGER NOT NULL DEFAULT 0,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_budget_actuals" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "integration_source_id" UUID NOT NULL,
    "sync_run_id" UUID NOT NULL,
    "staging_batch_id" UUID NOT NULL,
    "source_property_id" VARCHAR(100),
    "source_budget_id" VARCHAR(100),
    "source_gl_tree_id" VARCHAR(100),
    "source_gl_account_id" VARCHAR(100),
    "source_record_id" VARCHAR(500) NOT NULL,
    "accounting_method" VARCHAR(50),
    "fiscal_year" INTEGER,
    "post_month" DATE,
    "source_hash" VARCHAR(200),
    "raw_payload_json" JSONB NOT NULL,
    "validation_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "transform_status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "validation_errors" JSONB,
    "transform_errors" JSONB,
    "staged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transformed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staging_budget_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workflowDefinitionId" UUID,
    "property_code" VARCHAR(100),
    "property_name" VARCHAR(255),
    "property_type" VARCHAR(100),
    "owner_name" VARCHAR(255),
    "status" "PropertyStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetYear" INTEGER,
    "externalId" INTEGER,
    "marketingName" TEXT,
    "year_built" INTEGER,
    "website" VARCHAR(500),
    "short_description" TEXT,
    "long_description" TEXT,
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "isWorkflowDeployed" BOOLEAN NOT NULL DEFAULT false,
    "created_source" VARCHAR(100),
    "updated_source" VARCHAR(100),
    "last_synced_at" TIMESTAMP(3),
    "is_manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "property_manager_id" UUID,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMainAddress" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "PropertyMainAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_addresses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "source_address_type" VARCHAR(100),
    "address_type" VARCHAR(100),
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "state_code" VARCHAR(50),
    "province" VARCHAR(100),
    "postal_code" VARCHAR(30),
    "country" VARCHAR(100),
    "email" VARCHAR(255),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_post_months" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "ar_post_month" VARCHAR(20),
    "ap_post_month" VARCHAR(20),
    "gl_post_month" VARCHAR(20),
    "ar_post_year" INTEGER,
    "ar_post_month_no" INTEGER,
    "ap_post_year" INTEGER,
    "ap_post_month_no" INTEGER,
    "gl_post_year" INTEGER,
    "gl_post_month_no" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_post_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_office_hours" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "day" VARCHAR(50) NOT NULL,
    "availability" TEXT,
    "availability_type" VARCHAR(100),
    "open_time" VARCHAR(50),
    "close_time" VARCHAR(50),
    "lunch_start_time" VARCHAR(50),
    "lunch_end_time" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_office_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_options" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "option_code" VARCHAR(100),
    "name" VARCHAR(255),
    "created_source" VARCHAR(100),
    "updated_source" VARCHAR(100),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_space_options" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "space_option_id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_space_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_lease_terms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "external_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "term_months" INTEGER,
    "is_prospect" BOOLEAN NOT NULL,
    "is_renewal" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL,

    CONSTRAINT "property_lease_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyLeaseWindow" (
    "id" UUID NOT NULL,
    "leaseTermId" UUID NOT NULL,
    "externalId" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyLeaseWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyExternalSnapshot" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL DEFAULT 'ENTRATA',
    "externalPropertyId" BIGINT,
    "propertyName" TEXT,
    "currencyCode" TEXT,
    "buildingCount" INTEGER,
    "unitCount" INTEGER,
    "propertyAvailabilityUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyExternalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_external_pet_policies" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "rent" DECIMAL(12,2),
    "fee" DECIMAL(12,2),
    "count" INTEGER,
    "pet_care" BOOLEAN,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_external_pet_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "snapshotId" UUID,
    "externalUnitId" BIGINT,
    "remote_primary_key" VARCHAR(300),
    "unit_number" VARCHAR(100),
    "source_unit_id" VARCHAR(150),
    "unit_type_id" VARCHAR(150),
    "unit_type_name" VARCHAR(150),
    "floorplan_id" VARCHAR(150),
    "floorplan_name" VARCHAR(150),
    "building_id" VARCHAR(150),
    "building_name" VARCHAR(150),
    "floor_id" VARCHAR(150),
    "floor_number" VARCHAR(50),
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "square_feet" INTEGER,
    "max_occupants" INTEGER,
    "max_pets" INTEGER,
    "is_corporate_rented" BOOLEAN,
    "is_furnished" BOOLEAN,
    "created_source" VARCHAR(100),
    "updated_source" VARCHAR(100),
    "last_synced_at" TIMESTAMP(3),
    "is_manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_unit_addresses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_unit_id" UUID NOT NULL,
    "address_line1" VARCHAR(255),
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(30),
    "country" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_unit_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_unit_spaces" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_unit_id" UUID NOT NULL,
    "source_unit_space_id" VARCHAR(150),
    "externalUnitSpaceId" BIGINT,
    "unit_number" VARCHAR(100),
    "marketing_unit_number" VARCHAR(100),
    "web_visible" BOOLEAN,
    "is_affordable" BOOLEAN,
    "has_pricing" BOOLEAN,
    "excludedReason" TEXT,
    "exclusion_reason" VARCHAR(255),
    "makeReadyDate" DATE,
    "spaceConfiguration" TEXT,
    "availability_status" VARCHAR(150),
    "available_date" TIMESTAMP(3),
    "unit_availability_url" VARCHAR(1000),
    "min_rent" DECIMAL(12,2),
    "max_rent" DECIMAL(12,2),
    "min_deposit" DECIMAL(12,2),
    "max_deposit" DECIMAL(12,2),
    "market_rent" DECIMAL(12,2),
    "occupancy_type_id" VARCHAR(150),
    "occupancy_type_name" VARCHAR(150),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_unit_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_unit_types" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "source_unit_type_id" VARCHAR(150),
    "unit_type_name" VARCHAR(150),
    "unit_count" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" DECIMAL(5,2),
    "min_square_feet" INTEGER,
    "max_square_feet" INTEGER,
    "min_market_rent" DECIMAL(12,2),
    "max_market_rent" DECIMAL(12,2),
    "created_source" VARCHAR(100),
    "updated_source" VARCHAR(100),
    "last_synced_at" TIMESTAMP(3),
    "is_manually_overridden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_unit_type_rent_terms" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_unit_type_id" UUID NOT NULL,
    "lease_term" VARCHAR(100),
    "lease_term_id" VARCHAR(150),
    "lease_term_name" VARCHAR(150),
    "rent" DECIMAL(12,2),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "space_option_id" VARCHAR(150),
    "space_option" VARCHAR(150),
    "is_sold_out" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_unit_type_rent_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyUnitSpaceTermRent" (
    "id" UUID NOT NULL,
    "unitSpaceId" UUID NOT NULL,
    "leaseTermId" TEXT,
    "leaseTerm" TEXT,
    "leaseTermName" TEXT,
    "isWebVisible" BOOLEAN,
    "isBestPrice" BOOLEAN,
    "spaceOptionId" TEXT,
    "spaceOption" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "rent" DECIMAL(65,30),
    "baseRent" DECIMAL(65,30),
    "rateFrequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyUnitSpaceTermRent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_unit_type_floorplans" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_unit_type_id" UUID NOT NULL,
    "source_floorplan_id" VARCHAR(150),
    "floorplan_name" VARCHAR(150),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_unit_type_floorplans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyUnitSpaceAmenity" (
    "id" UUID NOT NULL,
    "unitSpaceId" UUID NOT NULL,
    "externalAmenityId" BIGINT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyUnitSpaceAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_workflow_assignment" (
    "id" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "workflowStepId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_workflow_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_closing_statuses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID,
    "property_name" VARCHAR(250) NOT NULL,
    "current_ar" TIMESTAMP(3),
    "ar_locked_through" TIMESTAMP(3),
    "ar_auto_roll_day" VARCHAR(100),
    "current_ap" TIMESTAMP(3),
    "ap_locked_through" TIMESTAMP(3),
    "ap_auto_roll_day" VARCHAR(100),
    "current_gl" TIMESTAMP(3),
    "gl_locked_through" TIMESTAMP(3),
    "gl_auto_roll_day" VARCHAR(100),
    "source_record_id" VARCHAR(500),
    "source_hash" VARCHAR(200),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_closing_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_budget_actuals" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "gl_tree_id" UUID,
    "gl_account_id" UUID,
    "budget_gl_account_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "post_month" DATE NOT NULL,
    "accounting_method" VARCHAR(50),
    "mtd_actual" DECIMAL(18,2),
    "mtd_budget" DECIMAL(18,2),
    "mtd_variance" DECIMAL(18,2),
    "mtd_variance_percent" DECIMAL(18,6),
    "ytd_actual" DECIMAL(18,2),
    "ytd_budget" DECIMAL(18,2),
    "ytd_variance" DECIMAL(18,2),
    "ytd_variance_percent" DECIMAL(18,6),
    "annual_budget" DECIMAL(18,2),
    "source_property_id" VARCHAR(100),
    "source_budget_id" VARCHAR(100),
    "source_gl_tree_id" VARCHAR(100),
    "source_gl_account_id" VARCHAR(100),
    "source_hash" VARCHAR(200),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "propertyGlAccountId" UUID,

    CONSTRAINT "property_budget_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_trees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "source_gl_tree_id" VARCHAR(100) NOT NULL,
    "tree_name" VARCHAR(255),
    "is_master_gl_tree" BOOLEAN,
    "source_hash" VARCHAR(128),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gl_trees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_tree_branches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "gl_tree_id" UUID NOT NULL,
    "source_branch_id" VARCHAR(100) NOT NULL,
    "group_type" VARCHAR(150),
    "group_name" VARCHAR(255),
    "summary_row_name" VARCHAR(255),
    "description" TEXT,
    "is_enabled" BOOLEAN,
    "show_group_name" BOOLEAN,
    "show_summary_row" BOOLEAN,
    "source_hash" VARCHAR(128),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gl_tree_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "gl_tree_id" UUID NOT NULL,
    "gl_tree_branch_id" UUID,
    "source_gl_account_id" VARCHAR(100) NOT NULL,
    "source_branch_id" VARCHAR(100),
    "account_number" VARCHAR(100) NOT NULL,
    "account_name" VARCHAR(500) NOT NULL,
    "gl_group_type" VARCHAR(150),
    "group_location" VARCHAR(255),
    "description" TEXT,
    "status" VARCHAR(100),
    "is_system" BOOLEAN,
    "source_hash" VARCHAR(128),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gl_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_gl_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "gl_tree_id" UUID NOT NULL,
    "gl_account_id" UUID NOT NULL,
    "source_property_id" VARCHAR(150),
    "source_gl_account_id" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "stagingPropertyId" UUID,

    CONSTRAINT "property_gl_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_gl_trees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "gl_tree_id" UUID NOT NULL,
    "source_property_id" VARCHAR(100),
    "source_gl_tree_id" VARCHAR(100),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_gl_trees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_companyId_idx" ON "user"("companyId");

-- CreateIndex
CREATE INDEX "user_organisationId_idx" ON "user"("organisationId");

-- CreateIndex
CREATE INDEX "auth_identity_userId_idx" ON "auth_identity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identity_provider_providerSubject_key" ON "auth_identity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identity_provider_loginName_key" ON "auth_identity"("provider", "loginName");

-- CreateIndex
CREATE UNIQUE INDEX "password_credential_userId_key" ON "password_credential"("userId");

-- CreateIndex
CREATE INDEX "otp_challenge_userId_purpose_idx" ON "otp_challenge"("userId", "purpose");

-- CreateIndex
CREATE INDEX "otp_challenge_expiresAt_idx" ON "otp_challenge"("expiresAt");

-- CreateIndex
CREATE INDEX "refresh_session_userId_idx" ON "refresh_session"("userId");

-- CreateIndex
CREATE INDEX "refresh_session_expiresAt_idx" ON "refresh_session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_role_code_key" ON "system_role"("code");

-- CreateIndex
CREATE INDEX "system_role_isActive_idx" ON "system_role"("isActive");

-- CreateIndex
CREATE INDEX "system_role_assignment_systemRoleId_idx" ON "system_role_assignment"("systemRoleId");

-- CreateIndex
CREATE INDEX "system_role_assignment_companyId_idx" ON "system_role_assignment"("companyId");

-- CreateIndex
CREATE INDEX "system_role_assignment_organisationId_idx" ON "system_role_assignment"("organisationId");

-- CreateIndex
CREATE INDEX "system_role_assignment_propertyId_idx" ON "system_role_assignment"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "system_role_assignment_userId_systemRoleId_scopeType_scopeR_key" ON "system_role_assignment"("userId", "systemRoleId", "scopeType", "scopeRef");

-- CreateIndex
CREATE INDEX "navigation_menu_item_scopeType_isActive_sortOrder_idx" ON "navigation_menu_item"("scopeType", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "navigation_menu_item_parentId_idx" ON "navigation_menu_item"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "navigation_menu_item_scopeType_code_key" ON "navigation_menu_item"("scopeType", "code");

-- CreateIndex
CREATE UNIQUE INDEX "company_code_key" ON "company"("code");

-- CreateIndex
CREATE INDEX "company_onboardingStatus_idx" ON "company"("onboardingStatus");

-- CreateIndex
CREATE INDEX "company_accessStatus_idx" ON "company"("accessStatus");

-- CreateIndex
CREATE INDEX "company_isSystemInternal_idx" ON "company"("isSystemInternal");

-- CreateIndex
CREATE INDEX "property_budgets_company_id_idx" ON "property_budgets"("company_id");

-- CreateIndex
CREATE INDEX "property_budgets_organisation_id_idx" ON "property_budgets"("organisation_id");

-- CreateIndex
CREATE INDEX "property_budgets_property_id_idx" ON "property_budgets"("property_id");

-- CreateIndex
CREATE INDEX "property_budgets_source_budget_id_idx" ON "property_budgets"("source_budget_id");

-- CreateIndex
CREATE INDEX "property_budgets_fiscal_year_idx" ON "property_budgets"("fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "property_budgets_company_id_organisation_id_property_id_sou_key" ON "property_budgets"("company_id", "organisation_id", "property_id", "source_budget_id");

-- CreateIndex
CREATE INDEX "property_budget_gl_accounts_company_id_idx" ON "property_budget_gl_accounts"("company_id");

-- CreateIndex
CREATE INDEX "property_budget_gl_accounts_organisation_id_idx" ON "property_budget_gl_accounts"("organisation_id");

-- CreateIndex
CREATE INDEX "property_budget_gl_accounts_budget_id_idx" ON "property_budget_gl_accounts"("budget_id");

-- CreateIndex
CREATE INDEX "property_budget_gl_accounts_source_gl_account_id_idx" ON "property_budget_gl_accounts"("source_gl_account_id");

-- CreateIndex
CREATE INDEX "property_budget_gl_accounts_account_number_idx" ON "property_budget_gl_accounts"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "property_budget_gl_accounts_budget_id_source_gl_account_id_key" ON "property_budget_gl_accounts"("budget_id", "source_gl_account_id");

-- CreateIndex
CREATE INDEX "property_budget_monthly_amounts_company_id_idx" ON "property_budget_monthly_amounts"("company_id");

-- CreateIndex
CREATE INDEX "property_budget_monthly_amounts_organisation_id_idx" ON "property_budget_monthly_amounts"("organisation_id");

-- CreateIndex
CREATE INDEX "property_budget_monthly_amounts_budget_gl_account_id_idx" ON "property_budget_monthly_amounts"("budget_gl_account_id");

-- CreateIndex
CREATE INDEX "property_budget_monthly_amounts_month_date_idx" ON "property_budget_monthly_amounts"("month_date");

-- CreateIndex
CREATE INDEX "property_budget_monthly_amounts_fiscal_year_idx" ON "property_budget_monthly_amounts"("fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "property_budget_monthly_amounts_budget_gl_account_id_month__key" ON "property_budget_monthly_amounts"("budget_gl_account_id", "month_date");

-- CreateIndex
CREATE INDEX "global_assumptions_company_id_fiscal_year_idx" ON "global_assumptions"("company_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "global_assumptions_account_code_idx" ON "global_assumptions"("account_code");

-- CreateIndex
CREATE INDEX "payroll_methods_company_id_idx" ON "payroll_methods"("company_id");

-- CreateIndex
CREATE INDEX "payroll_methods_organisation_id_idx" ON "payroll_methods"("organisation_id");

-- CreateIndex
CREATE INDEX "payroll_methods_company_id_is_active_idx" ON "payroll_methods"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_methods_organisation_id_code_key" ON "payroll_methods"("organisation_id", "code");

-- CreateIndex
CREATE INDEX "payroll_benefit_assumptions_company_id_idx" ON "payroll_benefit_assumptions"("company_id");

-- CreateIndex
CREATE INDEX "payroll_benefit_assumptions_organisation_id_idx" ON "payroll_benefit_assumptions"("organisation_id");

-- CreateIndex
CREATE INDEX "payroll_benefit_assumptions_coa_account_id_idx" ON "payroll_benefit_assumptions"("coa_account_id");

-- CreateIndex
CREATE INDEX "payroll_benefit_assumptions_method_id_idx" ON "payroll_benefit_assumptions"("method_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_benefit_assumptions_organisation_id_coa_account_id_key" ON "payroll_benefit_assumptions"("organisation_id", "coa_account_id");

-- CreateIndex
CREATE INDEX "payroll_global_assumptions_company_id_idx" ON "payroll_global_assumptions"("company_id");

-- CreateIndex
CREATE INDEX "payroll_global_assumptions_organisation_id_idx" ON "payroll_global_assumptions"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_global_assumptions_organisation_id_key_key" ON "payroll_global_assumptions"("organisation_id", "key");

-- CreateIndex
CREATE INDEX "payroll_state_configs_company_id_idx" ON "payroll_state_configs"("company_id");

-- CreateIndex
CREATE INDEX "payroll_state_configs_organisation_id_idx" ON "payroll_state_configs"("organisation_id");

-- CreateIndex
CREATE INDEX "payroll_state_assumptions_company_id_idx" ON "payroll_state_assumptions"("company_id");

-- CreateIndex
CREATE INDEX "payroll_state_assumptions_organisation_id_idx" ON "payroll_state_assumptions"("organisation_id");

-- CreateIndex
CREATE INDEX "payroll_state_assumptions_state_id_idx" ON "payroll_state_assumptions"("state_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_state_assumptions_organisation_id_state_id_key" ON "payroll_state_assumptions"("organisation_id", "state_id");

-- CreateIndex
CREATE INDEX "payroll_position_assumptions_company_id_idx" ON "payroll_position_assumptions"("company_id");

-- CreateIndex
CREATE INDEX "payroll_position_assumptions_organisation_id_idx" ON "payroll_position_assumptions"("organisation_id");

-- CreateIndex
CREATE INDEX "payroll_position_assumptions_parent_position_id_idx" ON "payroll_position_assumptions"("parent_position_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_position_assumptions_organisation_id_position_code_key" ON "payroll_position_assumptions"("organisation_id", "position_code");

-- CreateIndex
CREATE INDEX "payroll_position_owner_values_position_id_idx" ON "payroll_position_owner_values"("position_id");

-- CreateIndex
CREATE INDEX "payroll_position_owner_values_company_id_idx" ON "payroll_position_owner_values"("company_id");

-- CreateIndex
CREATE INDEX "payroll_position_owner_values_organisation_id_idx" ON "payroll_position_owner_values"("organisation_id");

-- CreateIndex
CREATE INDEX "payroll_position_owner_values_coa_account_id_idx" ON "payroll_position_owner_values"("coa_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_position_owner_values_position_id_owner_name_key" ON "payroll_position_owner_values"("position_id", "owner_name");

-- CreateIndex
CREATE INDEX "idx_psd_company" ON "payroll_salary_details"("company_id");

-- CreateIndex
CREATE INDEX "idx_psd_org" ON "payroll_salary_details"("organisation_id");

-- CreateIndex
CREATE INDEX "idx_psd_position" ON "payroll_salary_details"("position_assumption_id");

-- CreateIndex
CREATE INDEX "idx_psd_property" ON "payroll_salary_details"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_salary_detail_scope" ON "payroll_salary_details"("company_id", "organisation_id", "property_id", "position_assumption_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "idx_psdl_detail" ON "payroll_salary_detail_lines"("payroll_salary_detail_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payroll_salary_detail_line_measure" ON "payroll_salary_detail_lines"("payroll_salary_detail_id", "measure_code");

-- CreateIndex
CREATE UNIQUE INDEX "coa_input_methods_method_name_key" ON "coa_input_methods"("method_name");

-- CreateIndex
CREATE INDEX "coa_account_types_company_id_idx" ON "coa_account_types"("company_id");

-- CreateIndex
CREATE INDEX "coa_account_types_organisation_id_idx" ON "coa_account_types"("organisation_id");

-- CreateIndex
CREATE INDEX "coa_account_types_company_id_organisation_id_idx" ON "coa_account_types"("company_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "coa_account_types_company_id_organisation_id_type_name_key" ON "coa_account_types"("company_id", "organisation_id", "type_name");

-- CreateIndex
CREATE INDEX "coa_account_heads_company_id_idx" ON "coa_account_heads"("company_id");

-- CreateIndex
CREATE INDEX "coa_account_heads_organisation_id_idx" ON "coa_account_heads"("organisation_id");

-- CreateIndex
CREATE INDEX "coa_account_heads_type_id_idx" ON "coa_account_heads"("type_id");

-- CreateIndex
CREATE INDEX "coa_account_heads_company_id_organisation_id_idx" ON "coa_account_heads"("company_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "coa_account_heads_company_id_organisation_id_type_id_head_n_key" ON "coa_account_heads"("company_id", "organisation_id", "type_id", "head_name");

-- CreateIndex
CREATE INDEX "coa_account_groups_company_id_idx" ON "coa_account_groups"("company_id");

-- CreateIndex
CREATE INDEX "coa_account_groups_organisation_id_idx" ON "coa_account_groups"("organisation_id");

-- CreateIndex
CREATE INDEX "coa_account_groups_head_id_idx" ON "coa_account_groups"("head_id");

-- CreateIndex
CREATE INDEX "coa_account_groups_company_id_organisation_id_idx" ON "coa_account_groups"("company_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "coa_account_groups_company_id_organisation_id_head_id_group_key" ON "coa_account_groups"("company_id", "organisation_id", "head_id", "group_name");

-- CreateIndex
CREATE INDEX "coa_owners_company_id_idx" ON "coa_owners"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "coa_owners_company_id_owner_name_key" ON "coa_owners"("company_id", "owner_name");

-- CreateIndex
CREATE INDEX "chart_of_accounts_company_id_idx" ON "chart_of_accounts"("company_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_organisation_id_idx" ON "chart_of_accounts"("organisation_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_company_id_organisation_id_idx" ON "chart_of_accounts"("company_id", "organisation_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_type_id_idx" ON "chart_of_accounts"("type_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_head_id_idx" ON "chart_of_accounts"("head_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_group_id_idx" ON "chart_of_accounts"("group_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_method_id_idx" ON "chart_of_accounts"("method_id");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_company_id_organisation_id_account_code_key" ON "chart_of_accounts"("company_id", "organisation_id", "account_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_coa_account_detail_items_code_name" ON "coa_account_detail_items"("coa_id", "account_code", "account_name");

-- CreateIndex
CREATE INDEX "coa_account_owners_owner_id_idx" ON "coa_account_owners"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "coa_account_owners_coa_id_owner_id_key" ON "coa_account_owners"("coa_id", "owner_id");

-- CreateIndex
CREATE INDEX "coa_audit_log_company_id_idx" ON "coa_audit_log"("company_id");

-- CreateIndex
CREATE INDEX "coa_audit_log_coa_id_idx" ON "coa_audit_log"("coa_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_microsoft_entra_config_companyId_key" ON "company_microsoft_entra_config"("companyId");

-- CreateIndex
CREATE INDEX "company_microsoft_entra_config_companyId_enabled_idx" ON "company_microsoft_entra_config"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "organisation_company_id_parentOrganisationId_idx" ON "organisation"("company_id", "parentOrganisationId");

-- CreateIndex
CREATE INDEX "organisation_company_id_idx" ON "organisation"("company_id");

-- CreateIndex
CREATE INDEX "organisation_status_idx" ON "organisation"("status");

-- CreateIndex
CREATE INDEX "organisation_licenseStatus_idx" ON "organisation"("licenseStatus");

-- CreateIndex
CREATE INDEX "organisation_isSystemInternal_idx" ON "organisation"("isSystemInternal");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_company_id_code_key" ON "organisation"("company_id", "code");

-- CreateIndex
CREATE INDEX "lease_start_windows_company_id_idx" ON "lease_start_windows"("company_id");

-- CreateIndex
CREATE INDEX "lease_start_windows_organisation_id_idx" ON "lease_start_windows"("organisation_id");

-- CreateIndex
CREATE INDEX "lease_start_windows_property_lease_term_id_idx" ON "lease_start_windows"("property_lease_term_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_start_windows_property_lease_term_id_external_lease_s_key" ON "lease_start_windows"("property_lease_term_id", "external_lease_start_window_id");

-- CreateIndex
CREATE INDEX "user_company_access_userId_idx" ON "user_company_access"("userId");

-- CreateIndex
CREATE INDEX "user_company_access_companyId_idx" ON "user_company_access"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "user_company_access_userId_companyId_key" ON "user_company_access"("userId", "companyId");

-- CreateIndex
CREATE INDEX "business_role_companyId_isActive_idx" ON "business_role"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "business_role_companyId_code_key" ON "business_role"("companyId", "code");

-- CreateIndex
CREATE INDEX "business_role_assignment_userId_idx" ON "business_role_assignment"("userId");

-- CreateIndex
CREATE INDEX "business_role_assignment_companyId_idx" ON "business_role_assignment"("companyId");

-- CreateIndex
CREATE INDEX "business_role_assignment_organisationId_idx" ON "business_role_assignment"("organisationId");

-- CreateIndex
CREATE INDEX "business_role_assignment_propertyId_idx" ON "business_role_assignment"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "business_role_assignment_userId_businessRoleId_scopeType_sc_key" ON "business_role_assignment"("userId", "businessRoleId", "scopeType", "scopeRef");

-- CreateIndex
CREATE INDEX "workflow_definition_companyId_organisationId_idx" ON "workflow_definition"("companyId", "organisationId");

-- CreateIndex
CREATE INDEX "workflow_definition_status_idx" ON "workflow_definition"("status");

-- CreateIndex
CREATE INDEX "workflow_step_businessRoleId_idx" ON "workflow_step"("businessRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_step_workflowDefinitionId_stepOrder_key" ON "workflow_step"("workflowDefinitionId", "stepOrder");

-- CreateIndex
CREATE INDEX "audit_log_companyId_idx" ON "audit_log"("companyId");

-- CreateIndex
CREATE INDEX "audit_log_organisationId_idx" ON "audit_log"("organisationId");

-- CreateIndex
CREATE INDEX "audit_log_propertyId_idx" ON "audit_log"("propertyId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "state_master_state_code_key" ON "state_master"("state_code");

-- CreateIndex
CREATE INDEX "organisation_states_organisation_id_idx" ON "organisation_states"("organisation_id");

-- CreateIndex
CREATE INDEX "organisation_states_state_id_idx" ON "organisation_states"("state_id");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_states_organisation_id_state_id_key" ON "organisation_states"("organisation_id", "state_id");

-- CreateIndex
CREATE INDEX "idx_bs_property_year_status" ON "budget_snapshots"("property_id", "fiscal_year", "snapshot_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_snapshot_scope" ON "budget_snapshots"("property_id", "fiscal_year", "snapshot_type");

-- CreateIndex
CREATE INDEX "idx_bcl_snapshot_group_sort" ON "budget_calc_lines"("snapshot_id", "account_group", "sort_order");

-- CreateIndex
CREATE INDEX "idx_bcl_snapshot_linecode" ON "budget_calc_lines"("snapshot_id", "line_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_calc_line_code" ON "budget_calc_lines"("snapshot_id", "line_code");

-- CreateIndex
CREATE INDEX "idx_bclb_snapshot_linecode" ON "budget_calc_line_baselines"("snapshot_id", "line_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_calc_line_baseline_code" ON "budget_calc_line_baselines"("snapshot_id", "line_code");

-- CreateIndex
CREATE INDEX "idx_bcs_snapshot_no" ON "budget_change_sets"("snapshot_id", "change_set_no");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_change_set_no" ON "budget_change_sets"("snapshot_id", "change_set_no");

-- CreateIndex
CREATE INDEX "idx_bclc_snapshot_linecode" ON "budget_calc_line_changes"("snapshot_id", "line_code", "change_set_no");

-- CreateIndex
CREATE INDEX "idx_bdl_calc_line_sort" ON "budget_line_details"("calc_line_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_bdl_snapshot_linecode" ON "budget_line_details"("snapshot_id", "line_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_line_detail_code" ON "budget_line_details"("snapshot_id", "line_code");

-- CreateIndex
CREATE INDEX "idx_bdlb_snapshot_linecode" ON "budget_line_detail_baselines"("snapshot_id", "line_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_budget_line_detail_baseline_code" ON "budget_line_detail_baselines"("snapshot_id", "line_code");

-- CreateIndex
CREATE INDEX "idx_bdlc_snapshot_linecode" ON "budget_line_detail_changes"("snapshot_id", "line_code", "change_set_no");

-- CreateIndex
CREATE INDEX "periodic_drivers_company_id_idx" ON "periodic_drivers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "periodic_drivers_company_id_fiscal_year_key" ON "periodic_drivers"("company_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "idx_market_rent_unit_rates_property_year" ON "market_rent_unit_rates"("company_id", "organisation_id", "property_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "idx_market_rent_unit_rates_property_fy" ON "market_rent_unit_rates"("property_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "idx_market_rent_unit_rates_floorplan_name" ON "market_rent_unit_rates"("company_id", "organisation_id", "property_id", "fiscal_year", "floorplan_name");

-- CreateIndex
CREATE INDEX "idx_market_rent_change_sets_property_year" ON "market_rent_change_sets"("company_id", "organisation_id", "property_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "idx_market_rent_change_sets_status" ON "market_rent_change_sets"("status_after");

-- CreateIndex
CREATE INDEX "idx_market_rent_change_sets_changed_by" ON "market_rent_change_sets"("changed_by");

-- CreateIndex
CREATE INDEX "idx_market_rent_change_sets_approved_by" ON "market_rent_change_sets"("approved_by");

-- CreateIndex
CREATE UNIQUE INDEX "uq_market_rent_change_sets_no" ON "market_rent_change_sets"("company_id", "organisation_id", "property_id", "fiscal_year", "change_set_no");

-- CreateIndex
CREATE INDEX "idx_market_rent_unit_changes_change_set" ON "market_rent_unit_changes"("change_set_id");

-- CreateIndex
CREATE INDEX "idx_market_rent_unit_changes_property_year" ON "market_rent_unit_changes"("company_id", "organisation_id", "property_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "idx_market_rent_unit_changes_floorplan_name" ON "market_rent_unit_changes"("change_set_id", "floorplan_name");

-- CreateIndex
CREATE INDEX "non_income_units_company_id_organisation_id_property_id_fis_idx" ON "non_income_units"("company_id", "organisation_id", "property_id", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "non_income_units_property_unit_id_fiscal_year_key" ON "non_income_units"("property_unit_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "integration_plugins_company_id_idx" ON "integration_plugins"("company_id");

-- CreateIndex
CREATE INDEX "integration_plugins_source_type_idx" ON "integration_plugins"("source_type");

-- CreateIndex
CREATE INDEX "integration_sources_company_id_idx" ON "integration_sources"("company_id");

-- CreateIndex
CREATE INDEX "integration_sources_organisation_id_idx" ON "integration_sources"("organisation_id");

-- CreateIndex
CREATE INDEX "integration_sources_plugin_id_idx" ON "integration_sources"("plugin_id");

-- CreateIndex
CREATE INDEX "integration_sources_source_type_idx" ON "integration_sources"("source_type");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sources_company_id_organisation_id_source_code_key" ON "integration_sources"("company_id", "organisation_id", "source_code");

-- CreateIndex
CREATE UNIQUE INDEX "integration_source_configs_integration_source_id_key" ON "integration_source_configs"("integration_source_id");

-- CreateIndex
CREATE INDEX "integration_source_entities_integration_source_id_idx" ON "integration_source_entities"("integration_source_id");

-- CreateIndex
CREATE INDEX "integration_source_entities_entity_name_idx" ON "integration_source_entities"("entity_name");

-- CreateIndex
CREATE INDEX "integration_source_entities_is_enabled_idx" ON "integration_source_entities"("is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "integration_source_entities_integration_source_id_entity_na_key" ON "integration_source_entities"("integration_source_id", "entity_name");

-- CreateIndex
CREATE INDEX "integration_report_definitions_company_id_idx" ON "integration_report_definitions"("company_id");

-- CreateIndex
CREATE INDEX "integration_report_definitions_organisation_id_idx" ON "integration_report_definitions"("organisation_id");

-- CreateIndex
CREATE INDEX "integration_report_definitions_integration_source_id_idx" ON "integration_report_definitions"("integration_source_id");

-- CreateIndex
CREATE INDEX "integration_report_definitions_report_code_idx" ON "integration_report_definitions"("report_code");

-- CreateIndex
CREATE INDEX "integration_report_definitions_is_enabled_idx" ON "integration_report_definitions"("is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "integration_report_definitions_integration_source_id_report_key" ON "integration_report_definitions"("integration_source_id", "report_code");

-- CreateIndex
CREATE INDEX "integration_report_runs_company_id_idx" ON "integration_report_runs"("company_id");

-- CreateIndex
CREATE INDEX "integration_report_runs_organisation_id_idx" ON "integration_report_runs"("organisation_id");

-- CreateIndex
CREATE INDEX "integration_report_runs_integration_source_id_idx" ON "integration_report_runs"("integration_source_id");

-- CreateIndex
CREATE INDEX "integration_report_runs_report_definition_id_idx" ON "integration_report_runs"("report_definition_id");

-- CreateIndex
CREATE INDEX "integration_report_runs_sync_run_id_idx" ON "integration_report_runs"("sync_run_id");

-- CreateIndex
CREATE INDEX "integration_report_runs_report_code_idx" ON "integration_report_runs"("report_code");

-- CreateIndex
CREATE INDEX "integration_report_runs_status_idx" ON "integration_report_runs"("status");

-- CreateIndex
CREATE INDEX "integration_queue_jobs_company_id_idx" ON "integration_queue_jobs"("company_id");

-- CreateIndex
CREATE INDEX "integration_queue_jobs_organisation_id_idx" ON "integration_queue_jobs"("organisation_id");

-- CreateIndex
CREATE INDEX "integration_queue_jobs_integration_source_id_idx" ON "integration_queue_jobs"("integration_source_id");

-- CreateIndex
CREATE INDEX "integration_queue_jobs_queue_name_idx" ON "integration_queue_jobs"("queue_name");

-- CreateIndex
CREATE INDEX "integration_queue_jobs_status_idx" ON "integration_queue_jobs"("status");

-- CreateIndex
CREATE INDEX "integration_queue_jobs_bull_job_id_idx" ON "integration_queue_jobs"("bull_job_id");

-- CreateIndex
CREATE INDEX "integration_error_logs_company_id_occurred_at_idx" ON "integration_error_logs"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "integration_error_logs_organisation_id_occurred_at_idx" ON "integration_error_logs"("organisation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "integration_error_logs_integration_source_id_error_code_idx" ON "integration_error_logs"("integration_source_id", "error_code");

-- CreateIndex
CREATE INDEX "integration_error_logs_sync_run_id_idx" ON "integration_error_logs"("sync_run_id");

-- CreateIndex
CREATE INDEX "integration_error_logs_entity_name_idx" ON "integration_error_logs"("entity_name");

-- CreateIndex
CREATE INDEX "integration_error_logs_error_category_idx" ON "integration_error_logs"("error_category");

-- CreateIndex
CREATE INDEX "staging_api_batches_company_id_idx" ON "staging_api_batches"("company_id");

-- CreateIndex
CREATE INDEX "staging_api_batches_organisation_id_idx" ON "staging_api_batches"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_api_batches_integration_source_id_idx" ON "staging_api_batches"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_api_batches_sync_run_id_idx" ON "staging_api_batches"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_api_batches_entity_name_idx" ON "staging_api_batches"("entity_name");

-- CreateIndex
CREATE INDEX "staging_api_batches_status_idx" ON "staging_api_batches"("status");

-- CreateIndex
CREATE INDEX "staging_properties_company_id_idx" ON "staging_properties"("company_id");

-- CreateIndex
CREATE INDEX "staging_properties_organisation_id_idx" ON "staging_properties"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_properties_integration_source_id_idx" ON "staging_properties"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_properties_sync_run_id_idx" ON "staging_properties"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_properties_staging_batch_id_idx" ON "staging_properties"("staging_batch_id");

-- CreateIndex
CREATE INDEX "staging_properties_source_record_id_idx" ON "staging_properties"("source_record_id");

-- CreateIndex
CREATE INDEX "staging_properties_validation_status_idx" ON "staging_properties"("validation_status");

-- CreateIndex
CREATE INDEX "staging_properties_transform_status_idx" ON "staging_properties"("transform_status");

-- CreateIndex
CREATE INDEX "staging_properties_source_hash_idx" ON "staging_properties"("source_hash");

-- CreateIndex
CREATE INDEX "staging_property_units_company_id_idx" ON "staging_property_units"("company_id");

-- CreateIndex
CREATE INDEX "staging_property_units_organisation_id_idx" ON "staging_property_units"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_property_units_integration_source_id_idx" ON "staging_property_units"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_property_units_sync_run_id_idx" ON "staging_property_units"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_property_units_staging_batch_id_idx" ON "staging_property_units"("staging_batch_id");

-- CreateIndex
CREATE INDEX "staging_property_units_source_property_id_idx" ON "staging_property_units"("source_property_id");

-- CreateIndex
CREATE INDEX "staging_property_units_source_unit_id_idx" ON "staging_property_units"("source_unit_id");

-- CreateIndex
CREATE INDEX "staging_property_units_remote_primary_key_idx" ON "staging_property_units"("remote_primary_key");

-- CreateIndex
CREATE INDEX "staging_property_units_source_hash_idx" ON "staging_property_units"("source_hash");

-- CreateIndex
CREATE INDEX "staging_property_units_validation_status_idx" ON "staging_property_units"("validation_status");

-- CreateIndex
CREATE INDEX "staging_property_units_transform_status_idx" ON "staging_property_units"("transform_status");

-- CreateIndex
CREATE INDEX "staging_unit_types_company_id_idx" ON "staging_unit_types"("company_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_organisation_id_idx" ON "staging_unit_types"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_integration_source_id_idx" ON "staging_unit_types"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_sync_run_id_idx" ON "staging_unit_types"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_staging_batch_id_idx" ON "staging_unit_types"("staging_batch_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_source_property_id_idx" ON "staging_unit_types"("source_property_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_source_unit_type_id_idx" ON "staging_unit_types"("source_unit_type_id");

-- CreateIndex
CREATE INDEX "staging_unit_types_source_hash_idx" ON "staging_unit_types"("source_hash");

-- CreateIndex
CREATE INDEX "staging_unit_types_validation_status_idx" ON "staging_unit_types"("validation_status");

-- CreateIndex
CREATE INDEX "staging_unit_types_transform_status_idx" ON "staging_unit_types"("transform_status");

-- CreateIndex
CREATE INDEX "staging_budgets_company_id_idx" ON "staging_budgets"("company_id");

-- CreateIndex
CREATE INDEX "staging_budgets_organisation_id_idx" ON "staging_budgets"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_budgets_integration_source_id_idx" ON "staging_budgets"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_budgets_sync_run_id_idx" ON "staging_budgets"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_budgets_staging_batch_id_idx" ON "staging_budgets"("staging_batch_id");

-- CreateIndex
CREATE INDEX "staging_budgets_source_property_id_idx" ON "staging_budgets"("source_property_id");

-- CreateIndex
CREATE INDEX "staging_budgets_source_budget_id_idx" ON "staging_budgets"("source_budget_id");

-- CreateIndex
CREATE INDEX "staging_budgets_source_hash_idx" ON "staging_budgets"("source_hash");

-- CreateIndex
CREATE INDEX "staging_budgets_validation_status_idx" ON "staging_budgets"("validation_status");

-- CreateIndex
CREATE INDEX "staging_budgets_transform_status_idx" ON "staging_budgets"("transform_status");

-- CreateIndex
CREATE INDEX "staging_gl_trees_company_id_idx" ON "staging_gl_trees"("company_id");

-- CreateIndex
CREATE INDEX "staging_gl_trees_organisation_id_idx" ON "staging_gl_trees"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_gl_trees_integration_source_id_idx" ON "staging_gl_trees"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_gl_trees_sync_run_id_idx" ON "staging_gl_trees"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_gl_trees_staging_batch_id_idx" ON "staging_gl_trees"("staging_batch_id");

-- CreateIndex
CREATE INDEX "staging_gl_trees_record_type_idx" ON "staging_gl_trees"("record_type");

-- CreateIndex
CREATE INDEX "staging_gl_trees_transform_status_idx" ON "staging_gl_trees"("transform_status");

-- CreateIndex
CREATE UNIQUE INDEX "staging_gl_trees_company_id_organisation_id_integration_sou_key" ON "staging_gl_trees"("company_id", "organisation_id", "integration_source_id", "source_record_id");

-- CreateIndex
CREATE INDEX "staging_report_data_company_id_idx" ON "staging_report_data"("company_id");

-- CreateIndex
CREATE INDEX "staging_report_data_organisation_id_idx" ON "staging_report_data"("organisation_id");

-- CreateIndex
CREATE INDEX "staging_report_data_integration_source_id_idx" ON "staging_report_data"("integration_source_id");

-- CreateIndex
CREATE INDEX "staging_report_data_sync_run_id_idx" ON "staging_report_data"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_report_data_report_name_idx" ON "staging_report_data"("report_name");

-- CreateIndex
CREATE INDEX "staging_report_data_source_record_id_idx" ON "staging_report_data"("source_record_id");

-- CreateIndex
CREATE INDEX "staging_report_data_transform_status_idx" ON "staging_report_data"("transform_status");

-- CreateIndex
CREATE INDEX "staging_report_data_report_definition_id_idx" ON "staging_report_data"("report_definition_id");

-- CreateIndex
CREATE INDEX "staging_report_data_report_run_id_idx" ON "staging_report_data"("report_run_id");

-- CreateIndex
CREATE INDEX "source_record_maps_company_id_idx" ON "source_record_maps"("company_id");

-- CreateIndex
CREATE INDEX "source_record_maps_organisation_id_idx" ON "source_record_maps"("organisation_id");

-- CreateIndex
CREATE INDEX "source_record_maps_integration_source_id_idx" ON "source_record_maps"("integration_source_id");

-- CreateIndex
CREATE INDEX "source_record_maps_entity_name_idx" ON "source_record_maps"("entity_name");

-- CreateIndex
CREATE INDEX "source_record_maps_canonical_table_name_canonical_record_id_idx" ON "source_record_maps"("canonical_table_name", "canonical_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_record_maps_company_id_organisation_id_integration_s_key" ON "source_record_maps"("company_id", "organisation_id", "integration_source_id", "entity_name", "source_record_id");

-- CreateIndex
CREATE INDEX "integration_sync_runs_company_id_idx" ON "integration_sync_runs"("company_id");

-- CreateIndex
CREATE INDEX "integration_sync_runs_organisation_id_idx" ON "integration_sync_runs"("organisation_id");

-- CreateIndex
CREATE INDEX "integration_sync_runs_integration_source_id_idx" ON "integration_sync_runs"("integration_source_id");

-- CreateIndex
CREATE INDEX "integration_sync_runs_entity_name_idx" ON "integration_sync_runs"("entity_name");

-- CreateIndex
CREATE INDEX "integration_sync_runs_sync_type_idx" ON "integration_sync_runs"("sync_type");

-- CreateIndex
CREATE INDEX "integration_sync_runs_status_idx" ON "integration_sync_runs"("status");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_sync_run_id_idx" ON "staging_budget_actuals"("sync_run_id");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_staging_batch_id_idx" ON "staging_budget_actuals"("staging_batch_id");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_source_property_id_idx" ON "staging_budget_actuals"("source_property_id");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_source_budget_id_idx" ON "staging_budget_actuals"("source_budget_id");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_source_gl_tree_id_idx" ON "staging_budget_actuals"("source_gl_tree_id");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_source_gl_account_id_idx" ON "staging_budget_actuals"("source_gl_account_id");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_post_month_idx" ON "staging_budget_actuals"("post_month");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_validation_status_idx" ON "staging_budget_actuals"("validation_status");

-- CreateIndex
CREATE INDEX "staging_budget_actuals_transform_status_idx" ON "staging_budget_actuals"("transform_status");

-- CreateIndex
CREATE UNIQUE INDEX "staging_budget_actuals_company_id_organisation_id_integrati_key" ON "staging_budget_actuals"("company_id", "organisation_id", "integration_source_id", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_externalId_key" ON "properties"("externalId");

-- CreateIndex
CREATE INDEX "properties_company_id_idx" ON "properties"("company_id");

-- CreateIndex
CREATE INDEX "properties_organisation_id_idx" ON "properties"("organisation_id");

-- CreateIndex
CREATE INDEX "properties_property_name_idx" ON "properties"("property_name");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE UNIQUE INDEX "properties_company_id_property_code_key" ON "properties"("company_id", "property_code");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMainAddress_propertyId_key" ON "PropertyMainAddress"("propertyId");

-- CreateIndex
CREATE INDEX "property_addresses_company_id_idx" ON "property_addresses"("company_id");

-- CreateIndex
CREATE INDEX "property_addresses_organisation_id_idx" ON "property_addresses"("organisation_id");

-- CreateIndex
CREATE INDEX "property_addresses_property_id_idx" ON "property_addresses"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_post_months_property_id_key" ON "property_post_months"("property_id");

-- CreateIndex
CREATE INDEX "property_post_months_company_id_idx" ON "property_post_months"("company_id");

-- CreateIndex
CREATE INDEX "property_post_months_organisation_id_idx" ON "property_post_months"("organisation_id");

-- CreateIndex
CREATE INDEX "property_office_hours_company_id_idx" ON "property_office_hours"("company_id");

-- CreateIndex
CREATE INDEX "property_office_hours_organisation_id_idx" ON "property_office_hours"("organisation_id");

-- CreateIndex
CREATE INDEX "property_office_hours_property_id_idx" ON "property_office_hours"("property_id");

-- CreateIndex
CREATE INDEX "space_options_company_id_idx" ON "space_options"("company_id");

-- CreateIndex
CREATE INDEX "space_options_organisation_id_idx" ON "space_options"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "space_options_company_id_organisation_id_option_code_key" ON "space_options"("company_id", "organisation_id", "option_code");

-- CreateIndex
CREATE INDEX "property_space_options_company_id_idx" ON "property_space_options"("company_id");

-- CreateIndex
CREATE INDEX "property_space_options_organisation_id_idx" ON "property_space_options"("organisation_id");

-- CreateIndex
CREATE INDEX "property_space_options_property_id_idx" ON "property_space_options"("property_id");

-- CreateIndex
CREATE INDEX "property_space_options_space_option_id_idx" ON "property_space_options"("space_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_space_options_property_id_space_option_id_key" ON "property_space_options"("property_id", "space_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyExternalSnapshot_propertyId_key" ON "PropertyExternalSnapshot"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyExternalSnapshot_externalPropertyId_key" ON "PropertyExternalSnapshot"("externalPropertyId");

-- CreateIndex
CREATE INDEX "PropertyExternalSnapshot_provider_idx" ON "PropertyExternalSnapshot"("provider");

-- CreateIndex
CREATE INDEX "property_external_pet_policies_snapshot_id_idx" ON "property_external_pet_policies"("snapshot_id");

-- CreateIndex
CREATE INDEX "property_units_company_id_idx" ON "property_units"("company_id");

-- CreateIndex
CREATE INDEX "property_units_organisation_id_idx" ON "property_units"("organisation_id");

-- CreateIndex
CREATE INDEX "property_units_property_id_idx" ON "property_units"("property_id");

-- CreateIndex
CREATE INDEX "property_units_source_unit_id_idx" ON "property_units"("source_unit_id");

-- CreateIndex
CREATE INDEX "property_units_remote_primary_key_idx" ON "property_units"("remote_primary_key");

-- CreateIndex
CREATE INDEX "property_units_unit_number_idx" ON "property_units"("unit_number");

-- CreateIndex
CREATE INDEX "property_units_snapshotId_idx" ON "property_units"("snapshotId");

-- CreateIndex
CREATE INDEX "property_units_externalUnitId_idx" ON "property_units"("externalUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "property_units_company_id_organisation_id_property_id_unit__key" ON "property_units"("company_id", "organisation_id", "property_id", "unit_number");

-- CreateIndex
CREATE UNIQUE INDEX "property_unit_addresses_property_unit_id_key" ON "property_unit_addresses"("property_unit_id");

-- CreateIndex
CREATE INDEX "property_unit_addresses_company_id_idx" ON "property_unit_addresses"("company_id");

-- CreateIndex
CREATE INDEX "property_unit_addresses_organisation_id_idx" ON "property_unit_addresses"("organisation_id");

-- CreateIndex
CREATE INDEX "property_unit_addresses_property_unit_id_idx" ON "property_unit_addresses"("property_unit_id");

-- CreateIndex
CREATE INDEX "property_unit_spaces_company_id_idx" ON "property_unit_spaces"("company_id");

-- CreateIndex
CREATE INDEX "property_unit_spaces_organisation_id_idx" ON "property_unit_spaces"("organisation_id");

-- CreateIndex
CREATE INDEX "property_unit_spaces_property_unit_id_idx" ON "property_unit_spaces"("property_unit_id");

-- CreateIndex
CREATE INDEX "property_unit_spaces_source_unit_space_id_idx" ON "property_unit_spaces"("source_unit_space_id");

-- CreateIndex
CREATE INDEX "property_unit_spaces_availability_status_idx" ON "property_unit_spaces"("availability_status");

-- CreateIndex
CREATE INDEX "property_unit_spaces_externalUnitSpaceId_idx" ON "property_unit_spaces"("externalUnitSpaceId");

-- CreateIndex
CREATE UNIQUE INDEX "property_unit_spaces_property_unit_id_source_unit_space_id_key" ON "property_unit_spaces"("property_unit_id", "source_unit_space_id");

-- CreateIndex
CREATE INDEX "property_unit_types_company_id_idx" ON "property_unit_types"("company_id");

-- CreateIndex
CREATE INDEX "property_unit_types_organisation_id_idx" ON "property_unit_types"("organisation_id");

-- CreateIndex
CREATE INDEX "property_unit_types_property_id_idx" ON "property_unit_types"("property_id");

-- CreateIndex
CREATE INDEX "property_unit_types_source_unit_type_id_idx" ON "property_unit_types"("source_unit_type_id");

-- CreateIndex
CREATE INDEX "property_unit_types_unit_type_name_idx" ON "property_unit_types"("unit_type_name");

-- CreateIndex
CREATE UNIQUE INDEX "property_unit_types_company_id_organisation_id_property_id__key" ON "property_unit_types"("company_id", "organisation_id", "property_id", "source_unit_type_id");

-- CreateIndex
CREATE INDEX "property_unit_type_rent_terms_company_id_idx" ON "property_unit_type_rent_terms"("company_id");

-- CreateIndex
CREATE INDEX "property_unit_type_rent_terms_organisation_id_idx" ON "property_unit_type_rent_terms"("organisation_id");

-- CreateIndex
CREATE INDEX "property_unit_type_rent_terms_property_unit_type_id_idx" ON "property_unit_type_rent_terms"("property_unit_type_id");

-- CreateIndex
CREATE INDEX "property_unit_type_rent_terms_lease_term_id_idx" ON "property_unit_type_rent_terms"("lease_term_id");

-- CreateIndex
CREATE INDEX "property_unit_type_rent_terms_space_option_id_idx" ON "property_unit_type_rent_terms"("space_option_id");

-- CreateIndex
CREATE INDEX "PropertyUnitSpaceTermRent_unitSpaceId_idx" ON "PropertyUnitSpaceTermRent"("unitSpaceId");

-- CreateIndex
CREATE INDEX "property_unit_type_floorplans_company_id_idx" ON "property_unit_type_floorplans"("company_id");

-- CreateIndex
CREATE INDEX "property_unit_type_floorplans_organisation_id_idx" ON "property_unit_type_floorplans"("organisation_id");

-- CreateIndex
CREATE INDEX "property_unit_type_floorplans_property_unit_type_id_idx" ON "property_unit_type_floorplans"("property_unit_type_id");

-- CreateIndex
CREATE INDEX "property_unit_type_floorplans_source_floorplan_id_idx" ON "property_unit_type_floorplans"("source_floorplan_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_unit_type_floorplans_property_unit_type_id_source__key" ON "property_unit_type_floorplans"("property_unit_type_id", "source_floorplan_id");

-- CreateIndex
CREATE INDEX "PropertyUnitSpaceAmenity_unitSpaceId_idx" ON "PropertyUnitSpaceAmenity"("unitSpaceId");

-- CreateIndex
CREATE INDEX "PropertyUnitSpaceAmenity_externalAmenityId_idx" ON "PropertyUnitSpaceAmenity"("externalAmenityId");

-- CreateIndex
CREATE INDEX "property_workflow_assignment_userId_idx" ON "property_workflow_assignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "property_workflow_assignment_propertyId_workflowStepId_user_key" ON "property_workflow_assignment"("propertyId", "workflowStepId", "userId");

-- CreateIndex
CREATE INDEX "property_closing_statuses_company_id_idx" ON "property_closing_statuses"("company_id");

-- CreateIndex
CREATE INDEX "property_closing_statuses_organisation_id_idx" ON "property_closing_statuses"("organisation_id");

-- CreateIndex
CREATE INDEX "property_closing_statuses_property_id_idx" ON "property_closing_statuses"("property_id");

-- CreateIndex
CREATE INDEX "property_closing_statuses_property_name_idx" ON "property_closing_statuses"("property_name");

-- CreateIndex
CREATE INDEX "property_closing_statuses_source_hash_idx" ON "property_closing_statuses"("source_hash");

-- CreateIndex
CREATE UNIQUE INDEX "property_closing_statuses_company_id_organisation_id_proper_key" ON "property_closing_statuses"("company_id", "organisation_id", "property_name");

-- CreateIndex
CREATE INDEX "property_budget_actuals_property_id_idx" ON "property_budget_actuals"("property_id");

-- CreateIndex
CREATE INDEX "property_budget_actuals_budget_id_idx" ON "property_budget_actuals"("budget_id");

-- CreateIndex
CREATE INDEX "property_budget_actuals_gl_tree_id_idx" ON "property_budget_actuals"("gl_tree_id");

-- CreateIndex
CREATE INDEX "property_budget_actuals_gl_account_id_idx" ON "property_budget_actuals"("gl_account_id");

-- CreateIndex
CREATE INDEX "property_budget_actuals_post_month_idx" ON "property_budget_actuals"("post_month");

-- CreateIndex
CREATE INDEX "property_budget_actuals_fiscal_year_idx" ON "property_budget_actuals"("fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "property_budget_actuals_company_id_organisation_id_property_key" ON "property_budget_actuals"("company_id", "organisation_id", "property_id", "budget_id", "budget_gl_account_id", "post_month", "accounting_method");

-- CreateIndex
CREATE INDEX "gl_trees_company_id_idx" ON "gl_trees"("company_id");

-- CreateIndex
CREATE INDEX "gl_trees_organisation_id_idx" ON "gl_trees"("organisation_id");

-- CreateIndex
CREATE INDEX "gl_trees_source_gl_tree_id_idx" ON "gl_trees"("source_gl_tree_id");

-- CreateIndex
CREATE UNIQUE INDEX "gl_trees_company_id_organisation_id_source_gl_tree_id_key" ON "gl_trees"("company_id", "organisation_id", "source_gl_tree_id");

-- CreateIndex
CREATE INDEX "gl_tree_branches_company_id_idx" ON "gl_tree_branches"("company_id");

-- CreateIndex
CREATE INDEX "gl_tree_branches_organisation_id_idx" ON "gl_tree_branches"("organisation_id");

-- CreateIndex
CREATE INDEX "gl_tree_branches_gl_tree_id_idx" ON "gl_tree_branches"("gl_tree_id");

-- CreateIndex
CREATE INDEX "gl_tree_branches_source_branch_id_idx" ON "gl_tree_branches"("source_branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "gl_tree_branches_company_id_organisation_id_gl_tree_id_sour_key" ON "gl_tree_branches"("company_id", "organisation_id", "gl_tree_id", "source_branch_id");

-- CreateIndex
CREATE INDEX "gl_accounts_company_id_organisation_id_source_gl_account_id_idx" ON "gl_accounts"("company_id", "organisation_id", "source_gl_account_id");

-- CreateIndex
CREATE INDEX "gl_accounts_company_id_idx" ON "gl_accounts"("company_id");

-- CreateIndex
CREATE INDEX "gl_accounts_organisation_id_idx" ON "gl_accounts"("organisation_id");

-- CreateIndex
CREATE INDEX "gl_accounts_gl_tree_id_idx" ON "gl_accounts"("gl_tree_id");

-- CreateIndex
CREATE INDEX "gl_accounts_gl_tree_branch_id_idx" ON "gl_accounts"("gl_tree_branch_id");

-- CreateIndex
CREATE INDEX "gl_accounts_source_gl_account_id_idx" ON "gl_accounts"("source_gl_account_id");

-- CreateIndex
CREATE INDEX "gl_accounts_account_number_idx" ON "gl_accounts"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "gl_accounts_company_id_organisation_id_gl_tree_id_account_n_key" ON "gl_accounts"("company_id", "organisation_id", "gl_tree_id", "account_number");

-- CreateIndex
CREATE INDEX "property_gl_accounts_company_id_idx" ON "property_gl_accounts"("company_id");

-- CreateIndex
CREATE INDEX "property_gl_accounts_organisation_id_idx" ON "property_gl_accounts"("organisation_id");

-- CreateIndex
CREATE INDEX "property_gl_accounts_property_id_idx" ON "property_gl_accounts"("property_id");

-- CreateIndex
CREATE INDEX "property_gl_accounts_gl_tree_id_idx" ON "property_gl_accounts"("gl_tree_id");

-- CreateIndex
CREATE INDEX "property_gl_accounts_gl_account_id_idx" ON "property_gl_accounts"("gl_account_id");

-- CreateIndex
CREATE INDEX "property_gl_accounts_source_property_id_idx" ON "property_gl_accounts"("source_property_id");

-- CreateIndex
CREATE INDEX "property_gl_accounts_source_gl_account_id_idx" ON "property_gl_accounts"("source_gl_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_gl_accounts_company_id_organisation_id_property_id_key" ON "property_gl_accounts"("company_id", "organisation_id", "property_id", "gl_account_id");

-- CreateIndex
CREATE INDEX "property_gl_trees_company_id_organisation_id_property_id_is_idx" ON "property_gl_trees"("company_id", "organisation_id", "property_id", "is_active");

-- CreateIndex
CREATE INDEX "property_gl_trees_company_id_idx" ON "property_gl_trees"("company_id");

-- CreateIndex
CREATE INDEX "property_gl_trees_organisation_id_idx" ON "property_gl_trees"("organisation_id");

-- CreateIndex
CREATE INDEX "property_gl_trees_property_id_idx" ON "property_gl_trees"("property_id");

-- CreateIndex
CREATE INDEX "property_gl_trees_gl_tree_id_idx" ON "property_gl_trees"("gl_tree_id");

-- CreateIndex
CREATE INDEX "property_gl_trees_source_property_id_idx" ON "property_gl_trees"("source_property_id");

-- CreateIndex
CREATE INDEX "property_gl_trees_source_gl_tree_id_idx" ON "property_gl_trees"("source_gl_tree_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_gl_trees_company_id_organisation_id_property_id_gl_key" ON "property_gl_trees"("company_id", "organisation_id", "property_id", "gl_tree_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_identity" ADD CONSTRAINT "auth_identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_credential" ADD CONSTRAINT "password_credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenge" ADD CONSTRAINT "otp_challenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_session" ADD CONSTRAINT "refresh_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role" ADD CONSTRAINT "system_role_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignment" ADD CONSTRAINT "system_role_assignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignment" ADD CONSTRAINT "system_role_assignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignment" ADD CONSTRAINT "system_role_assignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignment" ADD CONSTRAINT "system_role_assignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignment" ADD CONSTRAINT "system_role_assignment_systemRoleId_fkey" FOREIGN KEY ("systemRoleId") REFERENCES "system_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_role_assignment" ADD CONSTRAINT "system_role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_menu_item" ADD CONSTRAINT "navigation_menu_item_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "navigation_menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_auditCreatedByUserId_fkey" FOREIGN KEY ("auditCreatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_auditModifiedByUserId_fkey" FOREIGN KEY ("auditModifiedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budgets" ADD CONSTRAINT "property_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budgets" ADD CONSTRAINT "property_budgets_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budgets" ADD CONSTRAINT "property_budgets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_gl_accounts" ADD CONSTRAINT "property_budget_gl_accounts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "property_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_monthly_amounts" ADD CONSTRAINT "property_budget_monthly_amounts_budget_gl_account_id_fkey" FOREIGN KEY ("budget_gl_account_id") REFERENCES "property_budget_gl_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "global_assumptions" ADD CONSTRAINT "global_assumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_methods" ADD CONSTRAINT "payroll_methods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_methods" ADD CONSTRAINT "payroll_methods_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_benefit_assumptions" ADD CONSTRAINT "payroll_benefit_assumptions_coa_account_id_fkey" FOREIGN KEY ("coa_account_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_benefit_assumptions" ADD CONSTRAINT "payroll_benefit_assumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_benefit_assumptions" ADD CONSTRAINT "payroll_benefit_assumptions_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "payroll_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_benefit_assumptions" ADD CONSTRAINT "payroll_benefit_assumptions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_global_assumptions" ADD CONSTRAINT "payroll_global_assumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_global_assumptions" ADD CONSTRAINT "payroll_global_assumptions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_state_configs" ADD CONSTRAINT "payroll_state_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_state_configs" ADD CONSTRAINT "payroll_state_configs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_state_assumptions" ADD CONSTRAINT "payroll_state_assumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_state_assumptions" ADD CONSTRAINT "payroll_state_assumptions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_state_assumptions" ADD CONSTRAINT "payroll_state_assumptions_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "state_master"("state_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_assumptions" ADD CONSTRAINT "payroll_position_assumptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_assumptions" ADD CONSTRAINT "payroll_position_assumptions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_assumptions" ADD CONSTRAINT "payroll_position_assumptions_parent_position_id_fkey" FOREIGN KEY ("parent_position_id") REFERENCES "payroll_position_assumptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_owner_values" ADD CONSTRAINT "payroll_position_owner_values_coa_account_id_fkey" FOREIGN KEY ("coa_account_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_owner_values" ADD CONSTRAINT "payroll_position_owner_values_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_owner_values" ADD CONSTRAINT "payroll_position_owner_values_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_position_owner_values" ADD CONSTRAINT "payroll_position_owner_values_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "payroll_position_assumptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_salary_details" ADD CONSTRAINT "payroll_salary_details_position_assumption_id_fkey" FOREIGN KEY ("position_assumption_id") REFERENCES "payroll_position_assumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_salary_detail_lines" ADD CONSTRAINT "payroll_salary_detail_lines_payroll_salary_detail_id_fkey" FOREIGN KEY ("payroll_salary_detail_id") REFERENCES "payroll_salary_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_types" ADD CONSTRAINT "coa_account_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_types" ADD CONSTRAINT "coa_account_types_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_heads" ADD CONSTRAINT "coa_account_heads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_heads" ADD CONSTRAINT "coa_account_heads_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_heads" ADD CONSTRAINT "coa_account_heads_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "coa_account_types"("type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_groups" ADD CONSTRAINT "coa_account_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_groups" ADD CONSTRAINT "coa_account_groups_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "coa_account_heads"("head_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_groups" ADD CONSTRAINT "coa_account_groups_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_owners" ADD CONSTRAINT "coa_owners_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "coa_account_groups"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "coa_account_heads"("head_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "coa_input_methods"("method_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "coa_account_types"("type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_detail_items" ADD CONSTRAINT "coa_account_detail_items_coa_id_fkey" FOREIGN KEY ("coa_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_owners" ADD CONSTRAINT "coa_account_owners_coa_id_fkey" FOREIGN KEY ("coa_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_account_owners" ADD CONSTRAINT "coa_account_owners_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "coa_owners"("owner_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_audit_log" ADD CONSTRAINT "coa_audit_log_coa_id_fkey" FOREIGN KEY ("coa_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coa_audit_log" ADD CONSTRAINT "coa_audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_microsoft_entra_config" ADD CONSTRAINT "company_microsoft_entra_config_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_auditCreatedByUserId_fkey" FOREIGN KEY ("auditCreatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_auditModifiedByUserId_fkey" FOREIGN KEY ("auditModifiedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parentOrganisationId_fkey" FOREIGN KEY ("parentOrganisationId") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_start_windows" ADD CONSTRAINT "lease_start_windows_property_lease_term_id_fkey" FOREIGN KEY ("property_lease_term_id") REFERENCES "property_lease_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_company_access" ADD CONSTRAINT "user_company_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role" ADD CONSTRAINT "business_role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role" ADD CONSTRAINT "business_role_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role_assignment" ADD CONSTRAINT "business_role_assignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role_assignment" ADD CONSTRAINT "business_role_assignment_businessRoleId_fkey" FOREIGN KEY ("businessRoleId") REFERENCES "business_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role_assignment" ADD CONSTRAINT "business_role_assignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role_assignment" ADD CONSTRAINT "business_role_assignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role_assignment" ADD CONSTRAINT "business_role_assignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_role_assignment" ADD CONSTRAINT "business_role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definition" ADD CONSTRAINT "workflow_definition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definition" ADD CONSTRAINT "workflow_definition_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_businessRoleId_fkey" FOREIGN KEY ("businessRoleId") REFERENCES "business_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step" ADD CONSTRAINT "workflow_step_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "workflow_definition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_impersonatedUserId_fkey" FOREIGN KEY ("impersonatedUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_states" ADD CONSTRAINT "organisation_states_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_states" ADD CONSTRAINT "organisation_states_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "state_master"("state_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_calc_lines" ADD CONSTRAINT "budget_calc_lines_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_calc_line_baselines" ADD CONSTRAINT "budget_calc_line_baselines_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_change_sets" ADD CONSTRAINT "budget_change_sets_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_calc_line_changes" ADD CONSTRAINT "budget_calc_line_changes_calc_line_id_fkey" FOREIGN KEY ("calc_line_id") REFERENCES "budget_calc_lines"("calc_line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_calc_line_changes" ADD CONSTRAINT "budget_calc_line_changes_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "budget_change_sets"("change_set_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_calc_line_changes" ADD CONSTRAINT "budget_calc_line_changes_coa_id_fkey" FOREIGN KEY ("coa_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_calc_line_changes" ADD CONSTRAINT "budget_calc_line_changes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_details" ADD CONSTRAINT "budget_line_details_calc_line_id_fkey" FOREIGN KEY ("calc_line_id") REFERENCES "budget_calc_lines"("calc_line_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_details" ADD CONSTRAINT "budget_line_details_coaAccountDetailItemDetailItemId_fkey" FOREIGN KEY ("coaAccountDetailItemDetailItemId") REFERENCES "coa_account_detail_items"("detail_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_details" ADD CONSTRAINT "budget_line_details_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_baselines" ADD CONSTRAINT "budget_line_detail_baselines_calc_line_baseline_id_fkey" FOREIGN KEY ("calc_line_baseline_id") REFERENCES "budget_calc_line_baselines"("calc_line_baseline_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_baselines" ADD CONSTRAINT "budget_line_detail_baselines_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_changes" ADD CONSTRAINT "budget_line_detail_changes_calc_line_id_fkey" FOREIGN KEY ("calc_line_id") REFERENCES "budget_calc_lines"("calc_line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_changes" ADD CONSTRAINT "budget_line_detail_changes_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "budget_change_sets"("change_set_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_changes" ADD CONSTRAINT "budget_line_detail_changes_detail_line_id_fkey" FOREIGN KEY ("detail_line_id") REFERENCES "budget_line_details"("detail_line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_changes" ADD CONSTRAINT "budget_line_detail_changes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "budget_snapshots"("snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_changes" ADD CONSTRAINT "budget_line_detail_changes_coa_id_fkey" FOREIGN KEY ("coa_id") REFERENCES "chart_of_accounts"("coa_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_detail_changes" ADD CONSTRAINT "budget_line_detail_changes_detail_item_id_fkey" FOREIGN KEY ("detail_item_id") REFERENCES "coa_account_detail_items"("detail_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodic_drivers" ADD CONSTRAINT "periodic_drivers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodic_drivers" ADD CONSTRAINT "periodic_drivers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_rates" ADD CONSTRAINT "market_rent_unit_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_rates" ADD CONSTRAINT "market_rent_unit_rates_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_rates" ADD CONSTRAINT "market_rent_unit_rates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_change_sets" ADD CONSTRAINT "market_rent_change_sets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_change_sets" ADD CONSTRAINT "market_rent_change_sets_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_change_sets" ADD CONSTRAINT "market_rent_change_sets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_changes" ADD CONSTRAINT "market_rent_unit_changes_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "market_rent_change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_changes" ADD CONSTRAINT "market_rent_unit_changes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_changes" ADD CONSTRAINT "market_rent_unit_changes_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_changes" ADD CONSTRAINT "market_rent_unit_changes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_rent_unit_changes" ADD CONSTRAINT "market_rent_unit_changes_market_rent_rate_id_fkey" FOREIGN KEY ("market_rent_rate_id") REFERENCES "market_rent_unit_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_income_units" ADD CONSTRAINT "non_income_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_income_units" ADD CONSTRAINT "non_income_units_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_income_units" ADD CONSTRAINT "non_income_units_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_income_units" ADD CONSTRAINT "non_income_units_property_unit_id_fkey" FOREIGN KEY ("property_unit_id") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_plugins" ADD CONSTRAINT "integration_plugins_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "integration_plugins"("plugin_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_source_configs" ADD CONSTRAINT "integration_source_configs_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_source_entities" ADD CONSTRAINT "integration_source_entities_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_definitions" ADD CONSTRAINT "integration_report_definitions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_definitions" ADD CONSTRAINT "integration_report_definitions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_definitions" ADD CONSTRAINT "integration_report_definitions_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_runs" ADD CONSTRAINT "integration_report_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_runs" ADD CONSTRAINT "integration_report_runs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_runs" ADD CONSTRAINT "integration_report_runs_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_runs" ADD CONSTRAINT "integration_report_runs_report_definition_id_fkey" FOREIGN KEY ("report_definition_id") REFERENCES "integration_report_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_report_runs" ADD CONSTRAINT "integration_report_runs_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_error_logs" ADD CONSTRAINT "integration_error_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_error_logs" ADD CONSTRAINT "integration_error_logs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_error_logs" ADD CONSTRAINT "integration_error_logs_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_error_logs" ADD CONSTRAINT "integration_error_logs_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_api_batches" ADD CONSTRAINT "staging_api_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_api_batches" ADD CONSTRAINT "staging_api_batches_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_api_batches" ADD CONSTRAINT "staging_api_batches_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_api_batches" ADD CONSTRAINT "staging_api_batches_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_properties" ADD CONSTRAINT "staging_properties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_properties" ADD CONSTRAINT "staging_properties_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_properties" ADD CONSTRAINT "staging_properties_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_api_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_property_units" ADD CONSTRAINT "staging_property_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_property_units" ADD CONSTRAINT "staging_property_units_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_property_units" ADD CONSTRAINT "staging_property_units_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_property_units" ADD CONSTRAINT "staging_property_units_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_api_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_property_units" ADD CONSTRAINT "staging_property_units_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_unit_types" ADD CONSTRAINT "staging_unit_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_unit_types" ADD CONSTRAINT "staging_unit_types_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_unit_types" ADD CONSTRAINT "staging_unit_types_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_unit_types" ADD CONSTRAINT "staging_unit_types_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_unit_types" ADD CONSTRAINT "staging_unit_types_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_api_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budgets" ADD CONSTRAINT "staging_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budgets" ADD CONSTRAINT "staging_budgets_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budgets" ADD CONSTRAINT "staging_budgets_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budgets" ADD CONSTRAINT "staging_budgets_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budgets" ADD CONSTRAINT "staging_budgets_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_api_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_gl_trees" ADD CONSTRAINT "staging_gl_trees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_gl_trees" ADD CONSTRAINT "staging_gl_trees_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_gl_trees" ADD CONSTRAINT "staging_gl_trees_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_gl_trees" ADD CONSTRAINT "staging_gl_trees_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_gl_trees" ADD CONSTRAINT "staging_gl_trees_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_api_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_report_data" ADD CONSTRAINT "staging_report_data_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_report_data" ADD CONSTRAINT "staging_report_data_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_report_data" ADD CONSTRAINT "staging_report_data_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_report_data" ADD CONSTRAINT "staging_report_data_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_report_data" ADD CONSTRAINT "staging_report_data_staging_batch_id_fkey" FOREIGN KEY ("staging_batch_id") REFERENCES "staging_api_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_maps" ADD CONSTRAINT "source_record_maps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_maps" ADD CONSTRAINT "source_record_maps_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_record_maps" ADD CONSTRAINT "source_record_maps_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_runs" ADD CONSTRAINT "integration_sync_runs_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budget_actuals" ADD CONSTRAINT "staging_budget_actuals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budget_actuals" ADD CONSTRAINT "staging_budget_actuals_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budget_actuals" ADD CONSTRAINT "staging_budget_actuals_integration_source_id_fkey" FOREIGN KEY ("integration_source_id") REFERENCES "integration_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_budget_actuals" ADD CONSTRAINT "staging_budget_actuals_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "integration_sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_property_manager_id_fkey" FOREIGN KEY ("property_manager_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "workflow_definition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMainAddress" ADD CONSTRAINT "PropertyMainAddress_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_addresses" ADD CONSTRAINT "property_addresses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_post_months" ADD CONSTRAINT "property_post_months_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_office_hours" ADD CONSTRAINT "property_office_hours_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_space_options" ADD CONSTRAINT "property_space_options_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_space_options" ADD CONSTRAINT "property_space_options_space_option_id_fkey" FOREIGN KEY ("space_option_id") REFERENCES "space_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_lease_terms" ADD CONSTRAINT "property_lease_terms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyLeaseWindow" ADD CONSTRAINT "PropertyLeaseWindow_leaseTermId_fkey" FOREIGN KEY ("leaseTermId") REFERENCES "property_lease_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyExternalSnapshot" ADD CONSTRAINT "PropertyExternalSnapshot_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_external_pet_policies" ADD CONSTRAINT "property_external_pet_policies_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "PropertyExternalSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PropertyExternalSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_addresses" ADD CONSTRAINT "property_unit_addresses_property_unit_id_fkey" FOREIGN KEY ("property_unit_id") REFERENCES "property_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_spaces" ADD CONSTRAINT "property_unit_spaces_property_unit_id_fkey" FOREIGN KEY ("property_unit_id") REFERENCES "property_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_types" ADD CONSTRAINT "property_unit_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_types" ADD CONSTRAINT "property_unit_types_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_types" ADD CONSTRAINT "property_unit_types_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_type_rent_terms" ADD CONSTRAINT "property_unit_type_rent_terms_property_unit_type_id_fkey" FOREIGN KEY ("property_unit_type_id") REFERENCES "property_unit_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyUnitSpaceTermRent" ADD CONSTRAINT "PropertyUnitSpaceTermRent_unitSpaceId_fkey" FOREIGN KEY ("unitSpaceId") REFERENCES "property_unit_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_unit_type_floorplans" ADD CONSTRAINT "property_unit_type_floorplans_property_unit_type_id_fkey" FOREIGN KEY ("property_unit_type_id") REFERENCES "property_unit_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyUnitSpaceAmenity" ADD CONSTRAINT "PropertyUnitSpaceAmenity_unitSpaceId_fkey" FOREIGN KEY ("unitSpaceId") REFERENCES "property_unit_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_workflow_assignment" ADD CONSTRAINT "property_workflow_assignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_workflow_assignment" ADD CONSTRAINT "property_workflow_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_workflow_assignment" ADD CONSTRAINT "property_workflow_assignment_workflowStepId_fkey" FOREIGN KEY ("workflowStepId") REFERENCES "workflow_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_closing_statuses" ADD CONSTRAINT "property_closing_statuses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_closing_statuses" ADD CONSTRAINT "property_closing_statuses_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "property_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_gl_tree_id_fkey" FOREIGN KEY ("gl_tree_id") REFERENCES "gl_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_propertyGlAccountId_fkey" FOREIGN KEY ("propertyGlAccountId") REFERENCES "property_gl_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_budget_actuals" ADD CONSTRAINT "property_budget_actuals_budget_gl_account_id_fkey" FOREIGN KEY ("budget_gl_account_id") REFERENCES "property_budget_gl_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_trees" ADD CONSTRAINT "gl_trees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_trees" ADD CONSTRAINT "gl_trees_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_tree_branches" ADD CONSTRAINT "gl_tree_branches_gl_tree_id_fkey" FOREIGN KEY ("gl_tree_id") REFERENCES "gl_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_tree_branches" ADD CONSTRAINT "gl_tree_branches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_tree_branches" ADD CONSTRAINT "gl_tree_branches_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_gl_tree_id_fkey" FOREIGN KEY ("gl_tree_id") REFERENCES "gl_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_gl_tree_branch_id_fkey" FOREIGN KEY ("gl_tree_branch_id") REFERENCES "gl_tree_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_accounts" ADD CONSTRAINT "property_gl_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_accounts" ADD CONSTRAINT "property_gl_accounts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_accounts" ADD CONSTRAINT "property_gl_accounts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_accounts" ADD CONSTRAINT "property_gl_accounts_gl_tree_id_fkey" FOREIGN KEY ("gl_tree_id") REFERENCES "gl_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_accounts" ADD CONSTRAINT "property_gl_accounts_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "gl_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_accounts" ADD CONSTRAINT "property_gl_accounts_stagingPropertyId_fkey" FOREIGN KEY ("stagingPropertyId") REFERENCES "staging_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_trees" ADD CONSTRAINT "property_gl_trees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_trees" ADD CONSTRAINT "property_gl_trees_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_trees" ADD CONSTRAINT "property_gl_trees_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_gl_trees" ADD CONSTRAINT "property_gl_trees_gl_tree_id_fkey" FOREIGN KEY ("gl_tree_id") REFERENCES "gl_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
