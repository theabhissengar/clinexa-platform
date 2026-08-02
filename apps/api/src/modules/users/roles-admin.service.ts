import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Permissions } from '../rbac/constants/permissions';

/** Permissions that must never be stripped from clinical gate evaluation. */
const CLINICAL_GATE_PERMISSIONS = new Set([
  Permissions.CRM_APPROVE_RX,
  Permissions.CRM_DECLINE_RX,
  Permissions.CRM_PHARMACY_REVIEW,
  Permissions.QST_VIEW_FULL_ANSWERS,
]);

@Injectable()
export class RolesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        userAssignments: {
          where: { revokedAt: null },
          select: { id: true },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      slug: role.slug,
      name: role.name,
      description: role.description,
      permissionCodes: role.rolePermissions.map((rp) => rp.permission.code),
      assignedUserCount: role.userAssignments.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: true } },
        userAssignments: {
          where: { revokedAt: null },
          select: { id: true },
        },
      },
    });
    if (!role) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Role not found',
      });
    }
    return {
      id: role.id,
      code: role.code,
      slug: role.slug,
      name: role.name,
      description: role.description,
      permissionCodes: role.rolePermissions.map((rp) => rp.permission.code),
      assignedUserCount: role.userAssignments.length,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
    return permissions.map((p) => ({
      id: p.id,
      code: p.code,
      module: p.module,
      name: p.name,
      description: p.description,
      resource: p.resource,
      action: p.action,
    }));
  }

  async setRolePermissions(roleId: string, permissionCodes: string[]) {
    const role = await this.getRole(roleId);
    const unique = [...new Set(permissionCodes)];

    // Cannot disable clinical gates globally by stripping them from Doctor/Pharmacist
    // when those roles currently hold them — refuse stripping clinical gate perms
    // from roles that are the clinical decision holders.
    if (
      (role.code === 'ROLE-003' || role.code === 'ROLE-004') &&
      [...CLINICAL_GATE_PERMISSIONS].some(
        (code) => role.permissionCodes.includes(code) && !unique.includes(code),
      )
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message:
          'Cannot disable clinical gate permissions globally on Doctor/Pharmacist roles',
      });
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: unique } },
    });
    if (permissions.length !== unique.length) {
      const found = new Set(permissions.map((p) => p.code));
      const missing = unique.filter((c) => !found.has(c));
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: `Unknown permission codes: ${missing.join(', ')}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      for (const permission of permissions) {
        await tx.rolePermission.create({
          data: { roleId, permissionId: permission.id },
        });
      }
    });

    return this.getRole(roleId);
  }
}
