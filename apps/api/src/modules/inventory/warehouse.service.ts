import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WarehouseStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  CreateWarehouseDto,
  UpdatePolicyDto,
  UpdateWarehouseDto,
} from './dto/inventory.dto';

const DEFAULT_WAREHOUSE_CODE = 'DEFAULT';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultWarehouse() {
    const existing = await this.prisma.warehouse.findFirst({
      where: { isDefault: true },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.warehouse.create({
      data: {
        code: DEFAULT_WAREHOUSE_CODE,
        name: 'Default Warehouse',
        status: WarehouseStatus.ACTIVE,
        isDefault: true,
      },
    });
  }

  async resolveWarehouseId(warehouseId?: string | null): Promise<string> {
    if (warehouseId) {
      const wh = await this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
      });
      if (!wh) {
        throw new NotFoundException({
          code: ErrorCodes.INV_WAREHOUSE_INVALID,
          message: 'Warehouse not found',
        });
      }
      return wh.id;
    }
    const def = await this.ensureDefaultWarehouse();
    return def.id;
  }

  list() {
    return this.prisma.warehouse.findMany({
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
  }

  async get(id: string) {
    const wh = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!wh) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Warehouse not found',
      });
    }
    return wh;
  }

  async create(dto: CreateWarehouseDto) {
    const code = dto.code.trim().toUpperCase();
    const clash = await this.prisma.warehouse.findUnique({ where: { code } });
    if (clash) {
      throw new BadRequestException({
        code: ErrorCodes.INV_WAREHOUSE_INVALID,
        message: `Warehouse code already exists: ${code}`,
      });
    }
    return this.prisma.warehouse.create({
      data: {
        code,
        name: dto.name.trim(),
        status: WarehouseStatus.ACTIVE,
        isDefault: false,
      },
    });
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const wh = await this.get(id);
    if (dto.status === WarehouseStatus.INACTIVE && wh.isDefault) {
      const activeOthers = await this.prisma.warehouse.count({
        where: {
          id: { not: id },
          status: WarehouseStatus.ACTIVE,
        },
      });
      if (activeOthers === 0) {
        throw new BadRequestException({
          code: ErrorCodes.INV_WAREHOUSE_INVALID,
          message: 'Cannot deactivate the only active default warehouse',
        });
      }
    }
    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }
}

@Injectable()
export class InventoryPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDefault() {
    const existing = await this.prisma.inventoryPolicy.findUnique({
      where: { code: 'default' },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.inventoryPolicy.create({
      data: { code: 'default' },
    });
  }

  async update(dto: UpdatePolicyDto, userId?: string) {
    await this.getOrCreateDefault();
    return this.prisma.inventoryPolicy.update({
      where: { code: 'default' },
      data: {
        ...(dto.oversellMode !== undefined
          ? { oversellMode: dto.oversellMode }
          : {}),
        ...(dto.reservationTimeoutMinutes !== undefined
          ? { reservationTimeoutMinutes: dto.reservationTimeoutMinutes }
          : {}),
        ...(dto.lowStockThreshold !== undefined
          ? { lowStockThreshold: dto.lowStockThreshold }
          : {}),
        ...(dto.allowNegativeStock !== undefined
          ? { allowNegativeStock: dto.allowNegativeStock }
          : {}),
        ...(dto.allocationStrategy !== undefined
          ? { allocationStrategy: dto.allocationStrategy }
          : {}),
        updatedByUserId: userId ?? null,
      },
    });
  }
}
