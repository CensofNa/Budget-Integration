import 'dotenv/config';
import argon2 from 'argon2';
import { Prisma, AccessStatus, AssignmentStatus, AuthProvider, EntityType, EntityTypeDetail, LicenseDurationUnit, LicenseStatus, OnboardingStatus, OrganisationKind, OrganisationStatus, PayrollSalaryMeasureCode, PayrollSalaryType, PrismaClient, PropertyStatus, ScopeType, UserPrincipalType, UserStatus, WorkflowStatus, WorkflowStepType } from '@prisma/client';
const prisma = new PrismaClient();
const DEV_PASSWORD = 'Password@123';
const dates = {
    contractStart: new Date('2026-01-01T00:00:00.000Z'),
    contractEnd: new Date('2026-12-31T23:59:59.000Z'),
    licenseStart: new Date('2026-01-15T00:00:00.000Z'),
    licenseEnd: new Date('2027-01-15T00:00:00.000Z'),
    inviteDate: new Date('2026-01-05T10:00:00.000Z'),
    activatedDate: new Date('2026-01-06T10:00:00.000Z')
};
const coaInputMethods = [
    {
        name: 'Detail',
        description: 'Detailed account input method'
    },
    {
        name: 'Formula',
        description: 'Formula-based account calculation method'
    },
    {
        name: 'Input Line(s)',
        description: 'Manual input line based account method'
    }
];
const coaReferenceHierarchy = [
    {
        typeName: 'Assets',
        heads: [
            {
                headName: 'Current Assets',
                groups: [
                    'Accounts Receivable',
                    'Cash',
                    'Fixed Assets',
                    'Other Assets',
                    'Other Current Assets',
                    'Prepaids & Escrows & Deposits'
                ]
            }
        ]
    },
    {
        typeName: 'Liabilities',
        heads: [
            {
                headName: 'Current Liabilities',
                groups: [
                    'Accounts Payable and Accrued Expenses',
                    'Long Term Liabilities',
                    'Other Liabilities'
                ]
            },
            {
                headName: 'Equity',
                groups: ["Partner's Equity/Retained Earnings"]
            },
            {
                headName: 'Income',
                groups: [
                    'Gross Potential Rents',
                    'Other Income',
                    'Rental Income Adjustments'
                ]
            },
            {
                headName: 'Operating Expenses',
                groups: [
                    'Advertising and Marketing',
                    'Contract Services',
                    'Debt Service',
                    'General R&M',
                    'General and Administrative',
                    'Insurance',
                    'Landscaping/Grounds',
                    'Property Payroll',
                    'Redecorating',
                    'Taxes',
                    'Utilities'
                ]
            },
            {
                headName: 'Non Operating Income/Expenses',
                groups: [
                    'Depreciation/Amortization Expense',
                    'Ownership Income/Expenses',
                    'R&M Expenditures'
                ]
            }
        ]
    }
];
async function createCoaReferenceData(params) {
    console.log('Creating COA reference data...');
    for (const method of coaInputMethods) {
        await prisma.coaInputMethod.upsert({
            where: {
                name: method.name
            },
            update: {
                description: method.description,
                isActive: true
            },
            create: {
                name: method.name,
                description: method.description,
                isActive: true
            }
        });
    }
    let typeSortOrder = 1;
    for (const typeItem of coaReferenceHierarchy) {
        const accountType = await prisma.coaAccountType.upsert({
            where: {
                companyId_organisationId_name: {
                    companyId: params.companyId,
                    organisationId: params.organisationId,
                    name: typeItem.typeName
                }
            },
            update: {
                sortOrder: typeSortOrder,
                isActive: true
            },
            create: {
                companyId: params.companyId,
                organisationId: params.organisationId,
                name: typeItem.typeName,
                sortOrder: typeSortOrder,
                isActive: true
            }
        });
        let headSortOrder = 1;
        for (const headItem of typeItem.heads) {
            const accountHead = await prisma.coaAccountHead.upsert({
                where: {
                    companyId_organisationId_typeId_name: {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        typeId: accountType.id,
                        name: headItem.headName
                    }
                },
                update: {
                    sortOrder: headSortOrder,
                    isActive: true
                },
                create: {
                    companyId: params.companyId,
                    organisationId: params.organisationId,
                    typeId: accountType.id,
                    name: headItem.headName,
                    sortOrder: headSortOrder,
                    isActive: true
                }
            });
            let groupSortOrder = 1;
            for (const groupName of headItem.groups) {
                await prisma.coaAccountGroup.upsert({
                    where: {
                        companyId_organisationId_headId_name: {
                            companyId: params.companyId,
                            organisationId: params.organisationId,
                            headId: accountHead.id,
                            name: groupName
                        }
                    },
                    update: {
                        sortOrder: groupSortOrder,
                        isActive: true
                    },
                    create: {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        headId: accountHead.id,
                        name: groupName,
                        sortOrder: groupSortOrder,
                        isActive: true
                    }
                });
                groupSortOrder++;
            }
            headSortOrder++;
        }
        typeSortOrder++;
    }
}
async function createCoaAccounts(params) {
    console.log('Creating COA accounts...');
    const [types, heads, groups, methods] = await Promise.all([
        prisma.coaAccountType.findMany({ where: { companyId: params.companyId } }),
        prisma.coaAccountHead.findMany({ where: { companyId: params.companyId } }),
        prisma.coaAccountGroup.findMany({ where: { companyId: params.companyId } }),
        prisma.coaInputMethod.findMany(),
    ]);
    const typeMap = new Map(types.map((t) => [t.name, t.id]));
    const headMap = new Map(heads.map((h) => [h.name, h.id]));
    const groupMap = new Map(groups.map((g) => [g.name, g.id]));
    const methodMap = new Map(methods.map((m) => [m.name, m.id]));
    const accounts = [
        { accountCode: "10100", accountDesc: "10100 - Cash - Operating", accountName: "Cash - Operating", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10150", accountDesc: "10150 - Cash - Depository", accountName: "Cash - Depository", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Input Line(s)" },
        { accountCode: "10155", accountDesc: "10155 - Cash - Depository 2", accountName: "Cash - Depository 2", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Input Line(s)" },
        { accountCode: "10200", accountDesc: "10200 - Cash - Operating 2", accountName: "Cash - Operating 2", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "10250", accountDesc: "10250 - Cash - Operating Prior Management", accountName: "Cash - Operating Prior Management", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Input Line(s)" },
        { accountCode: "10300", accountDesc: "10300 - Cash - Operating 3", accountName: "Cash - Operating 3", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "10304", accountDesc: "10304 - Cash - Lender Reserve", accountName: "Cash - Lender Reserve", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10305", accountDesc: "10305 - Cash - Capital Reserve", accountName: "Cash - Capital Reserve", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10306", accountDesc: "10306 - Cash - Tax Reserve", accountName: "Cash - Tax Reserve", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "10307", accountDesc: "10307 - Cash -  Insurance Reserve", accountName: "Cash -  Insurance Reserve", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "10325", accountDesc: "10325 - Cash - Deposits in Transit", accountName: "Cash - Deposits in Transit", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Input Line(s)" },
        { accountCode: "10330", accountDesc: "10330 - Cash - Clearing Sweep Transfer", accountName: "Cash - Clearing Sweep Transfer", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10350", accountDesc: "10350 - Cash - Retail", accountName: "Cash - Retail", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10400", accountDesc: "10400 - Cash - Security Deposit Escrow", accountName: "Cash - Security Deposit Escrow", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10425", accountDesc: "10425 - Cash - Security Deposit Escrow 2", accountName: "Cash - Security Deposit Escrow 2", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10427", accountDesc: "10427 - Cash - Security Deposit Escrow 3", accountName: "Cash - Security Deposit Escrow 3", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10450", accountDesc: "10450 - Cash - Security Deposit Prior Management", accountName: "Cash - Security Deposit Prior Management", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10550", accountDesc: "10550 - Cash - Money Market", accountName: "Cash - Money Market", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10560", accountDesc: "10560 - Cash - Money Market 2", accountName: "Cash - Money Market 2", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10570", accountDesc: "10570 - Cash - Money Market 3", accountName: "Cash - Money Market 3", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10580", accountDesc: "10580 - Cash - Money Market 4", accountName: "Cash - Money Market 4", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10650", accountDesc: "10650 - Cash - Petty Cash", accountName: "Cash - Petty Cash", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Input Line(s)" },
        { accountCode: "10700", accountDesc: "10700 - Cash - Owner's Other", accountName: "Cash - Owner's Other", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "10710", accountDesc: "10710 - Cash - Owner's Other 2", accountName: "Cash - Owner's Other 2", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10720", accountDesc: "10720 - Cash - Owner's Other 3", accountName: "Cash - Owner's Other 3", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Input Line(s)" },
        { accountCode: "10730", accountDesc: "10730 - Cash - Owner's Other 4", accountName: "Cash - Owner's Other 4", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "10740", accountDesc: "10740 - Cash - Owner's Other 5", accountName: "Cash - Owner's Other 5", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10750", accountDesc: "10750 - Cash - Owner's Other 6", accountName: "Cash - Owner's Other 6", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Detail" },
        { accountCode: "10950", accountDesc: "10950 - Cash - Partnership Account", accountName: "Cash - Partnership Account", typeName: "Assets", headName: "Current Assets", groupName: "Cash", methodName: "Formula" },
        { accountCode: "12100", accountDesc: "12100 - Accounts Receivable", accountName: "Accounts Receivable", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Formula" },
        { accountCode: "12110", accountDesc: "12110 - A/R - Retail", accountName: "A/R - Retail", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Input Line(s)" },
        { accountCode: "12300", accountDesc: "12300 - [SYSTEM] Pending Reimbursements", accountName: "[SYSTEM] Pending Reimbursements", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Formula" },
        { accountCode: "12310", accountDesc: "12310 - [SYSTEM] Inter-Company Receivable", accountName: "[SYSTEM] Inter-Company Receivable", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Formula" },
        { accountCode: "12320", accountDesc: "12320 - [SYSTEM] Funding Receivable", accountName: "[SYSTEM] Funding Receivable", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Detail" },
        { accountCode: "12500", accountDesc: "12500 - Allowance for Doubtful Accounts", accountName: "Allowance for Doubtful Accounts", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Detail" },
        { accountCode: "12600", accountDesc: "12600 - Accrued Rent Receivable", accountName: "Accrued Rent Receivable", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Formula" },
        { accountCode: "12700", accountDesc: "12700 - A/R - Other Receivable", accountName: "A/R - Other Receivable", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Detail" },
        { accountCode: "12810", accountDesc: "12810 - A/R - Other 2", accountName: "A/R - Other 2", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Detail" },
        { accountCode: "12900", accountDesc: "12900 - A/R - Deposits", accountName: "A/R - Deposits", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Input Line(s)" },
        { accountCode: "12705", accountDesc: "12705 - A/R - TAD Reimbursement", accountName: "A/R - TAD Reimbursement", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Detail" },
        { accountCode: "12750", accountDesc: "12750 - A/R - Insurance Claim Receivable", accountName: "A/R - Insurance Claim Receivable", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Formula" },
        { accountCode: "12800", accountDesc: "12800 - A/R - Other", accountName: "A/R - Other", typeName: "Assets", headName: "Current Assets", groupName: "Accounts Receivable", methodName: "Formula" },
        { accountCode: "13100", accountDesc: "13100 - Prepaid Property Taxes", accountName: "Prepaid Property Taxes", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Detail" },
        { accountCode: "13200", accountDesc: "13200 - Prepaid Insurance", accountName: "Prepaid Insurance", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "13300", accountDesc: "13300 - Prepaid - Other", accountName: "Prepaid - Other", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Detail" },
        { accountCode: "13310", accountDesc: "13310 - Prepaid - Items Received", accountName: "Prepaid - Items Received", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Detail" },
        { accountCode: "13510", accountDesc: "13510 - Loan Escrow - Lender Operating Reserve", accountName: "Loan Escrow - Lender Operating Reserve", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Input Line(s)" },
        { accountCode: "13520", accountDesc: "13520 - Loan Escrow - Other", accountName: "Loan Escrow - Other", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Detail" },
        { accountCode: "13530", accountDesc: "13530 - Loan Escrow - MIP", accountName: "Loan Escrow - MIP", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Detail" },
        { accountCode: "13610", accountDesc: "13610 - Loan Escrow - Capital Reserves", accountName: "Loan Escrow - Capital Reserves", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "13620", accountDesc: "13620 - Loan Escrow - Insurance", accountName: "Loan Escrow - Insurance", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Input Line(s)" },
        { accountCode: "13630", accountDesc: "13630 - Loan Escrow - Interest", accountName: "Loan Escrow - Interest", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "13640", accountDesc: "13640 - Loan Escrow - Property Taxes", accountName: "Loan Escrow - Property Taxes", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Input Line(s)" },
        { accountCode: "13650", accountDesc: "13650 - Earnest Money Deposits", accountName: "Earnest Money Deposits", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "13662", accountDesc: "13662 - Contract Deposits", accountName: "Contract Deposits", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "13661", accountDesc: "13661 - Payroll Deposits", accountName: "Payroll Deposits", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "13660", accountDesc: "13660 - Utility Deposits", accountName: "Utility Deposits", typeName: "Assets", headName: "Current Assets", groupName: "Prepaids & Escrows & Deposits", methodName: "Formula" },
        { accountCode: "14100", accountDesc: "14100 - Due from Related Party", accountName: "Due from Related Party", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "14110", accountDesc: "14110 - Due from Related Party 2", accountName: "Due from Related Party 2", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "14300", accountDesc: "14300 - Due to Corporate", accountName: "Due to Corporate", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "14895", accountDesc: "14895 - Inventory", accountName: "Inventory", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "15050", accountDesc: "15050 - Land", accountName: "Land", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15075", accountDesc: "15075 - Land - Step Up", accountName: "Land - Step Up", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15100", accountDesc: "15100 - Land Improvements", accountName: "Land Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15130", accountDesc: "15130 - Land Improvements - Nonrecurring - INA", accountName: "Land Improvements - Nonrecurring - INA", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15150", accountDesc: "15150 - Buildings", accountName: "Buildings", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15151", accountDesc: "15151 - WIP - Labor & Materials", accountName: "WIP - Labor & Materials", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15200", accountDesc: "15200 - Building Improvements", accountName: "Building Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15202", accountDesc: "15202 - Building Improvements - Non-recurring", accountName: "Building Improvements - Non-recurring", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15203", accountDesc: "15203 - Building Improvements Step Up", accountName: "Building Improvements Step Up", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15250", accountDesc: "15250 - Acquisition Costs", accountName: "Acquisition Costs", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15255", accountDesc: "15255 - Acquisition Costs - Legal", accountName: "Acquisition Costs - Legal", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15270", accountDesc: "15270 - Construction in Progress", accountName: "Construction in Progress", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15271", accountDesc: "15271 - CIP - Transfer To", accountName: "CIP - Transfer To", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15272", accountDesc: "15272 - CIP - FF&E", accountName: "CIP - FF&E", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15315", accountDesc: "15315 - Tenant Improvements", accountName: "Tenant Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15319", accountDesc: "15319 - Leasehold Improv - Retail", accountName: "Leasehold Improv - Retail", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15320", accountDesc: "15320 - Building Equipment", accountName: "Building Equipment", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15330", accountDesc: "15330 - Deprec - Assets", accountName: "Deprec - Assets", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15340", accountDesc: "15340 - Deprec Assets - GPE", accountName: "Deprec Assets - GPE", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15350", accountDesc: "15350 - Buildings - Step Up", accountName: "Buildings - Step Up", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15380", accountDesc: "15380 - FF&E - Nonrecurring - INA", accountName: "FF&E - Nonrecurring - INA", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15385", accountDesc: "15385 - Non-recurring Capitalized Corp Svcs", accountName: "Non-recurring Capitalized Corp Svcs", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15390", accountDesc: "15390 - Recurring Capitalized Corp Svcs", accountName: "Recurring Capitalized Corp Svcs", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15395", accountDesc: "15395 - Acquisition Deferred Maintenance Capital", accountName: "Acquisition Deferred Maintenance Capital", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15400", accountDesc: "15400 - Furniture, Fixtures and Equipment", accountName: "Furniture, Fixtures and Equipment", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15450", accountDesc: "15450 - F/A - Vinyl", accountName: "F/A - Vinyl", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15460", accountDesc: "15460 - F/A - Carpet", accountName: "F/A - Carpet", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15475", accountDesc: "15475 - F/A - Appliances", accountName: "F/A - Appliances", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15500", accountDesc: "15500 - F/A - HVAC", accountName: "F/A - HVAC", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15525", accountDesc: "15525 - F/A - Water Heaters/Plumbing", accountName: "F/A - Water Heaters/Plumbing", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15540", accountDesc: "15540 - F/A - Furniture, Fixtures & Computer Equipment", accountName: "F/A - Furniture, Fixtures & Computer Equipment", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15541", accountDesc: "15541 - Furniture, Fixtures and Equipment Step Up", accountName: "Furniture, Fixtures and Equipment Step Up", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15542", accountDesc: "15542 - F/A - Computer Equipment & Software", accountName: "F/A - Computer Equipment & Software", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15543", accountDesc: "15543 - F/A - Office Equipment", accountName: "F/A - Office Equipment", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15545", accountDesc: "15545 - F/A - Vehicles", accountName: "F/A - Vehicles", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15550", accountDesc: "15550 - F/A - Lighting Fixtures/Ceiling Fans", accountName: "F/A - Lighting Fixtures/Ceiling Fans", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15555", accountDesc: "15555 - F/A - Window Treatments", accountName: "F/A - Window Treatments", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15557", accountDesc: "15557 - F/A - Doors & Cabinets", accountName: "F/A - Doors & Cabinets", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15560", accountDesc: "15560 - F/A - Signage", accountName: "F/A - Signage", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15561", accountDesc: "15561 - F/A - Maintenance Shop", accountName: "F/A - Maintenance Shop", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15562", accountDesc: "15562 - F/A - Clubhouse/Office", accountName: "F/A - Clubhouse/Office", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15563", accountDesc: "15563 - F/A - Clubhouse Improvements", accountName: "F/A - Clubhouse Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15564", accountDesc: "15564 - F/A - Sports Courts", accountName: "F/A - Sports Courts", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15565", accountDesc: "15565 - F/A - Fitness Center Improvements", accountName: "F/A - Fitness Center Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15566", accountDesc: "15566 - F/A - Pool Improvements", accountName: "F/A - Pool Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "48990", accountDesc: "48990 - Bad Debt - Other", accountName: "Bad Debt - Other", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "15568", accountDesc: "15568 - F/A - Furniture - Outdoor", accountName: "F/A - Furniture - Outdoor", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15570", accountDesc: "15570 - F/A - Gutters", accountName: "F/A - Gutters", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15575", accountDesc: "15575 - F/A - Roof", accountName: "F/A - Roof", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15580", accountDesc: "15580 - F/A - Elevator", accountName: "F/A - Elevator", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15585", accountDesc: "15585 - F/A - Fire/Security System", accountName: "F/A - Fire/Security System", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15590", accountDesc: "15590 - F/A - Electrical", accountName: "F/A - Electrical", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15595", accountDesc: "15595 - F/A - Remediation", accountName: "F/A - Remediation", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15600", accountDesc: "15600 - F/A - Landscape/Drainage/Pool", accountName: "F/A - Landscape/Drainage/Pool", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15610", accountDesc: "15610 - F/A - Ponds/Fountains/Drainage", accountName: "F/A - Ponds/Fountains/Drainage", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15615", accountDesc: "15615 - F/A - Pool Furniture/Equipment", accountName: "F/A - Pool Furniture/Equipment", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15620", accountDesc: "15620 - F/A - Irrigation", accountName: "F/A - Irrigation", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15625", accountDesc: "15625 - F/A - Fencing/Controlled Gate", accountName: "F/A - Fencing/Controlled Gate", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15630", accountDesc: "15630 - F/A - Mailbox", accountName: "F/A - Mailbox", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15633", accountDesc: "15633 - F/A - Equipment", accountName: "F/A - Equipment", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15635", accountDesc: "15635 - F/A - Windows/Caulking", accountName: "F/A - Windows/Caulking", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15640", accountDesc: "15640 - F/A - Interior Plumbing Replacement", accountName: "F/A - Interior Plumbing Replacement", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15643", accountDesc: "15643 - F/A - Facade", accountName: "F/A - Facade", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15644", accountDesc: "15644 - F/A - Exterior Painting", accountName: "F/A - Exterior Painting", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15645", accountDesc: "15645 - F/A - Interior Electrical/Light", accountName: "F/A - Interior Electrical/Light", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15648", accountDesc: "15648 - F/A - Garage/Carport", accountName: "F/A - Garage/Carport", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15650", accountDesc: "15650 - F/A - Sidewalk/Curbing/Parking Lot", accountName: "F/A - Sidewalk/Curbing/Parking Lot", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15653", accountDesc: "15653 - F/A - Concrete & Masonry", accountName: "F/A - Concrete & Masonry", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15655", accountDesc: "15655 - F/A - Sealcoat/Striping", accountName: "F/A - Sealcoat/Striping", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15660", accountDesc: "15660 - F/A - Structural", accountName: "F/A - Structural", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15661", accountDesc: "15661 - F/A - Outdoor Amenity Improvements", accountName: "F/A - Outdoor Amenity Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15662", accountDesc: "15662 - F/A - Transition/Supervision", accountName: "F/A - Transition/Supervision", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15665", accountDesc: "15665 - F/A - Plumbing", accountName: "F/A - Plumbing", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15670", accountDesc: "15670 - F/A - Decking/Balcony", accountName: "F/A - Decking/Balcony", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15675", accountDesc: "15675 - F/A - Exterior Building Improvements", accountName: "F/A - Exterior Building Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15676", accountDesc: "15676 - F/A - Interior Building Improvements", accountName: "F/A - Interior Building Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15681", accountDesc: "15681 - F/A - Common Area", accountName: "F/A - Common Area", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15682", accountDesc: "15682 - F/A - Playground", accountName: "F/A - Playground", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15683", accountDesc: "15683 - F/A - Common Area Lighting", accountName: "F/A - Common Area Lighting", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15685", accountDesc: "15685 - F/A - Pet Parks", accountName: "F/A - Pet Parks", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15687", accountDesc: "15687 - F/A -Architecture-Engineering", accountName: "F/A -Architecture-Engineering", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15690", accountDesc: "15690 - F/A - Other Replacements", accountName: "F/A - Other Replacements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15695", accountDesc: "15695 - F/A - Start-up Costs", accountName: "F/A - Start-up Costs", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15698", accountDesc: "15698 - F/A - Cap Ex Contingency", accountName: "F/A - Cap Ex Contingency", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15699", accountDesc: "15699 - F/A - Other Cap Ex", accountName: "F/A - Other Cap Ex", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15700", accountDesc: "15700 - Reno - Unit Interiors", accountName: "Reno - Unit Interiors", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15705", accountDesc: "15705 - Reno - Carpet", accountName: "Reno - Carpet", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15710", accountDesc: "15710 - Reno - Amenities", accountName: "Reno - Amenities", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15715", accountDesc: "15715 - Reno - Vinyl/Tile", accountName: "Reno - Vinyl/Tile", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15725", accountDesc: "15725 - Reno - Exterior Building Improvements", accountName: "Reno - Exterior Building Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15730", accountDesc: "15730 - Reno - Washer/Dryer", accountName: "Reno - Washer/Dryer", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15735", accountDesc: "15735 - Reno - Common Areas", accountName: "Reno - Common Areas", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15750", accountDesc: "15750 - Reno - Landscape/Drainage/Pool", accountName: "Reno - Landscape/Drainage/Pool", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "15765", accountDesc: "15765 - Reno - Fencing/Controlled Gate", accountName: "Reno - Fencing/Controlled Gate", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15780", accountDesc: "15780 - Reno - Sidewalk/Curbing/Parking Lot", accountName: "Reno - Sidewalk/Curbing/Parking Lot", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15800", accountDesc: "15800 - Reno - Placed-in-Service", accountName: "Reno - Placed-in-Service", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15805", accountDesc: "15805 - Reno - Construction Fees", accountName: "Reno - Construction Fees", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15810", accountDesc: "15810 - Reno - Sustainability", accountName: "Reno - Sustainability", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15910", accountDesc: "15910 - Accumulated Depreciation - Buildings", accountName: "Accumulated Depreciation - Buildings", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "71400", accountDesc: "71400 - Ground Lease", accountName: "Ground Lease", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "15920", accountDesc: "15920 - Accumulated Depreciation - Building Improvements", accountName: "Accumulated Depreciation - Building Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15930", accountDesc: "15930 - Accumulated Depreciation - FF&E", accountName: "Accumulated Depreciation - FF&E", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Detail" },
        { accountCode: "15940", accountDesc: "15940 - Accumulated Depreciation - Land Improvements", accountName: "Accumulated Depreciation - Land Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15990", accountDesc: "15990 - Depreciation - Buildings - Step Up", accountName: "Depreciation - Buildings - Step Up", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15945", accountDesc: "15945 - Accumulated Depreciation - Tenant Improvements", accountName: "Accumulated Depreciation - Tenant Improvements", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Formula" },
        { accountCode: "15950", accountDesc: "15950 - Accumulated Depreciation", accountName: "Accumulated Depreciation", typeName: "Assets", headName: "Current Assets", groupName: "Fixed Assets", methodName: "Input Line(s)" },
        { accountCode: "16100", accountDesc: "16100 - Deferred Loan Costs", accountName: "Deferred Loan Costs", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16101", accountDesc: "16101 - WIP - Development Period Interest", accountName: "WIP - Development Period Interest", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16105", accountDesc: "16105 - WIP - Contra", accountName: "WIP - Contra", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16250", accountDesc: "16250 - Interest Rate Hedge", accountName: "Interest Rate Hedge", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16500", accountDesc: "16500 - Other Assets", accountName: "Other Assets", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16595", accountDesc: "16595 - Maintenance Startup Supplies", accountName: "Maintenance Startup Supplies", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16600", accountDesc: "16600 - Finance Lease Asset", accountName: "Finance Lease Asset", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16645", accountDesc: "16645 - Collateral Materials", accountName: "Collateral Materials", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16700", accountDesc: "16700 - Other Fees", accountName: "Other Fees", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16701", accountDesc: "16701 - Unrealized Gain/Loss on Interest Rate Cap", accountName: "Unrealized Gain/Loss on Interest Rate Cap", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16720", accountDesc: "16720 - Realized Gain/Loss on Interest Rate Cap", accountName: "Realized Gain/Loss on Interest Rate Cap", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16800", accountDesc: "16800 - Organization Costs", accountName: "Organization Costs", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16830", accountDesc: "16830 - In Place Leases", accountName: "In Place Leases", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16835", accountDesc: "16835 - Below Market Leases", accountName: "Below Market Leases", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16840", accountDesc: "16840 - Leasing Commissions", accountName: "Leasing Commissions", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16845", accountDesc: "16845 - Legal and Marketing Lease Up Costs", accountName: "Legal and Marketing Lease Up Costs", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "16850", accountDesc: "16850 - Accumulated Amortization", accountName: "Accumulated Amortization", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16860", accountDesc: "16860 - Accumulated Amortization - Legal", accountName: "Accumulated Amortization - Legal", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "16870", accountDesc: "16870 - Accumulated Amortization - Organization Costs", accountName: "Accumulated Amortization - Organization Costs", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16910", accountDesc: "16910 - Accumulated Amortization - Loan Costs", accountName: "Accumulated Amortization - Loan Costs", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16960", accountDesc: "16960 - Accumulated Amortization - Below Market Leases", accountName: "Accumulated Amortization - Below Market Leases", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16970", accountDesc: "16970 - Accumulated Amortization - Finance Lease", accountName: "Accumulated Amortization - Finance Lease", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Formula" },
        { accountCode: "16980", accountDesc: "16980 - Interest Rate Cap", accountName: "Interest Rate Cap", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Detail" },
        { accountCode: "17100", accountDesc: "17100 - Intercompany/Operating Deficits", accountName: "Intercompany/Operating Deficits", typeName: "Assets", headName: "Current Assets", groupName: "Other Assets", methodName: "Input Line(s)" },
        { accountCode: "18105", accountDesc: "18105 - Investment in LP", accountName: "Investment in LP", typeName: "Assets", headName: "Current Assets", groupName: "Other Current Assets", methodName: "Input Line(s)" },
        { accountCode: "18100", accountDesc: "18100 - Investment in Briarcliff Bliss", accountName: "Investment in Briarcliff Bliss", typeName: "Assets", headName: "Current Assets", groupName: "Other Current Assets", methodName: "Detail" },
        { accountCode: "20100", accountDesc: "20100 - Accounts Payable", accountName: "Accounts Payable", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Input Line(s)" },
        { accountCode: "20130", accountDesc: "20130 - Accounts Payable Other", accountName: "Accounts Payable Other", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "20135", accountDesc: "20135 - Accounts Payable Other 2", accountName: "Accounts Payable Other 2", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "20140", accountDesc: "20140 - Accounts Payable Construction", accountName: "Accounts Payable Construction", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "20150", accountDesc: "20150 - Accounts Payable Prior Management", accountName: "Accounts Payable Prior Management", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "20160", accountDesc: "20160 - Tax Payable - Sales Tax", accountName: "Tax Payable - Sales Tax", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "20170", accountDesc: "20170 - [SYSTEM] Purchases Clearing", accountName: "[SYSTEM] Purchases Clearing", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "20200", accountDesc: "20200 - [SYSTEM] Inter-Company Payable", accountName: "[SYSTEM] Inter-Company Payable", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Input Line(s)" },
        { accountCode: "21200", accountDesc: "21200 - Accrued Expenses - Operating", accountName: "Accrued Expenses - Operating", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Formula" },
        { accountCode: "21210", accountDesc: "21210 - Accrued Payroll", accountName: "Accrued Payroll", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Formula" },
        { accountCode: "21220", accountDesc: "21220 - Accrued Charity Contributions", accountName: "Accrued Charity Contributions", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Formula" },
        { accountCode: "21250", accountDesc: "21250 - Accrued Management Fee", accountName: "Accrued Management Fee", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Formula" },
        { accountCode: "21275", accountDesc: "21275 - Accrued Insurance", accountName: "Accrued Insurance", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Formula" },
        { accountCode: "21300", accountDesc: "21300 - Accrued Property Taxes", accountName: "Accrued Property Taxes", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "21350", accountDesc: "21350 - Accrued Other Expenses", accountName: "Accrued Other Expenses", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Accounts Payable and Accrued Expenses", methodName: "Detail" },
        { accountCode: "22400", accountDesc: "22400 - Security Deposit Escrow", accountName: "Security Deposit Escrow", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "22450", accountDesc: "22450 - Other Resident Deposits", accountName: "Other Resident Deposits", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "22495", accountDesc: "22495 - Security Deposit Refunds", accountName: "Security Deposit Refunds", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "22500", accountDesc: "22500 - Prepaid Rent Liability", accountName: "Prepaid Rent Liability", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "22510", accountDesc: "22510 - Insurance Recoveries", accountName: "Insurance Recoveries", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "22515", accountDesc: "22515 - Deposits In Transit", accountName: "Deposits In Transit", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "22550", accountDesc: "22550 - Deferred Rent", accountName: "Deferred Rent", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "22600", accountDesc: "22600 - [SYSTEM] Unclaimed Property", accountName: "[SYSTEM] Unclaimed Property", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23000", accountDesc: "23000 - Foreign Tax Liability - Investors", accountName: "Foreign Tax Liability - Investors", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23050", accountDesc: "23050 - Due To/From", accountName: "Due To/From", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23100", accountDesc: "23100 - Due to Related Party", accountName: "Due to Related Party", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23165", accountDesc: "23165 - Due to/from The Amber", accountName: "Due to/from The Amber", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23164", accountDesc: "23164 - Due to/from BPMS", accountName: "Due to/from BPMS", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23163", accountDesc: "23163 - Due to/from Pinnacle", accountName: "Due to/from Pinnacle", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23162", accountDesc: "23162 - Due to/from EastBeachBMIT", accountName: "Due to/from EastBeachBMIT", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23161", accountDesc: "23161 - Due to/from CedarBroaBMIT", accountName: "Due to/from CedarBroaBMIT", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23160", accountDesc: "23160 - Due to/from Vida East", accountName: "Due to/from Vida East", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23159", accountDesc: "23159 - Due to/from Shared Svcs", accountName: "Due to/from Shared Svcs", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23158", accountDesc: "23158 - Due to/from Encore Apts", accountName: "Due to/from Encore Apts", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23157", accountDesc: "23157 - Due to/from BPropertyCo", accountName: "Due to/from BPropertyCo", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23156", accountDesc: "23156 - Due to/from Palmers Crk", accountName: "Due to/from Palmers Crk", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23155", accountDesc: "23155 - Due to/from Rockwood", accountName: "Due to/from Rockwood", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23154", accountDesc: "23154 - Due to/from Shockoe Commo", accountName: "Due to/from Shockoe Commo", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23153", accountDesc: "23153 - Due to/from Am Tobacco", accountName: "Due to/from Am Tobacco", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23152", accountDesc: "23152 - Due to/from Shockhoe Ctr", accountName: "Due to/from Shockhoe Ctr", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23151", accountDesc: "23151 - Due to/from Dill Building", accountName: "Due to/from Dill Building", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23150", accountDesc: "23150 - Due to/from The Edge", accountName: "Due to/from The Edge", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23110", accountDesc: "23110 - Due to Related Party 2", accountName: "Due to Related Party 2", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23200", accountDesc: "23200 - Loan Payable", accountName: "Loan Payable", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23210", accountDesc: "23210 - Loan Payable - 2nd", accountName: "Loan Payable - 2nd", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Input Line(s)" },
        { accountCode: "23220", accountDesc: "23220 - Loan Payable - 3rd", accountName: "Loan Payable - 3rd", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23290", accountDesc: "23290 - Interest Rate Buydown", accountName: "Interest Rate Buydown", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "23300", accountDesc: "23300 - Due From/To Suspense", accountName: "Due From/To Suspense", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Formula" },
        { accountCode: "23500", accountDesc: "23500 - Retainage", accountName: "Retainage", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Other Liabilities", methodName: "Detail" },
        { accountCode: "25100", accountDesc: "25100 - Loan - 1st Mortgage", accountName: "Loan - 1st Mortgage", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Formula" },
        { accountCode: "25120", accountDesc: "25120 - Loan - 2nd Mortgage", accountName: "Loan - 2nd Mortgage", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Formula" },
        { accountCode: "25140", accountDesc: "25140 - Debt Issuance Costs", accountName: "Debt Issuance Costs", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Detail" },
        { accountCode: "25142", accountDesc: "25142 - Accum Amort Debt Iss - Bond Obl", accountName: "Accum Amort Debt Iss - Bond Obl", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Input Line(s)" },
        { accountCode: "25150", accountDesc: "25150 - Loan Accrued Interest", accountName: "Loan Accrued Interest", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Detail" },
        { accountCode: "27130", accountDesc: "27130 - Other LT Liability", accountName: "Other LT Liability", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Input Line(s)" },
        { accountCode: "27120", accountDesc: "27120 - Finance Lease LT Liability", accountName: "Finance Lease LT Liability", typeName: "Liabilities", headName: "Current Liabilities", groupName: "Long Term Liabilities", methodName: "Formula" },
        { accountCode: "30140", accountDesc: "30140 - Gain / (Loss)", accountName: "Gain / (Loss)", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "30150", accountDesc: "30150 - Transfer to Owner Account", accountName: "Transfer to Owner Account", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Input Line(s)" },
        { accountCode: "31100", accountDesc: "31100 - Capital Contributions", accountName: "Capital Contributions", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "31200", accountDesc: "31200 - Capital Contributions 2", accountName: "Capital Contributions 2", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "31300", accountDesc: "31300 - Capital Contributions 3", accountName: "Capital Contributions 3", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "31400", accountDesc: "31400 - Capital Contributions 4", accountName: "Capital Contributions 4", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Detail" },
        { accountCode: "31500", accountDesc: "31500 - Capital Contributions 5", accountName: "Capital Contributions 5", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "31900", accountDesc: "31900 - Funds - Exchange", accountName: "Funds - Exchange", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Detail" },
        { accountCode: "32100", accountDesc: "32100 - Capital Distributions", accountName: "Capital Distributions", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "32200", accountDesc: "32200 - Capital Distributions 2", accountName: "Capital Distributions 2", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "32300", accountDesc: "32300 - Capital Distributions 3", accountName: "Capital Distributions 3", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "32400", accountDesc: "32400 - Capital Distributions 4", accountName: "Capital Distributions 4", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "32500", accountDesc: "32500 - Capital Distributions 5", accountName: "Capital Distributions 5", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Input Line(s)" },
        { accountCode: "33100", accountDesc: "33100 - Basis Change", accountName: "Basis Change", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "38100", accountDesc: "38100 - Retained Earnings/Partners Equity", accountName: "Retained Earnings/Partners Equity", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Formula" },
        { accountCode: "39100", accountDesc: "39100 - Current Year Income/Loss", accountName: "Current Year Income/Loss", typeName: "Liabilities", headName: "Equity", groupName: "Partner's Equity/Retained Earnings", methodName: "Detail" },
        { accountCode: "41100", accountDesc: "41100 - Gross Potential Rents", accountName: "Gross Potential Rents", typeName: "Liabilities", headName: "Income", groupName: "Gross Potential Rents", methodName: "Detail" },
        { accountCode: "41200", accountDesc: "41200 - Gain (Loss) to Lease", accountName: "Gain (Loss) to Lease", typeName: "Liabilities", headName: "Income", groupName: "Gross Potential Rents", methodName: "Formula" },
        { accountCode: "41250", accountDesc: "41250 - [SYSTEM] Gain On Lease DO NOT USE", accountName: "[SYSTEM] Gain On Lease DO NOT USE", typeName: "Liabilities", headName: "Income", groupName: "Gross Potential Rents", methodName: "Input Line(s)" },
        { accountCode: "41400", accountDesc: "41400 - Rent - Retail", accountName: "Rent - Retail", typeName: "Liabilities", headName: "Income", groupName: "Gross Potential Rents", methodName: "Input Line(s)" },
        { accountCode: "42200", accountDesc: "42200 - Rent Concessions/Incentives", accountName: "Rent Concessions/Incentives", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "42300", accountDesc: "42300 - Non-Income Units /Model/Office", accountName: "Non-Income Units /Model/Office", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "42340", accountDesc: "42340 - Preferred Employer Discount", accountName: "Preferred Employer Discount", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "42350", accountDesc: "42350 - Employee Units", accountName: "Employee Units", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "42375", accountDesc: "42375 - Courtesy Officer Units", accountName: "Courtesy Officer Units", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Detail" },
        { accountCode: "42380", accountDesc: "42380 - Corporate Units", accountName: "Corporate Units", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "42381", accountDesc: "42381 - Corporate Units 2", accountName: "Corporate Units 2", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "42382", accountDesc: "42382 - Corporate Units 3", accountName: "Corporate Units 3", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "42400", accountDesc: "42400 - Vacancy Loss", accountName: "Vacancy Loss", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "42450", accountDesc: "42450 - Vacancy Loss - Down Units", accountName: "Vacancy Loss - Down Units", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "42455", accountDesc: "42455 - Vacancy Loss - Rehab Units", accountName: "Vacancy Loss - Rehab Units", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Detail" },
        { accountCode: "42460", accountDesc: "42460 - Vacancy Loss - Guest Suite", accountName: "Vacancy Loss - Guest Suite", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "42500", accountDesc: "42500 - Coffee Revenue Reclass", accountName: "Coffee Revenue Reclass", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "43100", accountDesc: "43100 - Bad Debt Expense", accountName: "Bad Debt Expense", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Detail" },
        { accountCode: "43105", accountDesc: "43105 - Administrative Write-Off", accountName: "Administrative Write-Off", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Detail" },
        { accountCode: "43125", accountDesc: "43125 - Bad Debt Expense - Retail", accountName: "Bad Debt Expense - Retail", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "43150", accountDesc: "43150 - Bad Debt Allowance", accountName: "Bad Debt Allowance", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "43200", accountDesc: "43200 - Bad Debt Collections", accountName: "Bad Debt Collections", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Formula" },
        { accountCode: "43440", accountDesc: "43440 - Income Loss Recovery - Insurance", accountName: "Income Loss Recovery - Insurance", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "43420", accountDesc: "43420 - Prior Months Rent Collected", accountName: "Prior Months Rent Collected", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Detail" },
        { accountCode: "43415", accountDesc: "43415 - Rent Receivable Offset", accountName: "Rent Receivable Offset", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "43410", accountDesc: "43410 - Current Month Rent Uncollected", accountName: "Current Month Rent Uncollected", typeName: "Liabilities", headName: "Income", groupName: "Rental Income Adjustments", methodName: "Input Line(s)" },
        { accountCode: "44050", accountDesc: "44050 - Access Gate Remotes", accountName: "Access Gate Remotes", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44100", accountDesc: "44100 - Admin Fees", accountName: "Admin Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44150", accountDesc: "44150 - Application Fees", accountName: "Application Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44175", accountDesc: "44175 - Convenience Fees", accountName: "Convenience Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44200", accountDesc: "44200 - Cable Income", accountName: "Cable Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44205", accountDesc: "44205 - Cable Royalty", accountName: "Cable Royalty", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44210", accountDesc: "44210 - Revenue Sharing", accountName: "Revenue Sharing", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44225", accountDesc: "44225 - Telephone Income", accountName: "Telephone Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44250", accountDesc: "44250 - Cancellation/Termination Fees", accountName: "Cancellation/Termination Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44260", accountDesc: "44260 - Concession Chargeback/Credit Loss", accountName: "Concession Chargeback/Credit Loss", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44265", accountDesc: "44265 - Workspaces", accountName: "Workspaces", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44275", accountDesc: "44275 - CAM Charges", accountName: "CAM Charges", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44276", accountDesc: "44276 - CAM - Renters Insurance", accountName: "CAM - Renters Insurance", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44277", accountDesc: "44277 - CAM - Taxes", accountName: "CAM - Taxes", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44280", accountDesc: "44280 - Commercial Income", accountName: "Commercial Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44284", accountDesc: "44284 - SL Rent Revenue", accountName: "SL Rent Revenue", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44285", accountDesc: "44285 - Guest Suite", accountName: "Guest Suite", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44300", accountDesc: "44300 - Clubhouse Rental", accountName: "Clubhouse Rental", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44350", accountDesc: "44350 - Damage/Cleaning Fees", accountName: "Damage/Cleaning Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44375", accountDesc: "44375 - Equipment/Furniture Rental", accountName: "Equipment/Furniture Rental", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44380", accountDesc: "44380 - Corporate/Guest Suite Utilities", accountName: "Corporate/Guest Suite Utilities", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45125", accountDesc: "45125 - Washer/Dryer Income", accountName: "Washer/Dryer Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44382", accountDesc: "44382 - Corporate/Guest Suite Cleaning", accountName: "Corporate/Guest Suite Cleaning", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44385", accountDesc: "44385 - Corporate Furniture", accountName: "Corporate Furniture", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44400", accountDesc: "44400 - Forfeited Deposits", accountName: "Forfeited Deposits", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44450", accountDesc: "44450 - Garage Rental", accountName: "Garage Rental", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44500", accountDesc: "44500 - Late Charges", accountName: "Late Charges", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44550", accountDesc: "44550 - Laundry Income", accountName: "Laundry Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44575", accountDesc: "44575 - Legal/Eviction Fees", accountName: "Legal/Eviction Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44580", accountDesc: "44580 - Locks/Keys Income", accountName: "Locks/Keys Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44600", accountDesc: "44600 - Month-To-Month Fees", accountName: "Month-To-Month Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44650", accountDesc: "44650 - NSF Fees", accountName: "NSF Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44675", accountDesc: "44675 - Violation Fees (trash)", accountName: "Violation Fees (trash)", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44700", accountDesc: "44700 - Tenant Improvements", accountName: "Tenant Improvements", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44705", accountDesc: "44705 - Insurance Non Comply Fee", accountName: "Insurance Non Comply Fee", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44706", accountDesc: "44706 - Insurance Non Comply Expense", accountName: "Insurance Non Comply Expense", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44710", accountDesc: "44710 - Package Locker Income", accountName: "Package Locker Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44715", accountDesc: "44715 - Smart Home Income", accountName: "Smart Home Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44725", accountDesc: "44725 - Parking Income", accountName: "Parking Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44727", accountDesc: "44727 - Parking Lot Monitoring Expense", accountName: "Parking Lot Monitoring Expense", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44750", accountDesc: "44750 - Pet Rent", accountName: "Pet Rent", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "44775", accountDesc: "44775 - Pet Fee - Nonrefundable", accountName: "Pet Fee - Nonrefundable", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44776", accountDesc: "44776 - Pet Center Income", accountName: "Pet Center Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44777", accountDesc: "44777 - Pet Center Expense", accountName: "Pet Center Expense", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44800", accountDesc: "44800 - Prepaid Rent", accountName: "Prepaid Rent", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44850", accountDesc: "44850 - Storage Unit Rental", accountName: "Storage Unit Rental", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44855", accountDesc: "44855 - Bike Parking/Storage", accountName: "Bike Parking/Storage", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44900", accountDesc: "44900 - Internet Income", accountName: "Internet Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "44905", accountDesc: "44905 - Internet Expense", accountName: "Internet Expense", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "44950", accountDesc: "44950 - Transfer Fees", accountName: "Transfer Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45000", accountDesc: "45000 - Trash Income", accountName: "Trash Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45025", accountDesc: "45025 - Valet Trash Income", accountName: "Valet Trash Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45026", accountDesc: "45026 - Valet Trash Expense", accountName: "Valet Trash Expense", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "45050", accountDesc: "45050 - Vending Income", accountName: "Vending Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "45052", accountDesc: "45052 - Sundry Supplies", accountName: "Sundry Supplies", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45055", accountDesc: "45055 - Coffee Shop Revenue", accountName: "Coffee Shop Revenue", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45057", accountDesc: "45057 - Coffee Shop Expenses", accountName: "Coffee Shop Expenses", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45100", accountDesc: "45100 - Water Income", accountName: "Water Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45150", accountDesc: "45150 - Resident Liability Ins. Inc", accountName: "Resident Liability Ins. Inc", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45200", accountDesc: "45200 - Gas Income", accountName: "Gas Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45250", accountDesc: "45250 - Short Term Lease Fee", accountName: "Short Term Lease Fee", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45300", accountDesc: "45300 - Pest Control Income", accountName: "Pest Control Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45310", accountDesc: "45310 - Cable/Internet Income", accountName: "Cable/Internet Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45400", accountDesc: "45400 - Electric Income", accountName: "Electric Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45550", accountDesc: "45550 - Utility Reimbursement Inc", accountName: "Utility Reimbursement Inc", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "45600", accountDesc: "45600 - Utility Billing Fee Income", accountName: "Utility Billing Fee Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "45700", accountDesc: "45700 - Amenity Fees", accountName: "Amenity Fees", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "45725", accountDesc: "45725 - Renter's Ins - Forced Placement", accountName: "Renter's Ins - Forced Placement", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45750", accountDesc: "45750 - Renter's Ins - Noncompliance Fee", accountName: "Renter's Ins - Noncompliance Fee", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "45705", accountDesc: "45705 - Concierge Income", accountName: "Concierge Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45708", accountDesc: "45708 - EV Charge Income", accountName: "EV Charge Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45710", accountDesc: "45710 - RentPlus Suite", accountName: "RentPlus Suite", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45751", accountDesc: "45751 - Building Facilities Fee", accountName: "Building Facilities Fee", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "45752", accountDesc: "45752 - Concierge Services", accountName: "Concierge Services", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "45755", accountDesc: "45755 - Landscape Maintenance Fee Income", accountName: "Landscape Maintenance Fee Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "46000", accountDesc: "46000 - Interest Income", accountName: "Interest Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "48800", accountDesc: "48800 - Miscellaneous Income", accountName: "Miscellaneous Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "48801", accountDesc: "48801 - Miscellaneous Income - Commercial", accountName: "Miscellaneous Income - Commercial", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "48991", accountDesc: "48991 - Bad Debt - Commercial", accountName: "Bad Debt - Commercial", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Detail" },
        { accountCode: "48995", accountDesc: "48995 - Bad Debt Collections - Other", accountName: "Bad Debt Collections - Other", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "49998", accountDesc: "49998 - [SYSTEM] Management Fee Income", accountName: "[SYSTEM] Management Fee Income", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Input Line(s)" },
        { accountCode: "49999", accountDesc: "49999 - [SYSTEM] Beginning Balance", accountName: "[SYSTEM] Beginning Balance", typeName: "Liabilities", headName: "Income", groupName: "Other Income", methodName: "Formula" },
        { accountCode: "61010", accountDesc: "61010 - Property Manager Salary", accountName: "Property Manager Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61015", accountDesc: "61015 - Property Manager Bonus", accountName: "Property Manager Bonus", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61020", accountDesc: "61020 - Assistant Manager Salary", accountName: "Assistant Manager Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61025", accountDesc: "61025 - Assistant Manager Bonus", accountName: "Assistant Manager Bonus", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61030", accountDesc: "61030 - Leasing Associate Salary", accountName: "Leasing Associate Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61035", accountDesc: "61035 - Leasing Commission", accountName: "Leasing Commission", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61036", accountDesc: "61036 - Leasing Associate Bonus", accountName: "Leasing Associate Bonus", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61038", accountDesc: "61038 - Centralized Salary", accountName: "Centralized Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61040", accountDesc: "61040 - Maintenance Supervisor Salary", accountName: "Maintenance Supervisor Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61045", accountDesc: "61045 - Maintenance Assistant Salary", accountName: "Maintenance Assistant Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61049", accountDesc: "61049 - Maintenance Bonus", accountName: "Maintenance Bonus", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61050", accountDesc: "61050 - Grounds Person Salary", accountName: "Grounds Person Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61060", accountDesc: "61060 - Housekeeper Salary", accountName: "Housekeeper Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61070", accountDesc: "61070 - Other Salary", accountName: "Other Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61075", accountDesc: "61075 - On Call Pay", accountName: "On Call Pay", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61085", accountDesc: "61085 - Pet Center Manager Salary", accountName: "Pet Center Manager Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61086", accountDesc: "61086 - Pet Center Attendant Salary", accountName: "Pet Center Attendant Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61090", accountDesc: "61090 - Barista Salary", accountName: "Barista Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61093", accountDesc: "61093 - Clubhouse Attendants Salary", accountName: "Clubhouse Attendants Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61095", accountDesc: "61095 - Social Director Salary", accountName: "Social Director Salary", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61100", accountDesc: "61100 - Taxes - FUTA/FICA/SUTA", accountName: "Taxes - FUTA/FICA/SUTA", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61200", accountDesc: "61200 - Group Insurance", accountName: "Group Insurance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61210", accountDesc: "61210 - Uniform Expense", accountName: "Uniform Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61290", accountDesc: "61290 - Incentive Pay", accountName: "Incentive Pay", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61300", accountDesc: "61300 - 401(k) Match", accountName: "401(k) Match", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61310", accountDesc: "61310 - Employee Units", accountName: "Employee Units", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61320", accountDesc: "61320 - Temp Labor", accountName: "Temp Labor", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "61325", accountDesc: "61325 - Corporate Support", accountName: "Corporate Support", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61400", accountDesc: "61400 - Workers Compensation Insurance", accountName: "Workers Compensation Insurance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Detail" },
        { accountCode: "61500", accountDesc: "61500 - Payroll/Benefit Service Fees", accountName: "Payroll/Benefit Service Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Input Line(s)" },
        { accountCode: "61600", accountDesc: "61600 - Employee Screening/Recruiting", accountName: "Employee Screening/Recruiting", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Property Payroll", methodName: "Formula" },
        { accountCode: "62100", accountDesc: "62100 - Collateral Materials", accountName: "Collateral Materials", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Detail" },
        { accountCode: "62125", accountDesc: "62125 - Concierge Services", accountName: "Concierge Services", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62150", accountDesc: "62150 - Direct Mail", accountName: "Direct Mail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62200", accountDesc: "62200 - Locators/Online Locating Services", accountName: "Locators/Online Locating Services", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Detail" },
        { accountCode: "62250", accountDesc: "62250 - Furniture Rental", accountName: "Furniture Rental", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62275", accountDesc: "62275 - SEO/PPC", accountName: "SEO/PPC", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Detail" },
        { accountCode: "62300", accountDesc: "62300 - Internet Listing Services", accountName: "Internet Listing Services", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62325", accountDesc: "62325 - Social Media Advertising", accountName: "Social Media Advertising", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Detail" },
        { accountCode: "62350", accountDesc: "62350 - Public Relations & Media", accountName: "Public Relations & Media", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62400", accountDesc: "62400 - Model Expenses", accountName: "Model Expenses", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62500", accountDesc: "62500 - Outdoor Advertising", accountName: "Outdoor Advertising", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62550", accountDesc: "62550 - Promotional Events", accountName: "Promotional Events", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62600", accountDesc: "62600 - Prospect Refreshments", accountName: "Prospect Refreshments", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62650", accountDesc: "62650 - Resident Incentives", accountName: "Resident Incentives", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Detail" },
        { accountCode: "62700", accountDesc: "62700 - Resident Referral", accountName: "Resident Referral", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62750", accountDesc: "62750 - Resident Retention/Resident Programming", accountName: "Resident Retention/Resident Programming", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62800", accountDesc: "62800 - Seasonal Decorations", accountName: "Seasonal Decorations", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62825", accountDesc: "62825 - Move-in Gifts", accountName: "Move-in Gifts", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Detail" },
        { accountCode: "62850", accountDesc: "62850 - Specialty Items", accountName: "Specialty Items", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Formula" },
        { accountCode: "62900", accountDesc: "62900 - Temporary Signage", accountName: "Temporary Signage", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62950", accountDesc: "62950 - Advertising/Marketing - Retail", accountName: "Advertising/Marketing - Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62975", accountDesc: "62975 - Marketing Software", accountName: "Marketing Software", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "62990", accountDesc: "62990 - Other Advertising/Marketing", accountName: "Other Advertising/Marketing", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Advertising and Marketing", methodName: "Input Line(s)" },
        { accountCode: "63020", accountDesc: "63020 - Admin/Accounting Fees", accountName: "Admin/Accounting Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "63050", accountDesc: "63050 - Answering Service", accountName: "Answering Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "63100", accountDesc: "63100 - Associate Recognition", accountName: "Associate Recognition", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "63150", accountDesc: "63150 - Associate Travel", accountName: "Associate Travel", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "63190", accountDesc: "63190 - Association Dues", accountName: "Association Dues", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63200", accountDesc: "63200 - Bank Charges/Late Fees", accountName: "Bank Charges/Late Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63225", accountDesc: "63225 - Billing Services", accountName: "Billing Services", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63275", accountDesc: "63275 - HOA Expenses", accountName: "HOA Expenses", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "63300", accountDesc: "63300 - Computer Support/Software", accountName: "Computer Support/Software", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63305", accountDesc: "63305 - Revenue Management Software", accountName: "Revenue Management Software", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63310", accountDesc: "63310 - Computer Maintenance/Support", accountName: "Computer Maintenance/Support", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63320", accountDesc: "63320 - Computer Hardware", accountName: "Computer Hardware", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63330", accountDesc: "63330 - Reputation Management", accountName: "Reputation Management", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63350", accountDesc: "63350 - Consulting Fees", accountName: "Consulting Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63400", accountDesc: "63400 - Copier/Supplies", accountName: "Copier/Supplies", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63405", accountDesc: "63405 - Copier Contract", accountName: "Copier Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63450", accountDesc: "63450 - Credit Bureau Fees", accountName: "Credit Bureau Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63500", accountDesc: "63500 - Delivery & Courier Fees", accountName: "Delivery & Courier Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63550", accountDesc: "63550 - Dues and Subscriptions", accountName: "Dues and Subscriptions", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63600", accountDesc: "63600 - Employment Ads", accountName: "Employment Ads", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63650", accountDesc: "63650 - Equipment Rental and Leasing", accountName: "Equipment Rental and Leasing", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63700", accountDesc: "63700 - Forms", accountName: "Forms", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63750", accountDesc: "63750 - Furniture/Equipment Purchases", accountName: "Furniture/Equipment Purchases", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "63850", accountDesc: "63850 - Legal Costs/Evictions", accountName: "Legal Costs/Evictions", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63860", accountDesc: "63860 - Legal - Other", accountName: "Legal - Other", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "63900", accountDesc: "63900 - Meals and Entertainment", accountName: "Meals and Entertainment", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "63950", accountDesc: "63950 - Mobile Phone", accountName: "Mobile Phone", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64000", accountDesc: "64000 - Res Payment Srvc Fees", accountName: "Res Payment Srvc Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64023", accountDesc: "64023 - Playground Expense", accountName: "Playground Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64025", accountDesc: "64025 - RentPlus Suite", accountName: "RentPlus Suite", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64026", accountDesc: "64026 - Guest Unit Expense", accountName: "Guest Unit Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64045", accountDesc: "64045 - Office Expense", accountName: "Office Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64050", accountDesc: "64050 - Office Supplies", accountName: "Office Supplies", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64060", accountDesc: "64060 - Meals & Entertainment", accountName: "Meals & Entertainment", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64065", accountDesc: "64065 - Parking Fees", accountName: "Parking Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64070", accountDesc: "64070 - Pet Center Expense", accountName: "Pet Center Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64075", accountDesc: "64075 - Coffee Shop Expense", accountName: "Coffee Shop Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64150", accountDesc: "64150 - Permits/Licenses/Fees", accountName: "Permits/Licenses/Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64200", accountDesc: "64200 - Postage", accountName: "Postage", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64225", accountDesc: "64225 - Smart Home", accountName: "Smart Home", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64250", accountDesc: "64250 - Telephone", accountName: "Telephone", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64300", accountDesc: "64300 - Training", accountName: "Training", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64350", accountDesc: "64350 - Transportation/Mileage", accountName: "Transportation/Mileage", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64375", accountDesc: "64375 - Tenant Renter's Insurance", accountName: "Tenant Renter's Insurance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64400", accountDesc: "64400 - Website", accountName: "Website", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64450", accountDesc: "64450 - Recruiting", accountName: "Recruiting", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64500", accountDesc: "64500 - Other Professional Fees", accountName: "Other Professional Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64505", accountDesc: "64505 - Management Fees", accountName: "Management Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Detail" },
        { accountCode: "64507", accountDesc: "64507 - Management Fees - Other", accountName: "Management Fees - Other", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64510", accountDesc: "64510 - Management Fee - Retail", accountName: "Management Fee - Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64515", accountDesc: "64515 - Asset Management Fees", accountName: "Asset Management Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64995", accountDesc: "64995 - G&A Commercial Reimbursement", accountName: "G&A Commercial Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64850", accountDesc: "64850 - G&A Retail", accountName: "G&A Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Input Line(s)" },
        { accountCode: "64520", accountDesc: "64520 - Management Fee Commercial Reimbursement", accountName: "Management Fee Commercial Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "64800", accountDesc: "64800 - Other G&A", accountName: "Other G&A", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General and Administrative", methodName: "Formula" },
        { accountCode: "65100", accountDesc: "65100 - Cleaning Contract", accountName: "Cleaning Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Contract Services", methodName: "Input Line(s)" },
        { accountCode: "65605", accountDesc: "65605 - Termite Control Contract", accountName: "Termite Control Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Contract Services", methodName: "Input Line(s)" },
        { accountCode: "65680", accountDesc: "65680 - Lake Maintenance Contract", accountName: "Lake Maintenance Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Contract Services", methodName: "Formula" },
        { accountCode: "65750", accountDesc: "65750 - Bulk Cable Internet", accountName: "Bulk Cable Internet", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Contract Services", methodName: "Formula" },
        { accountCode: "66010", accountDesc: "66010 - Flowers", accountName: "Flowers", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Input Line(s)" },
        { accountCode: "66020", accountDesc: "66020 - Landscaping Services Contract", accountName: "Landscaping Services Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Detail" },
        { accountCode: "66030", accountDesc: "66030 - Seasonal Color & Mulch Contract", accountName: "Seasonal Color & Mulch Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Detail" },
        { accountCode: "66040", accountDesc: "66040 - Irrigation Repair and Maintenance", accountName: "Irrigation Repair and Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Input Line(s)" },
        { accountCode: "66050", accountDesc: "66050 - Tree Trimming", accountName: "Tree Trimming", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Formula" },
        { accountCode: "66800", accountDesc: "66800 - Landscape Reimbursement", accountName: "Landscape Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Detail" },
        { accountCode: "66990", accountDesc: "66990 - Other Landscape/Grounds", accountName: "Other Landscape/Grounds", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Landscaping/Grounds", methodName: "Detail" },
        { accountCode: "67050", accountDesc: "67050 - Carpet Cleaning - Turnkey", accountName: "Carpet Cleaning - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67100", accountDesc: "67100 - Carpet Repairs - Turnkey", accountName: "Carpet Repairs - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67150", accountDesc: "67150 - Carpet Replacement - Turnkey", accountName: "Carpet Replacement - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67200", accountDesc: "67200 - Interior Cleaning - Turnkey", accountName: "Interior Cleaning - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Formula" },
        { accountCode: "67210", accountDesc: "67210 - Cleaning Supplies - Turnkey", accountName: "Cleaning Supplies - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Formula" },
        { accountCode: "67250", accountDesc: "67250 - Interior Repairs/Materials - Turnkey", accountName: "Interior Repairs/Materials - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67300", accountDesc: "67300 - Millwork/Doors/Hardware - Turnkey", accountName: "Millwork/Doors/Hardware - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Detail" },
        { accountCode: "67325", accountDesc: "67325 - Carpentry - Exterior/Common - Turnkey", accountName: "Carpentry - Exterior/Common - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Detail" },
        { accountCode: "67350", accountDesc: "67350 - Painting Supplies - Turnkey", accountName: "Painting Supplies - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67400", accountDesc: "67400 - Painting-Units - Turnkey", accountName: "Painting-Units - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Formula" },
        { accountCode: "67403", accountDesc: "67403 - Repair - Drywall - Turnkey", accountName: "Repair - Drywall - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Formula" },
        { accountCode: "67450", accountDesc: "67450 - Vinyl Repairs - Turnkey", accountName: "Vinyl Repairs - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Formula" },
        { accountCode: "67500", accountDesc: "67500 - Vinyl Replacement - Turnkey", accountName: "Vinyl Replacement - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Detail" },
        { accountCode: "67550", accountDesc: "67550 - Window Coverings - Turnkey", accountName: "Window Coverings - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67600", accountDesc: "67600 - Tub Surfacing - Turnkey", accountName: "Tub Surfacing - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67650", accountDesc: "67650 - Countertop Resurfacing - Turnkey", accountName: "Countertop Resurfacing - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67652", accountDesc: "67652 - Repair - Countertop Resurfacing", accountName: "Repair - Countertop Resurfacing", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Detail" },
        { accountCode: "67700", accountDesc: "67700 - Appliance Repair - Turnkey", accountName: "Appliance Repair - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Detail" },
        { accountCode: "67705", accountDesc: "67705 - Appliance Rental - Turnkey", accountName: "Appliance Rental - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Input Line(s)" },
        { accountCode: "67990", accountDesc: "67990 - Other Redecorating - Turnkey", accountName: "Other Redecorating - Turnkey", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Redecorating", methodName: "Formula" },
        { accountCode: "68010", accountDesc: "68010 - Access Gate R&M", accountName: "Access Gate R&M", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68011", accountDesc: "68011 - Access System Repair", accountName: "Access System Repair", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68015", accountDesc: "68015 - Amenities Repair/Maintenance", accountName: "Amenities Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68020", accountDesc: "68020 - Appliance Repair/Maintenance", accountName: "Appliance Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68030", accountDesc: "68030 - Cleaning Supplies", accountName: "Cleaning Supplies", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68040", accountDesc: "68040 - Common Area Cleaning/Repairs", accountName: "Common Area Cleaning/Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68050", accountDesc: "68050 - Contracted Security Service", accountName: "Contracted Security Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68060", accountDesc: "68060 - Doors/Windows/Screens", accountName: "Doors/Windows/Screens", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68062", accountDesc: "68062 - Window Cleaning", accountName: "Window Cleaning", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68070", accountDesc: "68070 - Electrical Service", accountName: "Electrical Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68072", accountDesc: "68072 - Elevator Repairs", accountName: "Elevator Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68080", accountDesc: "68080 - Electrical Supplies/Parts", accountName: "Electrical Supplies/Parts", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68084", accountDesc: "68084 - Electrical-Exterior/Common", accountName: "Electrical-Exterior/Common", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68090", accountDesc: "68090 - Elevator Maintenance Contract", accountName: "Elevator Maintenance Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68100", accountDesc: "68100 - Equipment Repair/Maintenance", accountName: "Equipment Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68110", accountDesc: "68110 - Fire Alarm and Sprinkler Inspection/Repairs", accountName: "Fire Alarm and Sprinkler Inspection/Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68115", accountDesc: "68115 - Fire Life Safety Contract", accountName: "Fire Life Safety Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68120", accountDesc: "68120 - Fitness Center Repair/Maintenance", accountName: "Fitness Center Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68125", accountDesc: "68125 - EV Charge R&M", accountName: "EV Charge R&M", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68130", accountDesc: "68130 - Garage Repair/Maintenance", accountName: "Garage Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68140", accountDesc: "68140 - Golf Cart Supplies/Repairs", accountName: "Golf Cart Supplies/Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68150", accountDesc: "68150 - HVAC Service", accountName: "HVAC Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68160", accountDesc: "68160 - HVAC Supplies/Parts", accountName: "HVAC Supplies/Parts", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68165", accountDesc: "68165 - Inspections (Fire & Safety)", accountName: "Inspections (Fire & Safety)", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68166", accountDesc: "68166 - Landscape Supplies", accountName: "Landscape Supplies", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68170", accountDesc: "68170 - Interior Plant Maintenance Contract", accountName: "Interior Plant Maintenance Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68175", accountDesc: "68175 - Lift Station Maintenance Contract", accountName: "Lift Station Maintenance Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68180", accountDesc: "68180 - Light Bulbs", accountName: "Light Bulbs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68190", accountDesc: "68190 - Locks & Keys", accountName: "Locks & Keys", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68200", accountDesc: "68200 - Maintenance Supplies", accountName: "Maintenance Supplies", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68205", accountDesc: "68205 - Model Repairs", accountName: "Model Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68210", accountDesc: "68210 - Painting/General & Exterior", accountName: "Painting/General & Exterior", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68220", accountDesc: "68220 - Parking Lot Repair/Maintenance", accountName: "Parking Lot Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68231", accountDesc: "68231 - Utilities Reimb - Pest Control", accountName: "Utilities Reimb - Pest Control", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68230", accountDesc: "68230 - Pest Control Contract", accountName: "Pest Control Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68240", accountDesc: "68240 - Plumbing Service", accountName: "Plumbing Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68250", accountDesc: "68250 - Plumbing Supplies/Parts", accountName: "Plumbing Supplies/Parts", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68255", accountDesc: "68255 - Package Locker Service", accountName: "Package Locker Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68260", accountDesc: "68260 - Pool Maintenance", accountName: "Pool Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68261", accountDesc: "68261 - Pool Service", accountName: "Pool Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68265", accountDesc: "68265 - Pool Maintenance Contract", accountName: "Pool Maintenance Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68268", accountDesc: "68268 - Storm Water Contract", accountName: "Storm Water Contract", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68270", accountDesc: "68270 - Repairs/Labor - Exterior", accountName: "Repairs/Labor - Exterior", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68280", accountDesc: "68280 - Repairs/Labor - Interior", accountName: "Repairs/Labor - Interior", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68283", accountDesc: "68283 - Snow Removal", accountName: "Snow Removal", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68285", accountDesc: "68285 - Misc. Exterior/Common Area Repair", accountName: "Misc. Exterior/Common Area Repair", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68290", accountDesc: "68290 - Roof Repairs", accountName: "Roof Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68295", accountDesc: "68295 - Compactor Repairs", accountName: "Compactor Repairs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68300", accountDesc: "68300 - Security/Fire Alarm Monitor", accountName: "Security/Fire Alarm Monitor", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68305", accountDesc: "68305 - Property Monitoring Service", accountName: "Property Monitoring Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68308", accountDesc: "68308 - EV Charge Expense", accountName: "EV Charge Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68310", accountDesc: "68310 - Tools & Small Equipment", accountName: "Tools & Small Equipment", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68315", accountDesc: "68315 - Sidewalk Repair/Maintenance", accountName: "Sidewalk Repair/Maintenance", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68320", accountDesc: "68320 - Shipping Costs", accountName: "Shipping Costs", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "68350", accountDesc: "68350 - R & M - Retail", accountName: "R & M - Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68900", accountDesc: "68900 - Other Contract Services", accountName: "Other Contract Services", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68990", accountDesc: "68990 - Other R&M", accountName: "Other R&M", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Input Line(s)" },
        { accountCode: "68995", accountDesc: "68995 - R&M Commercial Reimbursement", accountName: "R&M Commercial Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Formula" },
        { accountCode: "68997", accountDesc: "68997 - CAM Expense", accountName: "CAM Expense", typeName: "Liabilities", headName: "Operating Expenses", groupName: "General R&M", methodName: "Detail" },
        { accountCode: "69080", accountDesc: "69080 - Internet", accountName: "Internet", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69090", accountDesc: "69090 - Cable", accountName: "Cable", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Formula" },
        { accountCode: "69100", accountDesc: "69100 - Electricity - Common Area", accountName: "Electricity - Common Area", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "69110", accountDesc: "69110 - Electricity - Vacants", accountName: "Electricity - Vacants", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69120", accountDesc: "69120 - Electricity - Occupied", accountName: "Electricity - Occupied", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "69125", accountDesc: "69125 - Utilities Reimb - Occupied Electric", accountName: "Utilities Reimb - Occupied Electric", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Formula" },
        { accountCode: "69200", accountDesc: "69200 - Trash Removal", accountName: "Trash Removal", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "69225", accountDesc: "69225 - Valet Trash", accountName: "Valet Trash", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69250", accountDesc: "69250 - Utilities Reimb - Trash", accountName: "Utilities Reimb - Trash", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69300", accountDesc: "69300 - Gas - Common Area", accountName: "Gas - Common Area", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Formula" },
        { accountCode: "69310", accountDesc: "69310 - Gas - Vacants", accountName: "Gas - Vacants", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69315", accountDesc: "69315 - Utilities Reimb - Gas", accountName: "Utilities Reimb - Gas", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69400", accountDesc: "69400 - Utility Billing Fee", accountName: "Utility Billing Fee", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69500", accountDesc: "69500 - Water/Sewer", accountName: "Water/Sewer", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Formula" },
        { accountCode: "69505", accountDesc: "69505 - Sewer", accountName: "Sewer", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "69523", accountDesc: "69523 - Utilities Reimb - Water/Sewer", accountName: "Utilities Reimb - Water/Sewer", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Formula" },
        { accountCode: "69525", accountDesc: "69525 - Irrigation", accountName: "Irrigation", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69550", accountDesc: "69550 - Water - RUBS", accountName: "Water - RUBS", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69610", accountDesc: "69610 - Utilities - Corporate", accountName: "Utilities - Corporate", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Input Line(s)" },
        { accountCode: "69605", accountDesc: "69605 - Utilities - Other", accountName: "Utilities - Other", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "69560", accountDesc: "69560 - Utilities Commercial Reimbursement", accountName: "Utilities Commercial Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "69600", accountDesc: "69600 - Utilities - Retail", accountName: "Utilities - Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Utilities", methodName: "Detail" },
        { accountCode: "70100", accountDesc: "70100 - Insurance Premium", accountName: "Insurance Premium", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Detail" },
        { accountCode: "70110", accountDesc: "70110 - Insurance Premium - Other", accountName: "Insurance Premium - Other", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Input Line(s)" },
        { accountCode: "70150", accountDesc: "70150 - Insurance Premium - Retail", accountName: "Insurance Premium - Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Formula" },
        { accountCode: "70200", accountDesc: "70200 - Loss on Casualty", accountName: "Loss on Casualty", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Input Line(s)" },
        { accountCode: "70205", accountDesc: "70205 - Insurance Commercial Reimbursements", accountName: "Insurance Commercial Reimbursements", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Input Line(s)" },
        { accountCode: "70225", accountDesc: "70225 - Insurance Reimbursements", accountName: "Insurance Reimbursements", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Detail" },
        { accountCode: "70226", accountDesc: "70226 - Insurance - Auto", accountName: "Insurance - Auto", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Formula" },
        { accountCode: "70227", accountDesc: "70227 - Insurance - Property", accountName: "Insurance - Property", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Input Line(s)" },
        { accountCode: "70300", accountDesc: "70300 - Insurance Premium - Gen Liab", accountName: "Insurance Premium - Gen Liab", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Input Line(s)" },
        { accountCode: "70310", accountDesc: "70310 - Insurance Premium - Pollution", accountName: "Insurance Premium - Pollution", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Formula" },
        { accountCode: "70990", accountDesc: "70990 - Insurance - Workers Comp", accountName: "Insurance - Workers Comp", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Insurance", methodName: "Input Line(s)" },
        { accountCode: "71000", accountDesc: "71000 - REC Property Management Fees", accountName: "REC Property Management Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Detail" },
        { accountCode: "81750", accountDesc: "81750 - Property Insurance Deductible", accountName: "Property Insurance Deductible", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Input Line(s)" },
        { accountCode: "81755", accountDesc: "81755 - Property Loss not Claimable", accountName: "Property Loss not Claimable", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Detail" },
        { accountCode: "81760", accountDesc: "81760 - Liability Insurance Deductible", accountName: "Liability Insurance Deductible", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Detail" },
        { accountCode: "71100", accountDesc: "71100 - Property Taxes - Real Estate", accountName: "Property Taxes - Real Estate", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Detail" },
        { accountCode: "71125", accountDesc: "71125 - Property Taxes - Personal Property", accountName: "Property Taxes - Personal Property", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Detail" },
        { accountCode: "71150", accountDesc: "71150 - Property Taxes - Prior Period", accountName: "Property Taxes - Prior Period", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "71155", accountDesc: "71155 - Property Taxes - Retail", accountName: "Property Taxes - Retail", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "71158", accountDesc: "71158 - Property Taxes - Other", accountName: "Property Taxes - Other", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Detail" },
        { accountCode: "71160", accountDesc: "71160 - Property Taxes - Ad Valorem", accountName: "Property Taxes - Ad Valorem", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "71161", accountDesc: "71161 - TAD Reimbursement", accountName: "TAD Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Input Line(s)" },
        { accountCode: "71162", accountDesc: "71162 - Fees and Duties", accountName: "Fees and Duties", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Input Line(s)" },
        { accountCode: "71175", accountDesc: "71175 - Property Taxes - Prior Year Refund", accountName: "Property Taxes - Prior Year Refund", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Input Line(s)" },
        { accountCode: "71200", accountDesc: "71200 - Property Tax Service", accountName: "Property Tax Service", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "71300", accountDesc: "71300 - Franchise Taxes", accountName: "Franchise Taxes", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "71500", accountDesc: "71500 - MidCity Improvement District", accountName: "MidCity Improvement District", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Detail" },
        { accountCode: "71900", accountDesc: "71900 - Other Taxes", accountName: "Other Taxes", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "71905", accountDesc: "71905 - Taxes Commercial Reimbursement", accountName: "Taxes Commercial Reimbursement", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Taxes", methodName: "Formula" },
        { accountCode: "81100", accountDesc: "81100 - Interest - Senior Debt", accountName: "Interest - Senior Debt", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81102", accountDesc: "81102 - Principal Payments", accountName: "Principal Payments", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Detail" },
        { accountCode: "81150", accountDesc: "81150 - Interest - 2nd Mortgage", accountName: "Interest - 2nd Mortgage", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Detail" },
        { accountCode: "81200", accountDesc: "81200 - Interest - Other", accountName: "Interest - Other", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Detail" },
        { accountCode: "81250", accountDesc: "81250 - Interest Contra - Rate Cap", accountName: "Interest Contra - Rate Cap", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Input Line(s)" },
        { accountCode: "81300", accountDesc: "81300 - Interest - Rate Cap", accountName: "Interest - Rate Cap", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81301", accountDesc: "81301 - Unrealized Gain/Loss on Interest Rate Cap", accountName: "Unrealized Gain/Loss on Interest Rate Cap", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81302", accountDesc: "81302 - Realized Gain/Loss on Interest Rate Cap", accountName: "Realized Gain/Loss on Interest Rate Cap", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81303", accountDesc: "81303 - Unrealized Gain/Loss on RE", accountName: "Unrealized Gain/Loss on RE", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81304", accountDesc: "81304 - Realized Gain/Loss on RE", accountName: "Realized Gain/Loss on RE", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81310", accountDesc: "81310 - Gain/Loss on Extinguishment", accountName: "Gain/Loss on Extinguishment", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Detail" },
        { accountCode: "81500", accountDesc: "81500 - Bond Fees", accountName: "Bond Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "81600", accountDesc: "81600 - Administration Fees", accountName: "Administration Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Input Line(s)" },
        { accountCode: "81550", accountDesc: "81550 - Loan Fees", accountName: "Loan Fees", typeName: "Liabilities", headName: "Operating Expenses", groupName: "Debt Service", methodName: "Formula" },
        { accountCode: "93100", accountDesc: "93100 - Interest Income", accountName: "Interest Income", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "93200", accountDesc: "93200 - Interest Income - Security Deposit", accountName: "Interest Income - Security Deposit", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "93205", accountDesc: "93205 - Interest Expense Other", accountName: "Interest Expense Other", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "93380", accountDesc: "93380 - Lease up - Marketing & Concessions", accountName: "Lease up - Marketing & Concessions", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94100", accountDesc: "94100 - Ownership Asset Management Fees", accountName: "Ownership Asset Management Fees", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94200", accountDesc: "94200 - Ownership Auditing", accountName: "Ownership Auditing", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94202", accountDesc: "94202 - Audit Fees", accountName: "Audit Fees", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94205", accountDesc: "94205 - Ownership Accounting", accountName: "Ownership Accounting", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "94250", accountDesc: "94250 - Other Asset Fees", accountName: "Other Asset Fees", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94300", accountDesc: "94300 - Ownership Tax Preparation", accountName: "Ownership Tax Preparation", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94350", accountDesc: "94350 - Ownership Consulting & Other Professional", accountName: "Ownership Consulting & Other Professional", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94400", accountDesc: "94400 - Ownership Legal", accountName: "Ownership Legal", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94401", accountDesc: "94401 - Ownership Miscellaneous", accountName: "Ownership Miscellaneous", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "94402", accountDesc: "94402 - Invoice Processing Fees", accountName: "Invoice Processing Fees", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94403", accountDesc: "94403 - CapEx Reserves", accountName: "CapEx Reserves", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94404", accountDesc: "94404 - Principal Payments", accountName: "Principal Payments", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94405", accountDesc: "94405 - Unfunded CapEx Reserves", accountName: "Unfunded CapEx Reserves", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "94406", accountDesc: "94406 - Gain on PPP Loan Forgiveness", accountName: "Gain on PPP Loan Forgiveness", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94450", accountDesc: "94450 - Guaranteed Payments", accountName: "Guaranteed Payments", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94500", accountDesc: "94500 - Loan Servicing Fees", accountName: "Loan Servicing Fees", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "94550", accountDesc: "94550 - Loan Origination Costs", accountName: "Loan Origination Costs", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "94600", accountDesc: "94600 - Start-up Costs", accountName: "Start-up Costs", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "94650", accountDesc: "94650 - LLC Expenses", accountName: "LLC Expenses", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94700", accountDesc: "94700 - Travel Related Expenses", accountName: "Travel Related Expenses", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94701", accountDesc: "94701 - Travel - Meals and Entertainment", accountName: "Travel - Meals and Entertainment", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94750", accountDesc: "94750 - Loss on Casualty", accountName: "Loss on Casualty", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94850", accountDesc: "94850 - Other Partnership Exp.", accountName: "Other Partnership Exp.", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94855", accountDesc: "94855 - Franchise Tax", accountName: "Franchise Tax", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94875", accountDesc: "94875 - Prior Year Adjustment", accountName: "Prior Year Adjustment", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "94880", accountDesc: "94880 - Other Ownership Income", accountName: "Other Ownership Income", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94899", accountDesc: "94899 - Other Ownership Fees", accountName: "Other Ownership Fees", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "94900", accountDesc: "94900 - COVID-19 Expenses", accountName: "COVID-19 Expenses", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Formula" },
        { accountCode: "92950", accountDesc: "92950 - Other Replacements", accountName: "Other Replacements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95100", accountDesc: "95100 - Access Control", accountName: "Access Control", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95110", accountDesc: "95110 - Amenity Improvements", accountName: "Amenity Improvements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95120", accountDesc: "95120 - Appliances", accountName: "Appliances", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95140", accountDesc: "95140 - Blinds/Windows", accountName: "Blinds/Windows", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95150", accountDesc: "95150 - Cabinets & Hardware", accountName: "Cabinets & Hardware", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95160", accountDesc: "95160 - Cabinets & Hardware", accountName: "Cabinets & Hardware", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95165", accountDesc: "95165 - Carpet", accountName: "Carpet", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95170", accountDesc: "95170 - Common Area/Amenities", accountName: "Common Area/Amenities", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95180", accountDesc: "95180 - Concrete/Masonry Repair", accountName: "Concrete/Masonry Repair", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95190", accountDesc: "95190 - Countertops & Backsplash", accountName: "Countertops & Backsplash", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95200", accountDesc: "95200 - Elevator Upgrades/Replacement", accountName: "Elevator Upgrades/Replacement", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95220", accountDesc: "95220 - Exterior Building Improvements", accountName: "Exterior Building Improvements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95230", accountDesc: "95230 - Exterior Lighting/Electrical", accountName: "Exterior Lighting/Electrical", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95240", accountDesc: "95240 - Fencing/Controlled Gate", accountName: "Fencing/Controlled Gate", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95250", accountDesc: "95250 - Fire Prevention", accountName: "Fire Prevention", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95260", accountDesc: "95260 - Fire Safety Repair", accountName: "Fire Safety Repair", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95270", accountDesc: "95270 - Furniture & Computer Equipment", accountName: "Furniture & Computer Equipment", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95280", accountDesc: "95280 - Furniture/Equipment Purchases", accountName: "Furniture/Equipment Purchases", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95285", accountDesc: "95285 - Gutters/Downspouts", accountName: "Gutters/Downspouts", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95290", accountDesc: "95290 - HVAC", accountName: "HVAC", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95300", accountDesc: "95300 - HVAC Replacement", accountName: "HVAC Replacement", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95310", accountDesc: "95310 - Interior Building Improvements", accountName: "Interior Building Improvements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95320", accountDesc: "95320 - Labor & Related Expenses", accountName: "Labor & Related Expenses", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95330", accountDesc: "95330 - Landscape/Drainage/Pool", accountName: "Landscape/Drainage/Pool", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95331", accountDesc: "95331 - Lease Up Expenses", accountName: "Lease Up Expenses", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95340", accountDesc: "95340 - Lighting/Ceiling Fans/Electrical", accountName: "Lighting/Ceiling Fans/Electrical", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95350", accountDesc: "95350 - Maintenance Equipment/Shop", accountName: "Maintenance Equipment/Shop", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95355", accountDesc: "95355 - Models", accountName: "Models", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95360", accountDesc: "95360 - Non-recurring OPEX", accountName: "Non-recurring OPEX", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95365", accountDesc: "95365 - Other Capital", accountName: "Other Capital", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95366", accountDesc: "95366 - Exterior Painting", accountName: "Exterior Painting", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95368", accountDesc: "95368 - Other Maintenance Repair", accountName: "Other Maintenance Repair", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95370", accountDesc: "95370 - Other Operating Expenses", accountName: "Other Operating Expenses", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95375", accountDesc: "95375 - Pet Amenity - R&M", accountName: "Pet Amenity - R&M", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95380", accountDesc: "95380 - Playground/Sports Court", accountName: "Playground/Sports Court", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95385", accountDesc: "95385 - Plumbing Repair", accountName: "Plumbing Repair", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95390", accountDesc: "95390 - Plumbing Replacement", accountName: "Plumbing Replacement", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95395", accountDesc: "95395 - Pool/Spa", accountName: "Pool/Spa", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95400", accountDesc: "95400 - Roof", accountName: "Roof", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95405", accountDesc: "95405 - Recurring Replacements", accountName: "Recurring Replacements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95410", accountDesc: "95410 - Security System", accountName: "Security System", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95413", accountDesc: "95413 - Sidewalk/Curbing/Parking Lot", accountName: "Sidewalk/Curbing/Parking Lot", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95415", accountDesc: "95415 - Sign Replacement", accountName: "Sign Replacement", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95420", accountDesc: "95420 - Signage", accountName: "Signage", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95425", accountDesc: "95425 - Site Improvements", accountName: "Site Improvements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95450", accountDesc: "95450 - Structural Repair", accountName: "Structural Repair", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95500", accountDesc: "95500 - Tennis Courts", accountName: "Tennis Courts", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95900", accountDesc: "95900 - Tub Resurfacing - R&M", accountName: "Tub Resurfacing - R&M", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95990", accountDesc: "95990 - Unit Interiors", accountName: "Unit Interiors", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95992", accountDesc: "95992 - Unit Labor", accountName: "Unit Labor", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95994", accountDesc: "95994 - Vehicles/Golf Carts", accountName: "Vehicles/Golf Carts", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95995", accountDesc: "95995 - Vinyl", accountName: "Vinyl", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95996", accountDesc: "95996 - Water Heaters/Plumbing", accountName: "Water Heaters/Plumbing", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Detail" },
        { accountCode: "95997", accountDesc: "95997 - Washers/Dryers", accountName: "Washers/Dryers", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "95998", accountDesc: "95998 - CapEx Contra", accountName: "CapEx Contra", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Formula" },
        { accountCode: "95999", accountDesc: "95999 - Construction Management Fee", accountName: "Construction Management Fee", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "R&M Expenditures", methodName: "Input Line(s)" },
        { accountCode: "96000", accountDesc: "96000 - Insurance Claim Expenses/Reimbursements", accountName: "Insurance Claim Expenses/Reimbursements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96050", accountDesc: "96050 - Amortization", accountName: "Amortization", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Formula" },
        { accountCode: "96100", accountDesc: "96100 - Amortization - Loan Costs", accountName: "Amortization - Loan Costs", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96200", accountDesc: "96200 - Amortization - Organization Costs", accountName: "Amortization - Organization Costs", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Detail" },
        { accountCode: "96250", accountDesc: "96250 - Amortization - Legal", accountName: "Amortization - Legal", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96260", accountDesc: "96260 - Amortization - Leasing Commissions", accountName: "Amortization - Leasing Commissions", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96300", accountDesc: "96300 - Amortization - In-Place Leases", accountName: "Amortization - In-Place Leases", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96400", accountDesc: "96400 - Amortization - Financing Leases", accountName: "Amortization - Financing Leases", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Detail" },
        { accountCode: "96480", accountDesc: "96480 - Depreciation", accountName: "Depreciation", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Detail" },
        { accountCode: "96500", accountDesc: "96500 - Depreciation - Building", accountName: "Depreciation - Building", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Formula" },
        { accountCode: "96520", accountDesc: "96520 - Depreciation - FF&E", accountName: "Depreciation - FF&E", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Detail" },
        { accountCode: "96530", accountDesc: "96530 - Depreciation - Site Improvements", accountName: "Depreciation - Site Improvements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Detail" },
        { accountCode: "96540", accountDesc: "96540 - Depreciation - Land Improvements", accountName: "Depreciation - Land Improvements", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96590", accountDesc: "96590 - Depreciation - Buildings - Step Up", accountName: "Depreciation - Buildings - Step Up", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "96620", accountDesc: "96620 - Depreciation - Deferred Financing", accountName: "Depreciation - Deferred Financing", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Depreciation/Amortization Expense", methodName: "Input Line(s)" },
        { accountCode: "98000", accountDesc: "98000 - Gain/Loss on Disposal of Assets", accountName: "Gain/Loss on Disposal of Assets", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Input Line(s)" },
        { accountCode: "98005", accountDesc: "98005 - Gain/Loss on Sale", accountName: "Gain/Loss on Sale", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
        { accountCode: "99000", accountDesc: "99000 - Property Specific", accountName: "Property Specific", typeName: "Liabilities", headName: "Non Operating Income/Expenses", groupName: "Ownership Income/Expenses", methodName: "Detail" },
    ];
    const CHUNK = 100;
    for (let i = 0; i < accounts.length; i += CHUNK) {
        const chunk = accounts.slice(i, i + CHUNK);
        await prisma.coaAccount.createMany({
            data: chunk.map((acc) => ({
                companyId: params.companyId,
                organisationId: params.organisationId,
                accountCode: acc.accountCode,
                accountDesc: acc.accountDesc,
                accountName: acc.accountName,
                typeId: typeMap.get(acc.typeName),
                headId: headMap.get(acc.headName),
                groupId: groupMap.get(acc.groupName),
                methodId: methodMap.get(acc.methodName),
                requiredComment: true,
            })),
            skipDuplicates: true,
        });
    }
    console.log(`Created ${accounts.length} COA accounts.`);
}
async function seedStateMaster() {
    const states = [
        // Northeast
        { stateCode: 'CT', stateName: 'Connecticut', region: 'northeast' },
        { stateCode: 'ME', stateName: 'Maine', region: 'northeast' },
        { stateCode: 'MA', stateName: 'Massachusetts', region: 'northeast' },
        { stateCode: 'NH', stateName: 'New Hampshire', region: 'northeast' },
        { stateCode: 'RI', stateName: 'Rhode Island', region: 'northeast' },
        { stateCode: 'VT', stateName: 'Vermont', region: 'northeast' },
        { stateCode: 'NJ', stateName: 'New Jersey', region: 'northeast' },
        { stateCode: 'NY', stateName: 'New York', region: 'northeast' },
        { stateCode: 'PA', stateName: 'Pennsylvania', region: 'northeast' },
        // Southeast
        { stateCode: 'AL', stateName: 'Alabama', region: 'southeast' },
        { stateCode: 'AR', stateName: 'Arkansas', region: 'southeast' },
        { stateCode: 'DE', stateName: 'Delaware', region: 'southeast' },
        { stateCode: 'FL', stateName: 'Florida', region: 'southeast' },
        { stateCode: 'GA', stateName: 'Georgia', region: 'southeast' },
        { stateCode: 'KY', stateName: 'Kentucky', region: 'southeast' },
        { stateCode: 'LA', stateName: 'Louisiana', region: 'southeast' },
        { stateCode: 'MD', stateName: 'Maryland', region: 'southeast' },
        { stateCode: 'MS', stateName: 'Mississippi', region: 'southeast' },
        { stateCode: 'NC', stateName: 'North Carolina', region: 'southeast' },
        { stateCode: 'SC', stateName: 'South Carolina', region: 'southeast' },
        { stateCode: 'TN', stateName: 'Tennessee', region: 'southeast' },
        { stateCode: 'VA', stateName: 'Virginia', region: 'southeast' },
        { stateCode: 'WV', stateName: 'West Virginia', region: 'southeast' },
        // Midwest
        { stateCode: 'IL', stateName: 'Illinois', region: 'midwest' },
        { stateCode: 'IN', stateName: 'Indiana', region: 'midwest' },
        { stateCode: 'IA', stateName: 'Iowa', region: 'midwest' },
        { stateCode: 'KS', stateName: 'Kansas', region: 'midwest' },
        { stateCode: 'MI', stateName: 'Michigan', region: 'midwest' },
        { stateCode: 'MN', stateName: 'Minnesota', region: 'midwest' },
        { stateCode: 'MO', stateName: 'Missouri', region: 'midwest' },
        { stateCode: 'NE', stateName: 'Nebraska', region: 'midwest' },
        { stateCode: 'ND', stateName: 'North Dakota', region: 'midwest' },
        { stateCode: 'OH', stateName: 'Ohio', region: 'midwest' },
        { stateCode: 'SD', stateName: 'South Dakota', region: 'midwest' },
        { stateCode: 'WI', stateName: 'Wisconsin', region: 'midwest' },
        // Southwest
        { stateCode: 'AZ', stateName: 'Arizona', region: 'southwest' },
        { stateCode: 'NM', stateName: 'New Mexico', region: 'southwest' },
        { stateCode: 'OK', stateName: 'Oklahoma', region: 'southwest' },
        { stateCode: 'TX', stateName: 'Texas', region: 'southwest' },
        // West
        { stateCode: 'AK', stateName: 'Alaska', region: 'west' },
        { stateCode: 'CA', stateName: 'California', region: 'west' },
        { stateCode: 'CO', stateName: 'Colorado', region: 'west' },
        { stateCode: 'HI', stateName: 'Hawaii', region: 'west' },
        { stateCode: 'ID', stateName: 'Idaho', region: 'west' },
        { stateCode: 'MT', stateName: 'Montana', region: 'west' },
        { stateCode: 'NV', stateName: 'Nevada', region: 'west' },
        { stateCode: 'OR', stateName: 'Oregon', region: 'west' },
        { stateCode: 'UT', stateName: 'Utah', region: 'west' },
        { stateCode: 'WA', stateName: 'Washington', region: 'west' },
        { stateCode: 'WY', stateName: 'Wyoming', region: 'west' },
    ];
    await prisma.stateMaster.createMany({ data: states, skipDuplicates: true });
    console.log(`Seeded ${states.length} US states into state_master.`);
}
async function seedOrganisationStates(params) {
    const rootStateNames = [
        'Texas', 'Florida', 'Georgia', 'North Carolina', 'Tennessee',
        'Virginia', 'Arizona', 'Colorado', 'California', 'Nevada',
    ];
    const opsStateNames = ['Texas', 'Florida', 'Georgia', 'North Carolina', 'Tennessee'];
    const allNames = [...new Set([...rootStateNames, ...opsStateNames])];
    const states = await prisma.stateMaster.findMany({
        where: { stateName: { in: allNames } },
        select: { stateId: true, stateName: true },
    });
    const stateMap = new Map(states.map(s => [s.stateName, s.stateId]));
    const rootLinks = rootStateNames
        .filter(n => stateMap.has(n))
        .map(n => ({ organisationId: params.rootOrganisationId, stateId: stateMap.get(n) }));
    const opsLinks = opsStateNames
        .filter(n => stateMap.has(n))
        .map(n => ({ organisationId: params.operationalOrganisationId, stateId: stateMap.get(n) }));
    await prisma.organisationStates.createMany({
        data: [...rootLinks, ...opsLinks],
        skipDuplicates: true,
    });
    console.log(`Seeded ${rootLinks.length} state links for root org, ${opsLinks.length} for operational org.`);
}
async function main() {
    console.log('Starting backend seed...');
    await resetData();
    await seedStateMaster();
    const passwordHash = await argon2.hash(DEV_PASSWORD);
    const platformUsers = await createPlatformUsers(passwordHash);
    const systemRoles = await createSystemRoles(platformUsers.systemAdmin.id);
    await createNavigationMenu();
    const internalTenant = await createInternalTenant(platformUsers.systemAdmin.id);
    await attachPlatformUsersToInternalTenant({
        companyId: internalTenant.company.id,
        rootOrganisationId: internalTenant.rootOrganisation.id,
        platformUsers
    });
    await assignSystemRoles({
        platformUsers,
        systemRoles,
        companyId: internalTenant.company.id,
        organisationId: internalTenant.rootOrganisation.id,
        assignedByUserId: platformUsers.systemAdmin.id
    });
    const businessCompany = await createBusinessCompany(platformUsers.systemAdmin.id);
    const businessRootOrganisation = await createBusinessRootOrganisation(businessCompany.id, platformUsers.systemAdmin.id);
    const operationalOrganisations = await createOperationalOrganisations({
        companyId: businessCompany.id,
        rootOrganisationId: businessRootOrganisation.id,
        createdByUserId: platformUsers.systemAdmin.id
    });
    await seedOrganisationStates({
        rootOrganisationId: businessRootOrganisation.id,
        operationalOrganisationId: operationalOrganisations.galleryOperations.id,
    });
    const companyUsers = await createBusinessCompanyUsers({
        companyId: businessCompany.id,
        rootOrganisationId: businessRootOrganisation.id,
        operationalOrganisations,
        passwordHash
    });
    const businessRoles = await createBusinessRoles(businessCompany.id, platformUsers.systemAdmin.id);
    await assignBusinessRoles({
        companyId: businessCompany.id,
        operationalOrganisationId: operationalOrganisations.galleryOperations.id,
        companyUsers,
        businessRoles,
        assignedByUserId: platformUsers.systemAdmin.id
    });
    const workflow = await createWorkflow({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    const property = await createProperty({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id,
        workflowDefinitionId: workflow.id
    });
    await deployPropertyAssignments({
        workflowId: workflow.id,
        propertyId: property.id,
        companyUsers,
        businessRoles
    });
    await createCoaReferenceData({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createCoaAccounts({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollMethods({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollBenefitAssumptions({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollGlobalAssumptions({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollStateConfigs({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollStateAssumptions({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollPositionAssumptions({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    await createPayrollSalaryDetails({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id,
        propertyId: property.id,
        fiscalYear: 2026
    });
    await integrationsettings({
        companyId: businessCompany.id,
        organisationId: operationalOrganisations.galleryOperations.id
    });
    console.log('');
    console.log('Seed completed successfully.');
    console.log(`Development password for seeded local users: ${DEV_PASSWORD}`);
    console.log(`Internal company (hidden): ${internalTenant.company.name}`);
    console.log(`Visible sample company: ${businessCompany.name} (${businessCompany.code})`);
    console.log(`Visible root organisation: ${businessRootOrganisation.name}`);
    console.log(`Visible operational organisations: ${operationalOrganisations.galleryOperations.name} `);
}
async function resetData() {
    console.log('Resetting existing seedable data...');
    await prisma.organisationStates.deleteMany();
    await prisma.payrollStateAssumption.deleteMany();
    await prisma.payrollStateConfig.deleteMany();
    await prisma.stateMaster.deleteMany();
    await prisma.payrollBenefitAssumption.deleteMany();
    await prisma.payrollMethod.deleteMany();
    await prisma.payrollGlobalAssumption.deleteMany();
    await prisma.payrollPositionOwnerValue.deleteMany();
    await prisma.payrollSalaryDetailLine.deleteMany();
    await prisma.payrollSalaryDetail.deleteMany();
    await prisma.payrollPositionAssumption.deleteMany();
    await prisma.coaAccountOwner.deleteMany();
    await prisma.coaAuditLog.deleteMany();
    await prisma.coaAccount.deleteMany();
    await prisma.coaOwner.deleteMany();
    await prisma.coaAccountGroup.deleteMany();
    await prisma.coaAccountHead.deleteMany();
    await prisma.coaAccountType.deleteMany();
    await prisma.coaInputMethod.deleteMany();
    await prisma.propertyWorkflowAssignment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.companyMicrosoftEntraConfig.deleteMany();
    await prisma.refreshSession.deleteMany();
    await prisma.otpChallenge.deleteMany();
    await prisma.businessRoleAssignment.deleteMany();
    await prisma.systemRoleAssignment.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflowDefinition.deleteMany();
    await prisma.property.deleteMany();
    await prisma.spaceOption.deleteMany();
    // companyUser table removed â€” users now carry companyId/organisationId directly
    await prisma.authIdentity.deleteMany();
    await prisma.passwordCredential.deleteMany();
    await prisma.organisation.deleteMany();
    await prisma.businessRole.deleteMany();
    await prisma.navigationMenuItem.deleteMany();
    await prisma.systemRole.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
}
async function createPlatformUsers(passwordHash) {
    const systemAdmin = await createUserWithLocalLogin({
        firstName: 'Robin',
        lastName: 'Kaur',
        displayName: 'Robin Kaur',
        email: 'admin@century.com',
        phone: '+1-713-555-0001',
        designation: 'System Admin',
        principalType: UserPrincipalType.PLATFORM,
        passwordHash,
        isSystemHidden: true
    });
    const operationsAdmin = await createUserWithLocalLogin({
        firstName: 'Alex',
        lastName: 'Morgan',
        displayName: 'Alex Morgan',
        email: 'opsadmin@century.com',
        phone: '+1-713-555-0002',
        designation: 'Operations Admin',
        principalType: UserPrincipalType.PLATFORM,
        passwordHash,
        isSystemHidden: true
    });
    return { systemAdmin, operationsAdmin };
}
async function createSystemRoles(createdByUserId) {
    const systemAdminRole = await prisma.systemRole.create({
        data: {
            code: 'SYSTEM_ADMIN',
            name: 'System Admin',
            description: 'Platform administrator with full platform ownership.',
            dashboardKey: 'dashboard-sa',
            isPlatformManaged: true,
            isActive: true,
            createdByUserId
        }
    });
    const operationsAdminRole = await prisma.systemRole.create({
        data: {
            code: 'OPERATIONS_ADMIN',
            name: 'Operations Admin',
            description: 'Platform operator who can work inside selected companies.',
            dashboardKey: 'dashboard-sa',
            isPlatformManaged: true,
            isActive: true,
            createdByUserId
        }
    });
    const propertyManagerRole = await prisma.systemRole.create({
        data: {
            code: 'PROPERTY_MANAGER',
            name: 'Property Manager',
            description: 'Responsible for preparing and managing property-related operational and financial data.',
            dashboardKey: 'dashboard-property-manager',
            isPlatformManaged: true,
            isActive: true
        }
    });
    const reviewerRole = await prisma.systemRole.create({
        data: {
            code: 'REVIEWER',
            name: 'Reviewer',
            description: 'Responsible for reviewing submitted data and ensuring compliance with business rules.',
            dashboardKey: 'dashboard-reviewer',
            isPlatformManaged: true,
            isActive: true
        }
    });
    const approverRole = await prisma.systemRole.create({
        data: {
            code: 'APPROVER',
            name: 'Approver',
            description: 'Responsible for approving reviewed records and finalizing workflow actions.',
            dashboardKey: 'dashboard-approver',
            isPlatformManaged: true,
            isActive: true
        }
    });
    return {
        systemAdminRole,
        operationsAdminRole,
        propertyManagerRole,
        reviewerRole,
        approverRole
    };
}
async function createNavigationMenu() {
    await prisma.navigationMenuItem.createMany({
        data: [
            // MAIN
            {
                code: 'dashboard',
                label: 'Dashboard',
                icon: 'dashboard',
                route: '/dashboard',
                section: 'Main',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // COMPANY
            {
                code: 'company-management',
                label: 'Company Management',
                icon: 'company',
                route: '/companies',
                section: 'Company',
                sortOrder: 20,
                scopeType: ScopeType.COMPANY,
                permissionCodes: ['companies.manage', 'companies.view', 'company.manage']
            },
            {
                code: 'organisation-management',
                label: 'Organisation Management',
                icon: 'organisation',
                route: '/organisations',
                section: 'Company',
                sortOrder: 30,
                scopeType: ScopeType.COMPANY,
                permissionCodes: ['organisations.manage', 'organisations.view', 'organisation.manage']
            },
            // INCOME
            {
                code: 'income',
                label: 'Income',
                icon: 'income',
                route: '/income',
                section: 'Income',
                sortOrder: 15,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: ['income.view']
            },
            {
                code: 'proforma-budget',
                label: 'Proforma Budget',
                icon: 'income',
                route: '/proforma-budget',
                section: 'Income',
                sortOrder: 20,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // REVENUE
            {
                code: 'profit-loss',
                label: 'Profit & Loss',
                icon: 'income',
                route: '/profit-loss',
                section: 'Revenue',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'proforma-loss-reforecast',
                label: 'Proforma Loss Reforecast',
                icon: 'income',
                route: '/proforma-loss-reforecast',
                section: 'Revenue',
                sortOrder: 15,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'occupancy-analysis',
                label: 'Occupancy Analysis',
                icon: 'income',
                route: '/occupancy-analysis',
                section: 'Revenue',
                sortOrder: 20,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // ADMIN
            {
                code: 'property-management',
                label: 'Property Management',
                icon: 'properties',
                route: '/properties',
                section: 'Admin',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: ['properties.view', 'properties.manage', 'property.manage']
            },
            {
                code: 'chart-of-accounts',
                label: 'Chart of Accounts',
                icon: 'coa',
                route: '/coa',
                section: 'Admin',
                sortOrder: 20,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: ['coa.view', 'coa.manage']
            },
            {
                code: 'periodic-drivers',
                label: 'Periodic Drivers',
                icon: 'drivers',
                route: '/periodic-drivers',
                section: 'Admin',
                sortOrder: 30,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: ['drivers.view', 'drivers.manage', 'driver.manage']
            },
            {
                code: 'global-assumptions',
                label: 'Global Assumptions',
                icon: 'assumptions',
                route: '/global-assumptions',
                section: 'Admin',
                sortOrder: 40,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // EXPENSES
            {
                code: 'expenses-operations',
                label: 'Operations',
                icon: 'income',
                route: '/expenses/operations',
                section: 'EXPENSES',
                sortOrder: 5,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'expenses-maintenance',
                label: 'Maintenance',
                icon: 'income',
                route: '/expenses/maintenance',
                section: 'EXPENSES',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'expenses-utilities',
                label: 'Utilities',
                icon: 'income',
                route: '/expenses/utilities',
                section: 'EXPENSES',
                sortOrder: 15,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'expenses-ownership',
                label: 'Ownership Expenses',
                icon: 'income',
                route: '/expenses/ownership-expenses',
                section: 'EXPENSES',
                sortOrder: 20,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // PAYROLL
            {
                code: 'payroll-salary-detail',
                label: 'Payroll Salary Detail',
                icon: 'income',
                route: '/payroll/salary-detail',
                section: 'PAYROLL',
                sortOrder: 5,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'payroll-budget',
                label: 'Payroll Budget',
                icon: 'income',
                route: '/payroll/budget',
                section: 'PAYROLL',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'payroll-benefit-assumption',
                label: 'Payroll Benefit Assumption',
                icon: 'income',
                route: '/payroll/benefit-assumption',
                section: 'PAYROLL',
                sortOrder: 15,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'payroll-global-assumption',
                label: 'Payroll Global Assumption',
                icon: 'income',
                route: '/payroll/global-assumption',
                section: 'PAYROLL',
                sortOrder: 20,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'payroll-state-assumption',
                label: 'Payroll State Assumption',
                icon: 'income',
                route: '/payroll/state-assumption',
                section: 'PAYROLL',
                sortOrder: 25,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'payroll-position-assumption',
                label: 'Payroll Position Assumption',
                icon: 'income',
                route: '/payroll/position-assumption',
                section: 'PAYROLL',
                sortOrder: 30,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // CAPEX
            {
                code: 'balance-sheet',
                label: 'Balance Sheet Capex',
                icon: 'income',
                route: '/capex/balance-sheet',
                section: 'CAPEX',
                sortOrder: 5,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            {
                code: 'operating-capex',
                label: 'Operating Capex',
                icon: 'income',
                route: '/capex/operating',
                section: 'CAPEX',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: []
            },
            // USER MANAGEMENT
            {
                code: 'users',
                label: 'Users',
                icon: 'users',
                route: '/users',
                section: 'User Management',
                sortOrder: 10,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: ['users.view']
            },
            {
                code: 'system-roles',
                label: 'System Roles',
                icon: 'roles',
                route: '/roles',
                section: 'User Management',
                sortOrder: 30,
                scopeType: ScopeType.PLATFORM,
                permissionCodes: ['roles.view']
            },
        ]
    });
}
async function createInternalTenant(createdByUserId) {
    const company = await prisma.company.create({
        data: {
            code: 'CENTURY',
            name: 'Century',
            shortDisplayName: 'Century',
            isSystemInternal: true,
            industry: 'Platform Operations',
            onboardingStatus: OnboardingStatus.ACTIVE,
            accessStatus: AccessStatus.ACTIVE,
            registeredCountry: 'United States',
            primaryContactName: 'Century Platform',
            primaryContactEmail: 'admin@century.com',
            canCompanyAdminAddOrganisation: false,
            notes: 'Hidden internal platform tenant for system-owned users and assignments.',
            auditCreatedByUserId: createdByUserId,
            auditModifiedByUserId: createdByUserId
        }
    });
    const rootOrganisation = await prisma.organisation.create({
        data: {
            companyId: company.id,
            code: 'CENTURY-ROOT',
            name: 'Century',
            description: 'Hidden internal root organisation for the platform tenant.',
            isSystemInternal: true,
            kind: OrganisationKind.ROOT,
            entityType: EntityType.GROUPING,
            status: OrganisationStatus.ACTIVE,
            timeZone: 'America/Chicago',
            notes: 'Internal platform organisation.',
            primaryContactName: 'Century Platform',
            primaryContactEmail: 'admin@century.com',
            country: 'United States',
            auditCreatedByUserId: createdByUserId,
            auditModifiedByUserId: createdByUserId
        }
    });
    return { company, rootOrganisation };
}
async function attachPlatformUsersToInternalTenant(_params) {
    // PLATFORM users no longer need a CompanyUser record.
    // Access to specific companies is managed via UserCompanyAccess if needed.
}
async function assignSystemRoles(params) {
    await prisma.systemRoleAssignment.createMany({
        data: [
            {
                userId: params.platformUsers.systemAdmin.id,
                systemRoleId: params.systemRoles.systemAdminRole.id,
                scopeType: ScopeType.PLATFORM,
                scopeRef: 'platform',
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId
            },
            {
                userId: params.platformUsers.operationsAdmin.id,
                systemRoleId: params.systemRoles.operationsAdminRole.id,
                scopeType: ScopeType.PLATFORM,
                scopeRef: 'platform',
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId
            }
        ]
    });
}
async function createBusinessCompany(createdByUserId) {
    const company = await prisma.company.create({
        data: {
            code: 'GRL-001',
            name: 'Gallery Residential LLP',
            shortDisplayName: 'Gallery Residential',
            isSystemInternal: false,
            industry: 'Multifamily Real Estate',
            onboardingStatus: OnboardingStatus.ACTIVE,
            accessStatus: AccessStatus.ACTIVE,
            registeredAddressLine1: '1200 Main St',
            registeredCity: 'Houston',
            registeredState: 'TX',
            registeredPostalCode: '77002',
            registeredCountry: 'United States',
            primaryContactName: 'Ashley Thompson',
            primaryContactEmail: 'ashley@galleryresidential.com',
            primaryContactPhone: '+1-713-555-0101',
            primaryContactDesignation: 'Company Admin',
            billingContactName: 'Jordan Lee',
            billingContactEmail: 'billing@galleryresidential.com',
            billingContactPhone: '+1-713-555-0199',
            contractStartDate: dates.contractStart,
            contractEndDate: dates.contractEnd,
            canCompanyAdminAddOrganisation: true,
            notes: 'Visible sample business company for company and organisation testing.',
            auditCreatedByUserId: createdByUserId,
            auditModifiedByUserId: createdByUserId
        }
    });
    await prisma.companyMicrosoftEntraConfig.create({
        data: {
            companyId: company.id,
            enabled: false,
            tenantId: '16a063e8-a55a-40b6-87bd-af74841b86b2',
            clientId: '097ca8ea-e710-4a92-b196-a46222a1c496',
            clientSecret: process.env.SAMPLE_ENTRA_CLIENT_SECRET || 'sample-dummy-client-secret',
            backendRedirectUri: `http://localhost:4000/api/v1/companies/${company.id}/auth/entra/callback`,
            frontendRedirectUri: 'http://localhost:4200/auth/entra/company-callback',
            postLogoutRedirectUri: 'http://localhost:4200',
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            allowedEmailDomains: ['galleryresidential.com']
        }
    });
    return company;
}
async function createBusinessRootOrganisation(companyId, createdByUserId) {
    return prisma.organisation.create({
        data: {
            companyId,
            code: 'GRL-ROOT',
            name: 'Gallery Residential Group Holdings',
            description: 'Root legal wrapper for the visible sample company.',
            isSystemInternal: false,
            kind: OrganisationKind.ROOT,
            entityType: EntityType.LEGAL_ENTITY,
            entityTypeDetail: EntityTypeDetail.LLP,
            status: OrganisationStatus.ACTIVE,
            timeZone: 'America/Chicago',
            notes: 'Visible sample root organisation.',
            primaryContactName: 'Ashley Thompson',
            primaryContactEmail: 'ashley@galleryresidential.com',
            primaryContactPhone: '+1-713-555-0101',
            primaryContactDesignation: 'Company Admin',
            billingContactName: 'Jordan Lee',
            billingContactEmail: 'billing@galleryresidential.com',
            billingContactPhone: '+1-713-555-0199',
            addressLine1: '1200 Main St',
            city: 'Houston',
            state: 'TX',
            postalCode: '77002',
            country: 'United States',
            configuration: {
                companyAdminCanEditRootOrganisation: true
            },
            licensedProperties: 5,
            licensedUsers: 25,
            licenseStatus: LicenseStatus.ACTIVE,
            licenseStartDate: dates.licenseStart,
            licenseDurationValue: 1,
            licenseDurationUnit: LicenseDurationUnit.YEARS,
            licenseEndDate: dates.licenseEnd,
            licenseNotes: 'Baseline sample root licence.',
            auditCreatedByUserId: createdByUserId,
            auditModifiedByUserId: createdByUserId
        }
    });
}
async function createOperationalOrganisations(params) {
    const galleryOperations = await prisma.organisation.create({
        data: {
            companyId: params.companyId,
            parentOrganisationId: params.rootOrganisationId,
            code: 'OPS-001',
            name: 'Gallery Residential Operations',
            description: 'Primary operational organisation for the sample company.',
            isSystemInternal: false,
            kind: OrganisationKind.OPERATIONAL,
            entityType: EntityType.GROUPING,
            status: OrganisationStatus.ACTIVE,
            timeZone: 'America/Chicago',
            notes: 'Primary business operations organisation.',
            primaryContactName: 'Priya Shah',
            primaryContactEmail: 'priya.shah@galleryresidential.com',
            primaryContactPhone: '+1-713-555-0103',
            primaryContactDesignation: 'Organisation Admin',
            addressLine1: '1200 Main St',
            city: 'Houston',
            state: 'TX',
            postalCode: '77002',
            country: 'United States',
            workflowConfig: {
                budgetWorkflowEnabled: true
            },
            pmsConfig: {
                providers: [{ key: 'yardi', enabled: true, isDefault: true }]
            },
            configuration: {
                canCreateChildOrganisations: true
            },
            licensedProperties: 3,
            licensedUsers: 15,
            licenseStatus: LicenseStatus.ACTIVE,
            licenseStartDate: dates.licenseStart,
            licenseDurationValue: 1,
            licenseDurationUnit: LicenseDurationUnit.YEARS,
            licenseEndDate: dates.licenseEnd,
            auditCreatedByUserId: params.createdByUserId,
            auditModifiedByUserId: params.createdByUserId
        }
    });
    // const houstonOperations = await prisma.organisation.create({
    //   data: {
    //     companyId: params.companyId,
    //     parentOrganisationId: galleryOperations.id,
    //     code: 'OPS-002',
    //     name: 'Houston Operations',
    //     description: 'Child operational organisation for hierarchy testing.',
    //     isSystemInternal: false,
    //     kind: OrganisationKind.OPERATIONAL,
    //     entityType: EntityType.GROUPING,
    //     status: OrganisationStatus.ACTIVE,
    //     timeZone: 'America/Chicago',
    //     notes: 'Nested operational organisation.',
    //     primaryContactName: 'Priya Shah',
    //     primaryContactEmail: 'priya.shah@galleryresidential.com',
    //     primaryContactPhone: '+1-713-555-0103',
    //     primaryContactDesignation: 'Organisation Admin',
    //     addressLine1: '1800 McKinney St',
    //     city: 'Houston',
    //     state: 'TX',
    //     postalCode: '77010',
    //     country: 'United States',
    //     configuration: {
    //       canCreateChildOrganisations: false
    //     },
    //     licensedProperties: 2,
    //     licensedUsers: 10,
    //     licenseStatus: LicenseStatus.ACTIVE,
    //     licenseStartDate: dates.licenseStart,
    //     licenseDurationValue: 1,
    //     licenseDurationUnit: LicenseDurationUnit.YEARS,
    //     licenseEndDate: dates.licenseEnd,
    //     auditCreatedByUserId: params.createdByUserId,
    //     auditModifiedByUserId: params.createdByUserId
    //   }
    // });
    return { galleryOperations };
    // return { galleryOperations, houstonOperations };
}
async function createBusinessCompanyUsers(params) {
    const ashley = await createCompanyUserWithLogin({
        firstName: 'Ashley',
        lastName: 'Thompson',
        displayName: 'Ashley Thompson',
        email: 'ashley@galleryresidential.com',
        phone: '+1-713-555-0101',
        designation: 'Company Admin',
        companyId: params.companyId,
        defaultOrganisationId: params.rootOrganisationId,
        isPrimaryCompanyAdmin: true,
        isRootOrganisationAdmin: false,
        passwordHash: params.passwordHash
    });
    const priya = await createCompanyUserWithLogin({
        firstName: 'Priya',
        lastName: 'Shah',
        displayName: 'Priya Shah',
        email: 'priya.shah@galleryresidential.com',
        phone: '+1-713-555-0103',
        designation: 'Organisation Admin',
        companyId: params.companyId,
        defaultOrganisationId: params.operationalOrganisations.galleryOperations.id,
        isPrimaryCompanyAdmin: false,
        isRootOrganisationAdmin: false,
        passwordHash: params.passwordHash
    });
    const daniel = await createCompanyUserWithLogin({
        firstName: 'Daniel',
        lastName: 'Brooks',
        displayName: 'Daniel Brooks',
        email: 'daniel.brooks@galleryresidential.com',
        phone: '+1-713-555-0104',
        designation: 'Property Manager',
        companyId: params.companyId,
        defaultOrganisationId: params.operationalOrganisations.galleryOperations.id,
        isPrimaryCompanyAdmin: false,
        isRootOrganisationAdmin: false,
        passwordHash: params.passwordHash
    });
    const rina = await createCompanyUserWithLogin({
        firstName: 'Rina',
        lastName: 'Patel',
        displayName: 'Rina Patel',
        email: 'rina.patel@galleryresidential.com',
        phone: '+1-713-555-0105',
        designation: 'Reviewer',
        companyId: params.companyId,
        defaultOrganisationId: params.operationalOrganisations.galleryOperations.id,
        isPrimaryCompanyAdmin: false,
        isRootOrganisationAdmin: false,
        passwordHash: params.passwordHash
    });
    const samuel = await createCompanyUserWithLogin({
        firstName: 'Samuel',
        lastName: 'Reed',
        displayName: 'Samuel Reed',
        email: 'samuel.reed@galleryresidential.com',
        phone: '+1-713-555-0106',
        designation: 'Approver',
        companyId: params.companyId,
        defaultOrganisationId: params.operationalOrganisations.galleryOperations.id,
        isPrimaryCompanyAdmin: false,
        isRootOrganisationAdmin: false,
        passwordHash: params.passwordHash
    });
    return { ashley, priya, daniel, rina, samuel };
}
async function createBusinessRoles(companyId, createdByUserId) {
    const dashboardKey = 'dashboard-ts';
    const companyAdmin = await prisma.businessRole.create({
        data: {
            companyId,
            code: 'COMPANY_ADMIN',
            name: 'Company Admin',
            description: 'Company-level administration role.',
            dashboardKey,
            scopeConfig: { allowedScopes: ['COMPANY'] },
            isCompanyAdminRole: true,
            isActive: true,
            createdByUserId
        }
    });
    const organisationAdmin = await prisma.businessRole.create({
        data: {
            companyId,
            code: 'ORGANISATION_ADMIN',
            name: 'Organisation Admin',
            description: 'Organisation-level administration role.',
            dashboardKey,
            scopeConfig: { allowedScopes: ['ORGANISATION'] },
            isOrganisationAdminRole: true,
            isActive: true,
            createdByUserId
        }
    });
    const propertyManager = await prisma.businessRole.create({
        data: {
            companyId,
            code: 'PROPERTY_MANAGER',
            name: 'Property Manager',
            description: 'Prepares budgets and manages assigned properties.',
            dashboardKey,
            scopeConfig: { allowedScopes: ['ORGANISATION', 'PROPERTY'] },
            isActive: true,
            createdByUserId
        }
    });
    const reviewer = await prisma.businessRole.create({
        data: {
            companyId,
            code: 'REVIEWER',
            name: 'Reviewer',
            description: 'Reviews budgets and supporting submissions.',
            dashboardKey,
            scopeConfig: { allowedScopes: ['ORGANISATION', 'PROPERTY'] },
            isActive: true,
            createdByUserId
        }
    });
    const approver = await prisma.businessRole.create({
        data: {
            companyId,
            code: 'APPROVER',
            name: 'Approver',
            description: 'Approves final budget submissions.',
            dashboardKey,
            scopeConfig: { allowedScopes: ['ORGANISATION', 'PROPERTY'] },
            isActive: true,
            createdByUserId
        }
    });
    return {
        companyAdmin,
        organisationAdmin,
        propertyManager,
        reviewer,
        approver
    };
}
async function assignBusinessRoles(params) {
    await prisma.businessRoleAssignment.createMany({
        data: [
            {
                userId: params.companyUsers.ashley.user.id,
                businessRoleId: params.businessRoles.companyAdmin.id,
                companyId: params.companyId,
                scopeType: ScopeType.COMPANY,
                scopeRef: params.companyId,
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId,
                notes: 'Primary company admin'
            },
            {
                userId: params.companyUsers.priya.user.id,
                businessRoleId: params.businessRoles.organisationAdmin.id,
                companyId: params.companyId,
                organisationId: params.operationalOrganisationId,
                scopeType: ScopeType.ORGANISATION,
                scopeRef: params.operationalOrganisationId,
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId,
                notes: 'Operational organisation admin'
            },
            {
                userId: params.companyUsers.daniel.user.id,
                businessRoleId: params.businessRoles.propertyManager.id,
                companyId: params.companyId,
                organisationId: params.operationalOrganisationId,
                scopeType: ScopeType.ORGANISATION,
                scopeRef: params.operationalOrganisationId,
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId,
                notes: 'Property manager'
            },
            {
                userId: params.companyUsers.rina.user.id,
                businessRoleId: params.businessRoles.reviewer.id,
                companyId: params.companyId,
                organisationId: params.operationalOrganisationId,
                scopeType: ScopeType.ORGANISATION,
                scopeRef: params.operationalOrganisationId,
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId,
                notes: 'Workflow reviewer'
            },
            {
                userId: params.companyUsers.samuel.user.id,
                businessRoleId: params.businessRoles.approver.id,
                companyId: params.companyId,
                organisationId: params.operationalOrganisationId,
                scopeType: ScopeType.ORGANISATION,
                scopeRef: params.operationalOrganisationId,
                status: AssignmentStatus.ACTIVE,
                assignedByUserId: params.assignedByUserId,
                notes: 'Workflow approver'
            }
        ]
    });
}
async function createWorkflow(params) {
    return prisma.workflowDefinition.create({
        data: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            name: 'Annual Budget Workflow',
            description: 'Default workflow for annual property budgeting.',
            status: WorkflowStatus.ACTIVE,
            version: 1,
            isDefault: true,
            steps: {
                create: [
                    {
                        stepOrder: 1,
                        name: 'Prepare Budget',
                        description: 'Initial budget preparation by the property manager.',
                        stepType: WorkflowStepType.PREPARER,
                        isRequired: true
                    },
                    {
                        stepOrder: 2,
                        name: 'Review Budget',
                        description: 'Operational review before approval.',
                        stepType: WorkflowStepType.REVIEWER,
                        isRequired: true
                    },
                    {
                        stepOrder: 3,
                        name: 'Approve Budget',
                        description: 'Final approval step.',
                        stepType: WorkflowStepType.APPROVER,
                        isRequired: true
                    }
                ]
            }
        }
    });
}
async function createProperty(params) {
    return prisma.property.create({
        data: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            workflowDefinitionId: params.workflowDefinitionId,
            code: 'P001',
            name: 'Sunset Oaks',
            status: PropertyStatus.ACTIVE,
            externalId: 100121180,
            marketingName: '1701 Chandler',
            type: 'Student',
            yearBuilt: 2025,
            website: 'https://www.1701chandler.com/',
            isDisabled: false,
            isFeatured: false,
            budgetYear: 2026,
            isWorkflowDeployed: false,
            // âœ… MAIN ADDRESS
            address: {
                create: {
                    address: '1701 Chandler Road',
                    city: 'Statesboro',
                    state: 'GA',
                    postalCode: '30458',
                    country: 'US',
                    email: '1701Chandler@galleryresidential.com'
                }
            },
            // âœ… ADDRESSES ARRAY
            addresses: {
                create: [
                    {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        addressType: 'Primary',
                        addressLine1: '1701 Chandler Road',
                        city: 'Statesboro',
                        stateCode: 'GA',
                        postalCode: '30458',
                        country: 'US'
                    }
                ]
            },
            // âœ… POST MONTHS
            postMonths: {
                create: {
                    companyId: params.companyId,
                    organisationId: params.organisationId,
                    arPostMonth: '04/2026',
                    apPostMonth: '04/2026',
                    glPostMonth: '04/2026'
                }
            },
            // âœ… OFFICE HOURS
            officeHours: {
                create: [
                    {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        day: 'Monday',
                        availability: 'Open',
                        openTime: '9:00 AM',
                        closeTime: '6:00 PM'
                    },
                    {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        day: 'Saturday',
                        availability: 'Open',
                        openTime: '10:00 AM',
                        closeTime: '5:00 PM'
                    }
                ]
            },
            // âœ… SPACE OPTIONS
            spaceOptions: {
                create: [
                    {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        externalId: '2',
                        name: 'Private',
                        spaceOption: {
                            create: { companyId: params.companyId, organisationId: params.organisationId, optionCode: 'PRIVATE', name: 'Private' }
                        }
                    },
                    {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        externalId: '3',
                        name: 'Shared',
                        spaceOption: {
                            create: { companyId: params.companyId, organisationId: params.organisationId, optionCode: 'SHARED', name: 'Shared' }
                        }
                    },
                    {
                        companyId: params.companyId,
                        organisationId: params.organisationId,
                        externalId: '7',
                        name: 'Two Bedrooms',
                        spaceOption: {
                            create: { companyId: params.companyId, organisationId: params.organisationId, optionCode: 'TWO_BEDROOMS', name: 'Two Bedrooms' }
                        }
                    }
                ]
            },
            // âœ… LEASE TERMS + WINDOWS
            leaseTerms: {
                create: [
                    {
                        externalId: 5371,
                        name: 'Annual',
                        termMonths: 12,
                        isProspect: true,
                        isRenewal: true,
                        isActive: true,
                        leaseWindows: {
                            create: [
                                {
                                    externalId: 24661,
                                    windowStart: new Date('2026-08-01'),
                                    windowEnd: new Date('2027-07-15')
                                },
                                {
                                    externalId: 24662,
                                    windowStart: new Date('2027-08-01'),
                                    windowEnd: new Date('2028-07-15')
                                }
                            ]
                        }
                    }
                ]
            }
        }
    });
}
async function deployPropertyAssignments(params) {
    const steps = await prisma.workflowStep.findMany({
        where: { workflowDefinitionId: params.workflowId },
        orderBy: { stepOrder: 'asc' }
    });
    const preparerStep = steps.find((step) => step.stepType === WorkflowStepType.PREPARER);
    const reviewerStep = steps.find((step) => step.stepType === WorkflowStepType.REVIEWER);
    const approverStep = steps.find((step) => step.stepType === WorkflowStepType.APPROVER);
    if (!preparerStep || !reviewerStep || !approverStep) {
        throw new Error('Workflow seed failed because required workflow steps were not found.');
    }
    // await prisma.workflowStep.update({
    //   where: { id: preparerStep.id },
    //   data: { businessRoleId: params.businessRoles.propertyManager.id }
    // });
    // await prisma.workflowStep.update({
    //   where: { id: reviewerStep.id },
    //   data: { businessRoleId: params.businessRoles.reviewer.id }
    // });
    // await prisma.workflowStep.update({
    //   where: { id: approverStep.id },
    //   data: { businessRoleId: params.businessRoles.approver.id }
    // });
    await prisma.property.update({
        where: { id: params.propertyId },
        data: { isWorkflowDeployed: true }
    });
}
async function createUserWithLocalLogin(params) {
    return prisma.user.create({
        data: {
            principalType: params.principalType,
            status: UserStatus.ACTIVE,
            firstName: params.firstName,
            lastName: params.lastName,
            displayName: params.displayName,
            email: params.email.toLowerCase(),
            phone: params.phone,
            designation: params.designation,
            isSystemHidden: params.isSystemHidden ?? false,
            authIdentities: {
                create: {
                    provider: AuthProvider.LOCAL,
                    providerSubject: params.email.toLowerCase(),
                    loginName: params.email.toLowerCase(),
                    email: params.email.toLowerCase(),
                    isPrimary: true
                }
            },
            passwordCredential: {
                create: {
                    passwordHash: params.passwordHash,
                    mustChangePassword: false
                }
            }
        }
    });
}
async function createCompanyUserWithLogin(params) {
    const user = await createUserWithLocalLogin({
        firstName: params.firstName,
        lastName: params.lastName,
        displayName: params.displayName,
        email: params.email,
        phone: params.phone,
        designation: params.designation,
        principalType: UserPrincipalType.COMPANY,
        passwordHash: params.passwordHash,
        isSystemHidden: false
    });
    await prisma.user.update({
        where: { id: user.id },
        data: {
            companyId: params.companyId,
            organisationId: params.defaultOrganisationId,
            status: UserStatus.ACTIVE,
            isPrimaryCompanyAdmin: params.isPrimaryCompanyAdmin,
            isRootOrganisationAdmin: params.isRootOrganisationAdmin,
            invitedAt: dates.inviteDate,
            activatedAt: dates.activatedDate
        }
    });
    return { user };
}
async function createPayrollMethods(params) {
    const { companyId, organisationId } = params;
    await prisma.payrollMethod.createMany({
        data: [
            {
                companyId,
                organisationId,
                code: 'per_month',
                name: '$ per employee per month',
                valueCount: 1,
                formula: 'amount * employeeCount * 12',
                valueLabel1: 'Amount',
                isActive: true,
                sortOrder: 1
            },
            {
                companyId,
                organisationId,
                code: 'per_year',
                name: '$ per employee per year',
                valueCount: 1,
                formula: 'amount * employeeCount',
                valueLabel1: 'Amount',
                isActive: true,
                sortOrder: 2
            },
            {
                companyId,
                organisationId,
                code: 'ft_pt_month',
                name: '$ per employee per month (full time/part time)',
                valueCount: 2,
                formula: '(amount1 * ftCount + amount2 * ptCount) * 12',
                valueLabel1: 'Full Time Amount',
                valueLabel2: 'Part Time Amount',
                isActive: true,
                sortOrder: 3
            },
            {
                companyId,
                organisationId,
                code: 'office_maint',
                name: 'Office / Maintenance',
                valueCount: 2,
                formula: '(amount1 * officeCount + amount2 * maintCount) * 12',
                valueLabel1: 'Office Amount',
                valueLabel2: 'Maintenance Amount',
                isActive: true,
                sortOrder: 4
            },
            {
                companyId,
                organisationId,
                code: 'sd_cd_others',
                name: 'SD & CD / Others',
                valueCount: 2,
                formula: '(amount1 * sdCdCount + amount2 * othersCount) * 12',
                valueLabel1: 'SD & CD Amount',
                valueLabel2: 'Others Amount',
                isActive: true,
                sortOrder: 5
            }
        ]
    });
}
async function createPayrollGlobalAssumptions(params) {
    const { companyId, organisationId } = params;
    console.log('Creating payroll global assumptions...');
    const entries = [
        { key: 'FICA_SS', name: 'Social Security Tax Rate', category: 'TAX', sortOrder: 1, value: 6.20 },
        { key: 'FICA_MEDICARE', name: 'Medicare Tax Rate', category: 'TAX', sortOrder: 2, value: 1.45 },
        { key: 'FUTA', name: 'Federal Unemployment Rate', category: 'TAX', sortOrder: 3, value: 0.60 },
        { key: 'HEALTH_INS', name: 'Health Insurance Per Employee', category: 'BENEFIT', sortOrder: 4, value: 6000.00 },
        { key: 'DENTAL_INS', name: 'Dental Insurance Per Employee', category: 'BENEFIT', sortOrder: 5, value: 600.00 },
        { key: 'VISION_INS', name: 'Vision Insurance Per Employee', category: 'BENEFIT', sortOrder: 6, value: 240.00 },
        { key: '401K_MATCH', name: '401(k) Match Percentage', category: 'RETIREMENT', sortOrder: 7, value: 4.00 },
        { key: 'WORKERS_COMP', name: 'Workers Comp Rate', category: 'INSURANCE', sortOrder: 8, value: 3.00 },
    ];
    for (const entry of entries) {
        await prisma.payrollGlobalAssumption.upsert({
            where: { organisationId_key: { organisationId, key: entry.key } },
            update: {
                name: entry.name, category: entry.category, value: entry.value,
                sortOrder: entry.sortOrder, updatedBy: 'seed'
            },
            create: {
                companyId, organisationId, key: entry.key, name: entry.name,
                category: entry.category, value: entry.value,
                sortOrder: entry.sortOrder, updatedBy: 'seed'
            }
        });
    }
}
async function createPayrollPositionAssumptions(params) {
    const { companyId, organisationId } = params;
    console.log('Creating payroll position assumptions...');
    const positions = [
        { positionCode: 'COMM_DIR', positionName: 'Community Director', classification: 'SD&CD', sortOrder: 1, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 0, workersCompPercentage: 3 }] },
        { positionCode: 'ASST_COMM_DIR', positionName: 'Assistant Community Director', classification: 'SD&CD', sortOrder: 2, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 0, workersCompPercentage: 3 }] },
        { positionCode: 'MKTG_REP', positionName: 'Marketing Representative', classification: 'Others', sortOrder: 3, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 0, workersCompPercentage: 3 }] },
        { positionCode: 'PET_CTR_MGR', positionName: 'Pet Center Manager', classification: 'Others', sortOrder: 4, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 0, workersCompPercentage: 3 }] },
        { positionCode: 'SVC_DIR', positionName: 'Service Director', classification: 'SD&CD', sortOrder: 5, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 0, workersCompPercentage: 3 }] },
        { positionCode: 'MAINT_TECH', positionName: 'Maintenance Technician', classification: 'Others', sortOrder: 6, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 0, workersCompPercentage: 3 }] },
        { positionCode: 'GRNDSKEEPER', positionName: 'Groundskeeper', classification: 'Others', sortOrder: 7, ownerValues: [{ ownerName: 'Default Owner', overtimeHoursPerMonth: 4, workersCompPercentage: 5 }] },
    ];
    for (const pos of positions) {
        const position = await prisma.payrollPositionAssumption.upsert({
            where: { organisationId_positionCode: { organisationId, positionCode: pos.positionCode } },
            update: {
                positionName: pos.positionName,
                classification: pos.classification, active: true,
                sortOrder: pos.sortOrder, updatedBy: 'seed'
            },
            create: {
                companyId, organisationId,
                positionCode: pos.positionCode, positionName: pos.positionName,
                classification: pos.classification,
                active: true, sortOrder: pos.sortOrder, updatedBy: 'seed'
            }
        });
        for (const ov of pos.ownerValues) {
            await prisma.payrollPositionOwnerValue.upsert({
                where: { positionId_ownerName: { positionId: position.id, ownerName: ov.ownerName } },
                update: {
                    overtimeHoursPerMonth: ov.overtimeHoursPerMonth,
                    workersCompPercentage: ov.workersCompPercentage,
                    overheadSupportEmp: 0, updatedBy: 'seed'
                },
                create: {
                    positionId: position.id, companyId, organisationId,
                    ownerName: ov.ownerName,
                    overtimeHoursPerMonth: ov.overtimeHoursPerMonth,
                    workersCompPercentage: ov.workersCompPercentage,
                    overheadSupportEmp: 0, updatedBy: 'seed'
                }
            });
        }
    }
}
const SALARY_MEASURE_LINES = [
    { measureCode: PayrollSalaryMeasureCode.SALARY_PER_HOUR, measureName: 'Salary Per Hour', isEditable: true },
    { measureCode: PayrollSalaryMeasureCode.SALARY, measureName: 'Salary', isEditable: true },
    { measureCode: PayrollSalaryMeasureCode.OT_PAY, measureName: 'OT Pay', isEditable: true },
    { measureCode: PayrollSalaryMeasureCode.TOTAL_SALARY, measureName: 'Total Salary', isEditable: false },
    { measureCode: PayrollSalaryMeasureCode.BONUS, measureName: 'Bonus', isEditable: true },
    { measureCode: PayrollSalaryMeasureCode.EMPLOYEE_UNIT, measureName: 'Employee Unit', isEditable: true },
];
async function createPayrollSalaryDetails(params) {
    const { companyId, organisationId, propertyId, fiscalYear } = params;
    console.log('Creating payroll salary details and lines...');
    const positions = await prisma.payrollPositionAssumption.findMany({
        where: { companyId, organisationId },
        select: { id: true },
    });
    for (const pos of positions) {
        const detail = await prisma.payrollSalaryDetail.upsert({
            where: {
                companyId_organisationId_propertyId_positionAssumptionId_fiscalYear: {
                    companyId, organisationId, propertyId,
                    positionAssumptionId: pos.id,
                    fiscalYear,
                },
            },
            update: { updatedBy: 'seed' },
            create: {
                companyId, organisationId, propertyId,
                positionAssumptionId: pos.id,
                fiscalYear,
                salaryType: PayrollSalaryType.FULL_TIME,
                createdBy: 'seed',
                updatedBy: 'seed',
            },
        });
        for (const line of SALARY_MEASURE_LINES) {
            await prisma.payrollSalaryDetailLine.upsert({
                where: {
                    payrollSalaryDetailId_measureCode: {
                        payrollSalaryDetailId: detail.id,
                        measureCode: line.measureCode,
                    },
                },
                update: { measureName: line.measureName, isEditable: line.isEditable },
                create: {
                    payrollSalaryDetailId: detail.id,
                    measureCode: line.measureCode,
                    measureName: line.measureName,
                    isEditable: line.isEditable,
                },
            });
        }
    }
}
async function createPayrollStateAssumptions(params) {
    const { companyId, organisationId } = params;
    console.log('Creating payroll state assumptions...');
    const entries = [
        { stateCode: 'CA', sutaPercentage: 3.40, sutaAmount: 7000.00 },
        { stateCode: 'TX', sutaPercentage: 2.70, sutaAmount: 9000.00 },
        { stateCode: 'FL', sutaPercentage: 2.10, sutaAmount: 7000.00 },
        { stateCode: 'NY', sutaPercentage: 4.10, sutaAmount: 12500.00 },
        { stateCode: 'IL', sutaPercentage: 3.25, sutaAmount: 13500.00 },
        { stateCode: 'GA', sutaPercentage: 2.70, sutaAmount: 9500.00 },
        { stateCode: 'NC', sutaPercentage: 1.90, sutaAmount: 32000.00 },
        { stateCode: 'WA', sutaPercentage: 1.50, sutaAmount: 68000.00 },
        { stateCode: 'OH', sutaPercentage: 2.80, sutaAmount: 9000.00 },
        { stateCode: 'PA', sutaPercentage: 3.60, sutaAmount: 10000.00 },
    ];
    const stateMasterRows = await prisma.stateMaster.findMany({
        where: { stateCode: { in: entries.map(e => e.stateCode) } },
        select: { stateId: true, stateCode: true },
    });
    const byCode = new Map(stateMasterRows.map(s => [s.stateCode, s.stateId]));
    for (const entry of entries) {
        const stateId = byCode.get(entry.stateCode);
        if (!stateId)
            continue;
        await prisma.payrollStateAssumption.upsert({
            where: { organisationId_stateId: { organisationId, stateId } },
            update: { sutaPercentage: entry.sutaPercentage, sutaAmount: entry.sutaAmount, active: true, updatedBy: 'seed' },
            create: { companyId, organisationId, stateId, sutaPercentage: entry.sutaPercentage, sutaAmount: entry.sutaAmount, active: true, updatedBy: 'seed' },
        });
    }
}
async function createPayrollStateConfigs(params) {
    const { companyId, organisationId } = params;
    console.log('Creating payroll state configs...');
    await prisma.payrollStateConfig.createMany({
        data: [
            { companyId, organisationId, measure: 'percentage', updatedBy: 'seed' },
            { companyId, organisationId, measure: 'amount', updatedBy: 'seed' }
        ],
        skipDuplicates: true
    });
}
async function createPayrollBenefitAssumptions(params) {
    const { companyId, organisationId } = params;
    console.log('Creating payroll benefit assumptions...');
    const [accounts, methods] = await Promise.all([
        prisma.coaAccount.findMany({
            where: { companyId, organisationId, accountCode: { in: ['61100', '61200', '61300', '61400', '61500'] } },
            select: { id: true, accountCode: true }
        }),
        prisma.payrollMethod.findMany({
            where: { companyId, organisationId },
            select: { id: true, code: true }
        })
    ]);
    const accountMap = new Map(accounts.map(a => [a.accountCode, a.id]));
    const methodMap = new Map(methods.map(m => [m.code, m.id]));
    const entries = [
        { accountCode: '61100', methodCode: 'per_month', amount1: 50, amount2: null },
        { accountCode: '61200', methodCode: 'ft_pt_month', amount1: 500, amount2: 250 },
        { accountCode: '61300', methodCode: 'per_year', amount1: 1000, amount2: null },
        { accountCode: '61400', methodCode: 'office_maint', amount1: 300, amount2: 450 },
        { accountCode: '61500', methodCode: 'per_month', amount1: 25, amount2: null }
    ];
    for (const entry of entries) {
        const coaAccountId = accountMap.get(entry.accountCode);
        const methodId = methodMap.get(entry.methodCode);
        if (!coaAccountId || !methodId) {
            console.warn(`Skipping benefit assumption for ${entry.accountCode}: account or method not found`);
            continue;
        }
        await prisma.payrollBenefitAssumption.upsert({
            where: { organisationId_coaAccountId: { organisationId, coaAccountId } },
            update: { methodId, amount1: entry.amount1, amount2: entry.amount2, updatedBy: 'seed' },
            create: { companyId, organisationId, coaAccountId, methodId, amount1: entry.amount1, amount2: entry.amount2, updatedBy: 'seed' }
        });
    }
}
async function integrationsettings(params) {
    const ids = {
        entrataSourceId: "00005001-2f79-ff92-71d4-43aa25eac701",
        yardiSourceId: "00005001-a252-7a80-d64a-7d7a15ac9702",
        excelSourceId: "00005001-0f4c-2974-f0c4-a199c110b703",
        entrataConfigId: "00005002-d025-8ca0-ba00-a4c2bc4cf701",
        yardiConfigId: "00005002-83c7-861f-9cd7-963bdfe16a02",
        excelConfigId: "00005002-f5b3-4c83-de68-0852447dce03",
        entrataPropertyEntityId: "00005003-77ab-f6e7-2ac2-a644edc0fe01",
        yardiPropertyEntityId: "00005003-96f6-5406-9d8c-0471b63df802",
        excelPropertyEntityId: "00005003-2375-7fec-8fd1-3d32fa8c8703",
        entrataPropertyUnitEntityId: "00005003-71ec-059e-a86d-bffcdc2fb104",
        entrataUnitTypeEntityId: "00005003-d15a-c81e-2ba7-80b12f425305",
        entrataBudgetEntityId: "00005003-68d5-a468-dc45-104dd82c7406",
        entrataGlTreeEntityId: "00005003-2c8f-3cae-5afc-25c375565207",
        entrataBudgetActualEntityId: "00005003-1c46-9a37-867b-57849a785f08",
        propertyClosingsReportDefinitionId: "00005004-3aa6-7abe-d14f-a9d78ca69901",
    };
    const { companyId, organisationId } = params;
    console.log('Creating integration settings...');
    await prisma.integrationPlugin.upsert({
        where: { id: "connector-entrata" },
        update: {
            companyId: params.companyId,
            pluginName: "Entrata Connector",
            version: "1.0.0",
            provider: "BudgetIntegration",
            sourceKind: "PMS",
            sourceType: "entrata",
            manifestJson: {
                pluginId: "connector-entrata",
                supportedSources: ["entrata"],
                supportedEntities: [
                    "Property",
                    "PropertyUnit",
                    "UnitType",
                    "Budget",
                    "ReportData",
                    "GLTree"
                ]
            },
            isActive: true
        },
        create: {
            id: "connector-entrata",
            companyId: params.companyId,
            pluginName: "Entrata Connector",
            version: "1.0.0",
            provider: "BudgetIntegration",
            sourceKind: "PMS",
            sourceType: "entrata",
            manifestJson: {
                pluginId: "connector-entrata",
                supportedSources: ["entrata"],
                supportedEntities: [
                    "Property",
                    "PropertyUnit",
                    "UnitType",
                    "Budget",
                    "ReportData",
                    "GLTree"
                ]
            },
            isActive: true
        }
    });
    await prisma.integrationPlugin.upsert({
        where: { id: "connector-yardi" },
        update: {
            companyId: params.companyId,
            pluginName: "Yardi Connector",
            version: "1.0.0",
            provider: "BudgetIntegration",
            sourceKind: "PMS",
            sourceType: "yardi",
            manifestJson: {
                pluginId: "connector-yardi",
                supportedSources: ["yardi"],
                supportedEntities: ["Property"]
            },
            isActive: false
        },
        create: {
            id: "connector-yardi",
            companyId: params.companyId,
            pluginName: "Yardi Connector",
            version: "1.0.0",
            provider: "BudgetIntegration",
            sourceKind: "PMS",
            sourceType: "yardi",
            manifestJson: {
                pluginId: "connector-yardi",
                supportedSources: ["yardi"],
                supportedEntities: ["Property"]
            },
            isActive: false
        }
    });
    await prisma.integrationPlugin.upsert({
        where: { id: "connector-excel" },
        update: {
            companyId: params.companyId,
            pluginName: "Excel Connector",
            version: "1.0.0",
            provider: "BudgetIntegration",
            sourceKind: "FILE_IMPORT",
            sourceType: "excel",
            manifestJson: {
                pluginId: "connector-excel",
                supportedSources: ["excel"],
                supportedEntities: ["Property"]
            },
            isActive: false
        },
        create: {
            id: "connector-excel",
            companyId: params.companyId,
            pluginName: "Excel Connector",
            version: "1.0.0",
            provider: "BudgetIntegration",
            sourceKind: "FILE_IMPORT",
            sourceType: "excel",
            manifestJson: {
                pluginId: "connector-excel",
                supportedSources: ["excel"],
                supportedEntities: ["Property"]
            },
            isActive: false
        }
    });
    await prisma.integrationSource.upsert({
        where: { id: ids.entrataSourceId },
        update: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            pluginId: "connector-entrata",
            sourceCode: "GALLERY_ENTRATA",
            sourceName: "Gallery Entrata",
            sourceKind: "PMS",
            sourceType: "entrata",
            isPrimary: true,
            isActive: true
        },
        create: {
            id: ids.entrataSourceId,
            companyId: params.companyId,
            organisationId: params.organisationId,
            pluginId: "connector-entrata",
            sourceCode: "GALLERY_ENTRATA",
            sourceName: "Gallery Entrata",
            sourceKind: "PMS",
            sourceType: "entrata",
            isPrimary: true,
            isActive: true
        }
    });
    await prisma.integrationSource.upsert({
        where: { id: ids.yardiSourceId },
        update: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            pluginId: "connector-yardi",
            sourceCode: "GALLERY_YARDI",
            sourceName: "Gallery Yardi",
            sourceKind: "PMS",
            sourceType: "yardi",
            isPrimary: false,
            isActive: false
        },
        create: {
            id: ids.yardiSourceId,
            companyId: params.companyId,
            organisationId: params.organisationId,
            pluginId: "connector-yardi",
            sourceCode: "GALLERY_YARDI",
            sourceName: "Gallery Yardi",
            sourceKind: "PMS",
            sourceType: "yardi",
            isPrimary: false,
            isActive: false
        }
    });
    await prisma.integrationSource.upsert({
        where: { id: ids.excelSourceId },
        update: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            pluginId: "connector-excel",
            sourceCode: "GALLERY_EXCEL",
            sourceName: "Gallery Excel Import",
            sourceKind: "FILE_IMPORT",
            sourceType: "excel",
            isPrimary: false,
            isActive: false
        },
        create: {
            id: ids.excelSourceId,
            companyId: params.companyId,
            organisationId: params.organisationId,
            pluginId: "connector-excel",
            sourceCode: "GALLERY_EXCEL",
            sourceName: "Gallery Excel Import",
            sourceKind: "FILE_IMPORT",
            sourceType: "excel",
            isPrimary: false,
            isActive: false
        }
    });
    await prisma.integrationSourceConfig.upsert({
        where: { id: ids.entrataConfigId },
        update: {
            integrationSourceId: ids.entrataSourceId,
            connectionJson: {
                baseUrl: "https://apis.entrata.com",
                orgSlug: "galleryresidential"
            },
            credentialsJson: {
                authType: "apikey",
                apiKeyRef: "env://ENTRATA_API_KEY"
            },
            syncSettingsJson: {
                syncMode: "incremental"
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataConfigId,
            integrationSourceId: ids.entrataSourceId,
            connectionJson: {
                baseUrl: "https://apis.entrata.com",
                orgSlug: "galleryresidential"
            },
            credentialsJson: {
                authType: "apikey",
                apiKeyRef: "env://ENTRATA_API_KEY"
            },
            syncSettingsJson: {
                syncMode: "incremental"
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceConfig.upsert({
        where: { id: ids.yardiConfigId },
        update: {
            integrationSourceId: ids.yardiSourceId,
            connectionJson: Prisma.JsonNull,
            credentialsJson: Prisma.JsonNull,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.yardiConfigId,
            integrationSourceId: ids.yardiSourceId,
            connectionJson: Prisma.JsonNull,
            credentialsJson: Prisma.JsonNull,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceConfig.upsert({
        where: { id: ids.excelConfigId },
        update: {
            integrationSourceId: ids.excelSourceId,
            connectionJson: {
                uploadMode: "manual"
            },
            credentialsJson: Prisma.JsonNull,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.excelConfigId,
            integrationSourceId: ids.excelSourceId,
            connectionJson: {
                uploadMode: "manual"
            },
            credentialsJson: Prisma.JsonNull,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.entrataPropertyEntityId },
        update: {
            integrationSourceId: ids.entrataSourceId,
            entityName: "Property",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 1,
            syncSettingsJson: {
                schedule: "0 */1 * * *",
                batchSize: 50,
                syncMode: "incremental",
                minDelayMs: 1200
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataPropertyEntityId,
            integrationSourceId: ids.entrataSourceId,
            entityName: "Property",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 1,
            syncSettingsJson: {
                schedule: "0 */1 * * *",
                batchSize: 50,
                syncMode: "incremental",
                minDelayMs: 1200
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.entrataPropertyUnitEntityId },
        update: {
            integrationSourceId: ids.entrataSourceId,
            entityName: "PropertyUnit",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 2,
            syncSettingsJson: {
                schedule: "*/10 * * * *",
                propertyBatchSize: 1,
                transformBatchSize: 50,
                syncMode: "incremental",
                minDelayMs: 1200,
                availableUnitsOnly: false,
                usePropertyPreferences: false,
                includeDisabledFloorplans: false,
                includeDisabledUnits: true
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataPropertyUnitEntityId,
            integrationSourceId: ids.entrataSourceId,
            entityName: "PropertyUnit",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 2,
            syncSettingsJson: {
                schedule: "*/10 * * * *",
                propertyBatchSize: 1,
                transformBatchSize: 50,
                syncMode: "incremental",
                minDelayMs: 1200,
                availableUnitsOnly: false,
                usePropertyPreferences: false,
                includeDisabledFloorplans: false,
                includeDisabledUnits: true
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.entrataUnitTypeEntityId },
        update: {
            integrationSourceId: ids.entrataSourceId,
            entityName: "UnitType",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 3,
            syncSettingsJson: {
                schedule: "*/15 * * * *",
                propertyBatchSize: 1,
                transformBatchSize: 50,
                syncMode: "incremental",
                minDelayMs: 1200
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataUnitTypeEntityId,
            integrationSourceId: ids.entrataSourceId,
            entityName: "UnitType",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 3,
            syncSettingsJson: {
                schedule: "*/15 * * * *",
                propertyBatchSize: 1,
                transformBatchSize: 50,
                syncMode: "incremental",
                minDelayMs: 1200
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.entrataBudgetEntityId },
        update: {
            integrationSourceId: ids.entrataSourceId,
            entityName: "Budget",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 4,
            syncSettingsJson: {
                schedule: "*/30 * * * *",
                propertyBatchSize: 1,
                transformBatchSize: 25,
                syncMode: "incremental",
                minDelayMs: 1200,
                budgetIds: "",
                budgetStatusTypeIds: ""
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataBudgetEntityId,
            integrationSourceId: ids.entrataSourceId,
            entityName: "Budget",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 4,
            syncSettingsJson: {
                schedule: "*/30 * * * *",
                propertyBatchSize: 1,
                transformBatchSize: 25,
                syncMode: "incremental",
                minDelayMs: 1200,
                budgetIds: "",
                budgetStatusTypeIds: ""
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationReportDefinition.upsert({
        where: {
            integrationSourceId_reportCode: {
                integrationSourceId: ids.entrataSourceId,
                reportCode: "property_closings"
            }
        },
        update: {
            reportName: "property_closings",
            displayName: "Property Closings",
            description: "Entrata report for AR/AP/GL closing and auto-roll status by property.",
            reportVersion: "1.2",
            methodVersion: "r2",
            entityName: "ReportData",
            endpointPath: "reports",
            methodName: "getReportData",
            paramsSchemaJson: {
                type: "object",
                required: ["filters"],
                properties: {
                    filters: {
                        type: "object",
                        required: ["property_group_ids"],
                        properties: {
                            property_group_ids: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            display_locked_through_period: {
                                type: "string",
                                enum: ["0", "1"]
                            },
                            display_auto_roll_days: {
                                type: "string",
                                enum: ["0", "1"]
                            }
                        }
                    }
                }
            },
            defaultParamsJson: {
                filters: {
                    display_locked_through_period: "1",
                    display_auto_roll_days: "1"
                }
            },
            sourceKeyFieldsJson: ["property", "current_ar", "current_ap", "current_gl"],
            syncSettingsJson: {
                schedule: "*/30 * * * *",
                minDelayMs: 7000,
                requestBatchSize: 500,
                batchFilterKey: "property_group_ids",
                batchSource: "MappedProperties",
                transformBatchSize: 100
            },
            isSystemDefined: true,
            isCustomReport: false,
            isEnabled: true
        },
        create: {
            id: ids.propertyClosingsReportDefinitionId,
            companyId: params.companyId,
            organisationId: params.organisationId,
            integrationSourceId: ids.entrataSourceId,
            reportCode: "property_closings",
            reportName: "property_closings",
            displayName: "Property Closings",
            description: "Entrata report for AR/AP/GL closing and auto-roll status by property.",
            reportVersion: "1.2",
            methodVersion: "r2",
            entityName: "ReportData",
            endpointPath: "reports",
            methodName: "getReportData",
            paramsSchemaJson: {
                type: "object",
                required: ["filters"],
                properties: {
                    filters: {
                        type: "object",
                        required: ["property_group_ids"],
                        properties: {
                            property_group_ids: {
                                type: "array",
                                items: {
                                    type: "string"
                                }
                            },
                            display_locked_through_period: {
                                type: "string",
                                enum: ["0", "1"]
                            },
                            display_auto_roll_days: {
                                type: "string",
                                enum: ["0", "1"]
                            }
                        }
                    }
                }
            },
            defaultParamsJson: {
                filters: {
                    display_locked_through_period: "1",
                    display_auto_roll_days: "1"
                }
            },
            sourceKeyFieldsJson: ["property", "current_ar", "current_ap", "current_gl"],
            syncSettingsJson: {
                schedule: "*/30 * * * *",
                minDelayMs: 7000,
                timeoutMs: 30000,
                maxRetries: 3,
                retryBaseDelayMs: 60000,
                requestBatchSize: 500,
                batchFilterKey: "property_group_ids",
                transformBatchSize: 100
            },
            isSystemDefined: true,
            isCustomReport: false,
            isEnabled: true
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.yardiPropertyEntityId },
        update: {
            integrationSourceId: ids.yardiSourceId,
            entityName: "Property",
            isEnabled: false,
            syncMode: "manual",
            isAuthoritative: false,
            priorityOrder: 1,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.yardiPropertyEntityId,
            integrationSourceId: ids.yardiSourceId,
            entityName: "Property",
            isEnabled: false,
            syncMode: "manual",
            isAuthoritative: false,
            priorityOrder: 1,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.excelPropertyEntityId },
        update: {
            integrationSourceId: ids.excelSourceId,
            entityName: "Property",
            isEnabled: false,
            syncMode: "manual",
            isAuthoritative: false,
            priorityOrder: 1,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.excelPropertyEntityId,
            integrationSourceId: ids.excelSourceId,
            entityName: "Property",
            isEnabled: false,
            syncMode: "manual",
            isAuthoritative: false,
            priorityOrder: 1,
            syncSettingsJson: {
                syncMode: "manual"
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: { id: ids.entrataGlTreeEntityId },
        update: {
            integrationSourceId: ids.entrataSourceId,
            entityName: "GlTree",
            isEnabled: true,
            syncMode: "full",
            isAuthoritative: true,
            priorityOrder: 5,
            syncSettingsJson: {
                schedule: "*/30 * * * *",
                transformBatchSize: 100,
                syncMode: "full",
                minDelayMs: 7000,
                methodName: "getGlTrees",
                methodVersion: "r2",
                glTreeId: "",
                glBranchId: "",
                glGroupTypeId: "",
                glTreeTypeId: "",
                accountNumbers: ""
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataGlTreeEntityId,
            integrationSourceId: ids.entrataSourceId,
            entityName: "GlTree",
            isEnabled: true,
            syncMode: "full",
            isAuthoritative: true,
            priorityOrder: 5,
            syncSettingsJson: {
                schedule: "*/30 * * * *",
                transformBatchSize: 100,
                syncMode: "full",
                minDelayMs: 7000,
                methodName: "getGlTrees",
                methodVersion: "r2",
                glTreeId: "",
                glBranchId: "",
                glGroupTypeId: "",
                glTreeTypeId: "",
                accountNumbers: ""
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
    await prisma.integrationSourceEntity.upsert({
        where: {
            id: ids.entrataBudgetActualEntityId
        },
        update: {
            integrationSourceId: ids.entrataSourceId,
            entityName: "BudgetActual",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 6,
            syncSettingsJson: {
                schedule: "0 3 * * *",
                propertyBatchSize: 1,
                transformBatchSize: 100,
                syncMode: "incremental",
                minDelayMs: 7000,
                accountingMethod: "Accrual",
                budgetStatusTypeId: 1,
                resyncLastNMonths: 2,
                initialSyncStrategy: "all_closed_months",
                useGlLockedThrough: true
            },
            mappingProfileJson: Prisma.JsonNull
        },
        create: {
            id: ids.entrataBudgetActualEntityId,
            integrationSourceId: ids.entrataSourceId,
            entityName: "BudgetActual",
            isEnabled: true,
            syncMode: "incremental",
            isAuthoritative: true,
            priorityOrder: 6,
            syncSettingsJson: {
                schedule: "0 3 * * *",
                propertyBatchSize: 1,
                transformBatchSize: 100,
                syncMode: "incremental",
                minDelayMs: 7000,
                accountingMethod: "Accrual",
                budgetStatusTypeId: 1,
                resyncLastNMonths: 2,
                initialSyncStrategy: "all_closed_months",
                useGlLockedThrough: true
            },
            mappingProfileJson: Prisma.JsonNull
        }
    });
}
main()
    .catch((error) => {
    console.error('Seed failed.');
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map