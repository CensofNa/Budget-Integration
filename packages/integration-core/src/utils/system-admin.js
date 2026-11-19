import { Prisma, PrismaClient } from "@prisma/client";
let cachedSystemAdminUserId;
export async function resolveSystemAdminUserId(client) {
    if (cachedSystemAdminUserId !== undefined) {
        return cachedSystemAdminUserId;
    }
    const roleAssignment = await client.systemRoleAssignment.findFirst({
        where: {
            status: "ACTIVE",
            systemRole: {
                code: "SYSTEM_ADMIN"
            }
        },
        orderBy: [{ isCurrent: "desc" }, { assignedAt: "asc" }],
        select: { userId: true }
    });
    if (roleAssignment?.userId) {
        cachedSystemAdminUserId = roleAssignment.userId;
        return cachedSystemAdminUserId;
    }
    const platformAdmin = await client.user.findFirst({
        where: {
            principalType: "PLATFORM",
            status: "ACTIVE"
        },
        orderBy: { createdAt: "asc" },
        select: { id: true }
    });
    cachedSystemAdminUserId = platformAdmin?.id ?? null;
    return cachedSystemAdminUserId;
}
//# sourceMappingURL=system-admin.js.map