import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { PermissionCode } from './constants/permissions';
import type { RoleCode } from './constants/roles';
import type {
  PermissionLoader,
  PrincipalAuthorization,
} from './interfaces/permission-loader.interface';

/**
 * Postgres PermissionLoader — active assignments only; unions and dedupes.
 * Revoked roles (revokedAt != null) are excluded.
 */
@Injectable()
export class PostgresPermissionLoader implements PermissionLoader {
  constructor(private readonly prisma: PrismaService) {}

  async loadByUserId(userId: string): Promise<PrincipalAuthorization> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId, revokedAt: null },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const roleSet = new Set<RoleCode>();
    const permissionSet = new Set<PermissionCode>();

    for (const assignment of assignments) {
      roleSet.add(assignment.role.code as RoleCode);
      for (const link of assignment.role.rolePermissions) {
        permissionSet.add(link.permission.code as PermissionCode);
      }
    }

    return {
      roles: [...roleSet],
      permissions: [...permissionSet],
    };
  }
}
