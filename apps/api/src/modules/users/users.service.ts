import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserGender, UserStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PasswordHasher } from '../auth/password.hasher';
import { Permissions } from '../rbac/constants/permissions';
import { Roles } from '../rbac/constants/roles';
import { UserLifecycleService } from './user-lifecycle.service';
import type {
  CreateUserDto,
  CrmUpdateUserDto,
  UpdateOwnProfileDto,
  UpdateUserDto,
} from './dto/user.dto';

const userAdminInclude = {
  roleAssignments: {
    where: { revokedAt: null },
    include: { role: true },
  },
  staffProfile: true,
  accountSecurityState: true,
} satisfies Prisma.UserInclude;

type UserAdminInclude = {
  roleAssignments: Array<{
    role: { id: string; code: string; slug: string; name: string };
  }>;
  staffProfile: {
    id: string;
    title: string | null;
    credentialsDisplay: string | null;
    department: string | null;
    crmPreferences: Prisma.JsonValue;
  } | null;
  accountSecurityState: {
    failedLoginCount: number;
    lockedUntil: Date | null;
  } | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: UserLifecycleService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async listAdmin(params: {
    q?: string;
    status?: UserStatus | 'ALL';
    role?: string;
    kind?: 'staff' | 'patient';
    skip?: number;
    take?: number;
  }) {
    const where = this.buildListWhere(params);
    const [items, total, statusCounts, roleCounts] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: userAdminInclude,
        orderBy: { createdAt: 'desc' },
        skip: params.skip ?? 0,
        take: Math.min(params.take ?? 50, 100),
      }),
      this.prisma.user.count({ where }),
      this.countByStatus(),
      this.countByRole(),
    ]);

    return {
      items: items.map((u) => this.toAdminDto(u)),
      total,
      statusCounts,
      roleCounts,
    };
  }

  async listCrm(params: {
    q?: string;
    status?: UserStatus | 'ALL';
    skip?: number;
    take?: number;
  }) {
    const statusFilter =
      !params.status || params.status === 'ALL'
        ? {
            status: {
              in: [
                UserStatus.ACTIVE,
                UserStatus.PENDING_VERIFICATION,
                UserStatus.SUSPENDED,
                UserStatus.INACTIVE,
              ],
            },
            deletedAt: null,
          }
        : {
            status: params.status,
            deletedAt: null,
          };

    const where: Prisma.UserWhereInput = {
      ...statusFilter,
      ...(params.q
        ? {
            OR: [
              { email: { contains: params.q, mode: 'insensitive' } },
              { displayName: { contains: params.q, mode: 'insensitive' } },
              { firstName: { contains: params.q, mode: 'insensitive' } },
              { lastName: { contains: params.q, mode: 'insensitive' } },
              { phone: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: userAdminInclude,
        orderBy: { updatedAt: 'desc' },
        skip: params.skip ?? 0,
        take: Math.min(params.take ?? 50, 100),
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.toCrmDto(u)),
      total,
    };
  }

  async getAdminById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id },
      include: userAdminInclude,
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'User not found',
      });
    }
    return this.toAdminDto(user);
  }

  async getCrmById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        status: { notIn: [UserStatus.DELETED] },
      },
      include: userAdminInclude,
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'User not found',
      });
    }
    return this.toCrmDto(user);
  }

  async createStaff(dto: CreateUserDto, actorId?: string) {
    const email = dto.email.trim().toLowerCase();
    await this.assertEmailAvailable(email);

    const roleCodes =
      dto.roleCodes && dto.roleCodes.length > 0
        ? dto.roleCodes
        : [Roles.SUPPORT];

    if (roleCodes.includes(Roles.PATIENT) && roleCodes.length === 1) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Staff create requires at least one staff role',
      });
    }

    const roles = await this.resolveRoles(roleCodes);
    const passwordHash = await this.passwordHasher.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        status: UserStatus.ACTIVE,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName:
          dto.displayName ??
          ([dto.firstName, dto.lastName].filter(Boolean).join(' ') || null),
        phone: dto.phone,
        roleAssignments: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
        staffProfile: dto.staffProfile
          ? {
              create: {
                title: dto.staffProfile.title,
                credentialsDisplay: dto.staffProfile.credentialsDisplay,
                department: dto.staffProfile.department,
                crmPreferences: dto.staffProfile.crmPreferences as
                  Prisma.InputJsonValue | undefined,
              },
            }
          : { create: {} },
        accountSecurityState: { create: {} },
      },
      include: userAdminInclude,
    });

    await this.recordHistory(user.id, actorId, 'create', {
      email,
      roles: roleCodes,
    });
    await this.recordActivity(
      user.id,
      actorId,
      'created',
      'Staff user created',
    );

    return this.toAdminDto(user);
  }

  async updateAdmin(id: string, dto: UpdateUserDto, actorId?: string) {
    await this.getRawById(id);

    const data: Prisma.UserUpdateInput = {
      ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
      ...(dto.displayName !== undefined
        ? { displayName: dto.displayName }
        : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      ...(dto.avatarMediaAssetId !== undefined
        ? { avatarMediaAssetId: dto.avatarMediaAssetId }
        : {}),
      ...(dto.dateOfBirth !== undefined
        ? {
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
          }
        : {}),
      ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
      ...(dto.region !== undefined ? { region: dto.region } : {}),
      ...(dto.healthCardMediaAssetId !== undefined
        ? { healthCardMediaAssetId: dto.healthCardMediaAssetId }
        : {}),
      ...(dto.billingAddress !== undefined
        ? {
            billingAddress:
              dto.billingAddress === null
                ? Prisma.JsonNull
                : (dto.billingAddress as Prisma.InputJsonValue),
          }
        : {}),
      ...(dto.shippingAddress !== undefined
        ? {
            shippingAddress:
              dto.shippingAddress === null
                ? Prisma.JsonNull
                : (dto.shippingAddress as Prisma.InputJsonValue),
          }
        : {}),
      ...(dto.preferences !== undefined
        ? {
            preferences:
              dto.preferences === null
                ? Prisma.JsonNull
                : (dto.preferences as Prisma.InputJsonValue),
          }
        : {}),
      ...(dto.internalNotes !== undefined
        ? { internalNotes: dto.internalNotes }
        : {}),
      ...(dto.stripeCustomerIdLive !== undefined
        ? { stripeCustomerIdLive: dto.stripeCustomerIdLive }
        : {}),
      ...(dto.stripeCustomerIdTest !== undefined
        ? { stripeCustomerIdTest: dto.stripeCustomerIdTest }
        : {}),
    };

    if (dto.staffProfile !== undefined) {
      if (dto.staffProfile === null) {
        await this.prisma.staffProfile.deleteMany({ where: { userId: id } });
      } else {
        await this.prisma.staffProfile.upsert({
          where: { userId: id },
          create: {
            userId: id,
            title: dto.staffProfile.title,
            credentialsDisplay: dto.staffProfile.credentialsDisplay,
            department: dto.staffProfile.department,
            crmPreferences: dto.staffProfile.crmPreferences as
              Prisma.InputJsonValue | undefined,
          },
          update: {
            title: dto.staffProfile.title,
            credentialsDisplay: dto.staffProfile.credentialsDisplay,
            department: dto.staffProfile.department,
            crmPreferences: dto.staffProfile.crmPreferences as
              Prisma.InputJsonValue | undefined,
          },
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      include: userAdminInclude,
    });

    await this.recordHistory(
      id,
      actorId,
      'update',
      dto as unknown as Prisma.InputJsonValue,
    );
    await this.recordActivity(id, actorId, 'updated', 'User profile updated');

    return this.toAdminDto(updated);
  }

  async updateCrm(id: string, dto: CrmUpdateUserDto, actorId?: string) {
    await this.getCrmById(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.dateOfBirth !== undefined
          ? {
              dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            }
          : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.region !== undefined ? { region: dto.region } : {}),
        ...(dto.internalNotes !== undefined
          ? { internalNotes: dto.internalNotes }
          : {}),
        ...(dto.billingAddress !== undefined
          ? {
              billingAddress:
                dto.billingAddress === null
                  ? Prisma.JsonNull
                  : (dto.billingAddress as Prisma.InputJsonValue),
            }
          : {}),
        ...(dto.shippingAddress !== undefined
          ? {
              shippingAddress:
                dto.shippingAddress === null
                  ? Prisma.JsonNull
                  : (dto.shippingAddress as Prisma.InputJsonValue),
            }
          : {}),
      },
      include: userAdminInclude,
    });

    await this.recordHistory(
      id,
      actorId,
      'crm_update',
      dto as unknown as Prisma.InputJsonValue,
    );
    await this.recordActivity(
      id,
      actorId,
      'crm_updated',
      'Operational fields updated via CRM',
    );

    return this.toCrmDto(updated);
  }

  async getOwnProfile(userId: string) {
    const user = await this.getRawById(userId);
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      phone: user.phone,
      bio: user.bio,
      avatarMediaAssetId: user.avatarMediaAssetId,
      preferences: user.preferences,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.avatarMediaAssetId !== undefined
          ? { avatarMediaAssetId: dto.avatarMediaAssetId }
          : {}),
        ...(dto.preferences !== undefined
          ? {
              preferences:
                dto.preferences === null
                  ? Prisma.JsonNull
                  : (dto.preferences as Prisma.InputJsonValue),
            }
          : {}),
      },
    });

    await this.recordHistory(
      userId,
      userId,
      'profile_update',
      dto as unknown as Prisma.InputJsonValue,
    );
    return this.getOwnProfile(updated.id);
  }

  async listRoles(id: string) {
    await this.getRawById(id);
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId: id, revokedAt: null },
      include: { role: true },
      orderBy: { assignedAt: 'asc' },
    });
    return assignments.map((a) => ({
      code: a.role.code,
      slug: a.role.slug,
      name: a.role.name,
    }));
  }

  async replaceRoles(id: string, roleCodes: string[], actorId?: string) {
    const user = await this.getRawById(id);
    const currentCodes = await this.activeRoleCodes(id);

    const removingAdminCapability =
      currentCodes.some((c) =>
        [Roles.ADMINISTRATOR, Roles.SUPER_ADMINISTRATOR].includes(
          c as typeof Roles.ADMINISTRATOR,
        ),
      ) &&
      !roleCodes.some((c) =>
        [Roles.ADMINISTRATOR, Roles.SUPER_ADMINISTRATOR].includes(
          c as typeof Roles.ADMINISTRATOR,
        ),
      );

    if (removingAdminCapability) {
      await this.assertNotLastAdmin(id);
    }

    const roles = await this.resolveRoles(roleCodes);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      for (const role of roles) {
        await tx.userRoleAssignment.upsert({
          where: {
            userId_roleId: { userId: id, roleId: role.id },
          },
          create: { userId: id, roleId: role.id },
          update: { revokedAt: null, assignedAt: new Date() },
        });
      }

      await tx.user.update({
        where: { id },
        data: { tokenVersion: { increment: 1 } },
      });

      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.recordHistory(id, actorId, 'roles', {
      from: currentCodes,
      to: roleCodes,
    });
    await this.recordActivity(
      id,
      actorId,
      'roles_replaced',
      `Roles → ${roleCodes.join(', ') || '(none)'}`,
      { from: currentCodes, to: roleCodes },
    );

    void user;
    return this.getAdminById(id);
  }

  async transition(
    id: string,
    target: UserStatus,
    actorId?: string,
    options?: { classD?: boolean },
  ) {
    const user = await this.getRawById(id);
    this.lifecycle.assertTransition(user.status, target);

    // Defence in depth: archive/delete/restore must arrive through the Class D
    // methods, which carry the last-admin safeguard and their own permissions.
    const isClassDTarget =
      target === UserStatus.ARCHIVED ||
      target === UserStatus.DELETED ||
      (user.status === UserStatus.ARCHIVED && target === UserStatus.ACTIVE);

    if (isClassDTarget && !options?.classD) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_MISSING_PERMISSION,
        message: 'Archive, restore, and delete require their Class D endpoints',
      });
    }

    const revokeSessions =
      target === UserStatus.SUSPENDED ||
      target === UserStatus.INACTIVE ||
      target === UserStatus.ARCHIVED ||
      target === UserStatus.DELETED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id },
        data: {
          status: target,
          ...(target === UserStatus.ARCHIVED ? { archivedAt: new Date() } : {}),
          ...(target === UserStatus.DELETED ? { deletedAt: new Date() } : {}),
          ...(target === UserStatus.ACTIVE
            ? { archivedAt: null, deletedAt: null }
            : {}),
          ...(revokeSessions ? { tokenVersion: { increment: 1 } } : {}),
        },
        include: userAdminInclude,
      });

      if (revokeSessions) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return next;
    });

    await this.recordHistory(id, actorId, 'lifecycle', {
      from: user.status,
      to: target,
    });
    await this.recordActivity(
      id,
      actorId,
      'lifecycle',
      `Lifecycle → ${target}`,
      { from: user.status, to: target },
    );

    return this.toAdminDto(updated);
  }

  async suspend(id: string, actorId?: string) {
    await this.assertNotLastAdmin(id);
    return this.transition(id, UserStatus.SUSPENDED, actorId);
  }

  async deactivate(id: string, actorId?: string) {
    await this.assertNotLastAdmin(id);
    return this.transition(id, UserStatus.INACTIVE, actorId);
  }

  async reactivate(id: string, actorId?: string) {
    const user = await this.getRawById(id);
    if (
      user.status !== UserStatus.SUSPENDED &&
      user.status !== UserStatus.INACTIVE &&
      user.status !== UserStatus.PENDING_VERIFICATION
    ) {
      throw new BadRequestException({
        code: ErrorCodes.USR_INVALID_TRANSITION,
        message: `Cannot reactivate from ${user.status}`,
      });
    }
    return this.transition(id, UserStatus.ACTIVE, actorId);
  }

  async archive(id: string, actorId?: string) {
    await this.assertNotLastAdmin(id);
    return this.transition(id, UserStatus.ARCHIVED, actorId, { classD: true });
  }

  async restore(id: string, actorId?: string) {
    const user = await this.getRawById(id);
    if (
      user.status !== UserStatus.ARCHIVED &&
      user.status !== UserStatus.DELETED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.USR_INVALID_TRANSITION,
        message: `Cannot restore from ${user.status}`,
      });
    }

    // Soft-deleted users restore via archived → active path: allow deleted → active
    // by temporarily treating as archived restore.
    if (user.status === UserStatus.DELETED) {
      await this.prisma.user.update({
        where: { id },
        data: { status: UserStatus.ARCHIVED, deletedAt: null },
      });
    }

    return this.transition(id, UserStatus.ACTIVE, actorId, { classD: true });
  }

  async softDelete(id: string, actorId?: string) {
    await this.assertNotLastAdmin(id);
    const user = await this.getRawById(id);

    if (user.status !== UserStatus.ARCHIVED) {
      // Must archive first per lifecycle, or allow archived → deleted only.
      this.lifecycle.assertTransition(user.status, UserStatus.ARCHIVED);
      await this.transition(id, UserStatus.ARCHIVED, actorId, { classD: true });
    }

    return this.transition(id, UserStatus.DELETED, actorId, { classD: true });
  }

  async listHistory(id: string) {
    await this.getRawById(id);
    return this.prisma.userChangeHistory.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listActivity(id: string) {
    await this.getRawById(id);
    return this.prisma.userActivity.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async recordActivityPublic(
    userId: string,
    actorId: string | undefined,
    kind: string,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.recordActivity(userId, actorId, kind, summary, metadata);
  }

  async countByStatus() {
    const rows = await this.prisma.user.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts: Record<string, number> = {
      ALL: 0,
      PENDING_VERIFICATION: 0,
      ACTIVE: 0,
      SUSPENDED: 0,
      INACTIVE: 0,
      ARCHIVED: 0,
      DELETED: 0,
    };
    for (const row of rows) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    return counts;
  }

  async countByRole() {
    const staffRoles = [
      Roles.PATIENT,
      Roles.DOCTOR,
      Roles.PHARMACIST,
      Roles.SUPPORT,
      Roles.OPERATIONS,
      Roles.MARKETING,
      Roles.CONTENT,
      Roles.ADMINISTRATOR,
      Roles.SUPER_ADMINISTRATOR,
    ];
    const counts: Record<string, number> = {};
    for (const code of staffRoles) {
      counts[code] = await this.prisma.userRoleAssignment.count({
        where: {
          revokedAt: null,
          role: { code },
          user: { deletedAt: null, status: { not: UserStatus.DELETED } },
        },
      });
    }
    return counts;
  }

  /**
   * Last-admin safeguard (RBAC-035 / GRD-149): refuse operations that would
   * leave no active principal holding PERM-ADM-001.
   */
  async assertNotLastAdmin(userId: string): Promise<void> {
    const targetHoldsManage = await this.userHoldsPermission(
      userId,
      Permissions.ADM_MANAGE_USERS,
    );
    if (!targetHoldsManage) {
      return;
    }

    const adminUserIds = await this.activeAdminUserIds();
    const others = adminUserIds.filter((id) => id !== userId);
    if (others.length === 0) {
      throw new ForbiddenException({
        code: ErrorCodes.USR_LAST_ADMIN,
        message:
          'Cannot remove or disable the last active administrator (last-admin safeguard)',
      });
    }
  }

  private async activeAdminUserIds(): Promise<string[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: {
        revokedAt: null,
        role: {
          rolePermissions: {
            some: { permission: { code: Permissions.ADM_MANAGE_USERS } },
          },
        },
        user: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return assignments.map((a) => a.userId);
  }

  private async userHoldsPermission(
    userId: string,
    permissionCode: string,
  ): Promise<boolean> {
    const count = await this.prisma.userRoleAssignment.count({
      where: {
        userId,
        revokedAt: null,
        role: {
          rolePermissions: {
            some: { permission: { code: permissionCode } },
          },
        },
      },
    });
    return count > 0;
  }

  private buildListWhere(params: {
    q?: string;
    status?: UserStatus | 'ALL';
    role?: string;
    kind?: 'staff' | 'patient';
  }): Prisma.UserWhereInput {
    const statusWhere: Prisma.UserWhereInput =
      !params.status || params.status === 'ALL'
        ? {}
        : params.status === UserStatus.DELETED
          ? { status: UserStatus.DELETED }
          : params.status === UserStatus.ARCHIVED
            ? { status: UserStatus.ARCHIVED, deletedAt: null }
            : { status: params.status, deletedAt: null };

    const kindWhere: Prisma.UserWhereInput =
      params.kind === 'patient'
        ? {
            roleAssignments: {
              some: {
                revokedAt: null,
                role: { code: Roles.PATIENT },
              },
            },
          }
        : params.kind === 'staff'
          ? {
              roleAssignments: {
                some: {
                  revokedAt: null,
                  role: { code: { not: Roles.PATIENT } },
                },
              },
            }
          : {};

    const roleWhere: Prisma.UserWhereInput = params.role
      ? {
          roleAssignments: {
            some: {
              revokedAt: null,
              role: { code: params.role },
            },
          },
        }
      : {};

    return {
      ...statusWhere,
      ...kindWhere,
      ...roleWhere,
      ...(params.q
        ? {
            OR: [
              { email: { contains: params.q, mode: 'insensitive' } },
              { displayName: { contains: params.q, mode: 'insensitive' } },
              { firstName: { contains: params.q, mode: 'insensitive' } },
              { lastName: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async getRawById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }

  private async assertEmailAvailable(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.USR_EMAIL_CONFLICT,
        message: 'Email already registered',
      });
    }
  }

  private async resolveRoles(roleCodes: string[]) {
    const unique = [...new Set(roleCodes)];
    const roles = await this.prisma.role.findMany({
      where: { code: { in: unique } },
    });
    if (roles.length !== unique.length) {
      const found = new Set(roles.map((r) => r.code));
      const missing = unique.filter((c) => !found.has(c));
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: `Unknown role codes: ${missing.join(', ')}`,
      });
    }
    return roles;
  }

  private async activeRoleCodes(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId, revokedAt: null },
      include: { role: true },
    });
    return assignments.map((a) => a.role.code);
  }

  private toAdminDto(
    user: {
      id: string;
      email: string;
      status: UserStatus;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      phone: string | null;
      bio: string | null;
      avatarMediaAssetId: string | null;
      dateOfBirth: Date | null;
      gender: UserGender;
      region: string | null;
      healthCardMediaAssetId: string | null;
      billingAddress: Prisma.JsonValue;
      shippingAddress: Prisma.JsonValue;
      stripeCustomerIdLive: string | null;
      stripeCustomerIdTest: string | null;
      preferences: Prisma.JsonValue;
      internalNotes: string | null;
      emailVerifiedAt: Date | null;
      lastActiveAt: Date | null;
      archivedAt: Date | null;
      deletedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      tokenVersion: number;
    } & UserAdminInclude,
  ) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      phone: user.phone,
      bio: user.bio,
      avatarMediaAssetId: user.avatarMediaAssetId,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      region: user.region,
      healthCardMediaAssetId: user.healthCardMediaAssetId,
      billingAddress: user.billingAddress,
      shippingAddress: user.shippingAddress,
      stripeCustomerIdLive: user.stripeCustomerIdLive,
      stripeCustomerIdTest: user.stripeCustomerIdTest,
      preferences: user.preferences,
      internalNotes: user.internalNotes,
      emailVerifiedAt: user.emailVerifiedAt,
      lastActiveAt: user.lastActiveAt,
      archivedAt: user.archivedAt,
      deletedAt: user.deletedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tokenVersion: user.tokenVersion,
      roles: user.roleAssignments.map((a) => ({
        code: a.role.code,
        slug: a.role.slug,
        name: a.role.name,
      })),
      staffProfile: user.staffProfile,
      securitySummary: {
        failedLoginCount: user.accountSecurityState?.failedLoginCount ?? 0,
        lockedUntil: user.accountSecurityState?.lockedUntil ?? null,
        twoFactorStatus: 'unknown' as const,
      },
    };
  }

  private toCrmDto(user: Parameters<UsersService['toAdminDto']>[0]) {
    const full = this.toAdminDto(user);
    return {
      id: full.id,
      email: full.email,
      status: full.status,
      firstName: full.firstName,
      lastName: full.lastName,
      displayName: full.displayName,
      phone: full.phone,
      dateOfBirth: full.dateOfBirth,
      gender: full.gender,
      region: full.region,
      billingAddress: full.billingAddress,
      shippingAddress: full.shippingAddress,
      internalNotes: full.internalNotes,
      roles: full.roles,
      createdAt: full.createdAt,
      updatedAt: full.updatedAt,
      lastActiveAt: full.lastActiveAt,
    };
  }

  private async recordHistory(
    userId: string,
    actorId: string | undefined,
    action: string,
    changes: Prisma.InputJsonValue,
  ) {
    await this.prisma.userChangeHistory.create({
      data: { userId, actorId, action, changes },
    });
  }

  private async recordActivity(
    userId: string,
    actorId: string | undefined,
    kind: string,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.userActivity.create({
      data: { userId, actorId, kind, summary, metadata },
    });
  }
}
