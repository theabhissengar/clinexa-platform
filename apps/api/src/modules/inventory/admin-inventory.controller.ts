import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import {
  AdjustStockDto,
  CreateWarehouseDto,
  PurgeInventoryDto,
  ReceiveStockDto,
  UpdatePolicyDto,
  UpdateWarehouseDto,
} from './dto/inventory.dto';
import {
  InventoryAvailabilityService,
  InventoryMovementQueryService,
  InventoryPurgeService,
} from './inventory-query.service';
import {
  InventoryAdjustmentService,
  InventoryReceivingService,
} from './inventory-stock-ops.service';
import { InventoryPolicyService, WarehouseService } from './warehouse.service';

@ApiTags('admin-inventory')
@ApiBearerAuth()
@Controller({ path: 'admin/inventory', version: '1' })
export class AdminInventoryController {
  constructor(
    private readonly availability: InventoryAvailabilityService,
    private readonly movements: InventoryMovementQueryService,
    private readonly adjustments: InventoryAdjustmentService,
    private readonly receiving: InventoryReceivingService,
    private readonly warehouses: WarehouseService,
    private readonly policies: InventoryPolicyService,
    private readonly purgeService: InventoryPurgeService,
  ) {}

  @Get('dashboard')
  @RequirePermissions(Permissions.INV_VIEW)
  @ApiOperation({ summary: 'Inventory dashboard aggregates' })
  dashboard() {
    return this.availability.dashboard();
  }

  @Get('balances')
  @RequirePermissions(Permissions.INV_VIEW)
  @ApiOperation({ summary: 'List balance projections' })
  listBalances(
    @Query('warehouseId') warehouseId?: string,
    @Query('q') q?: string,
    @Query('lowStockOnly') lowStockOnly?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.availability.listBalances({
      warehouseId,
      q,
      lowStockOnly: lowStockOnly === 'true' || lowStockOnly === '1',
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get('balances/:variantId')
  @RequirePermissions(Permissions.INV_VIEW)
  @ApiOperation({ summary: 'Balance for SKU' })
  getBalance(
    @Param('variantId') variantId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.availability.getBalance(variantId, warehouseId);
  }

  @Post('adjustments')
  @RequirePermissions(Permissions.INV_MANAGE_STOCK)
  @ApiOperation({ summary: 'Manual stock adjustment (appends movement)' })
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adjustments.adjust(dto, user.id);
  }

  @Post('receiving')
  @RequirePermissions(Permissions.INV_MANAGE_STOCK)
  @ApiOperation({ summary: 'Receive inbound stock (appends movement)' })
  receive(
    @Body() dto: ReceiveStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.receiving.receive(dto, user.id);
  }

  @Get('movements')
  @RequirePermissions(Permissions.INV_VIEW)
  @ApiOperation({ summary: 'Ledger query' })
  listMovements(
    @Query('warehouseId') warehouseId?: string,
    @Query('productVariantId') productVariantId?: string,
    @Query('orderId') orderId?: string,
    @Query('movementType') movementType?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.movements.list({
      warehouseId,
      productVariantId,
      orderId,
      movementType,
      skip: skip ? Number(skip) : 0,
      take: take ? Number(take) : 50,
    });
  }

  @Get('warehouses')
  @RequirePermissions(Permissions.INV_MANAGE_WAREHOUSE)
  @ApiOperation({ summary: 'List warehouses' })
  listWarehouses() {
    return this.warehouses.list();
  }

  @Post('warehouses')
  @RequirePermissions(Permissions.INV_MANAGE_WAREHOUSE)
  @ApiOperation({ summary: 'Create warehouse' })
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Patch('warehouses/:id')
  @RequirePermissions(Permissions.INV_MANAGE_WAREHOUSE)
  @ApiOperation({ summary: 'Update warehouse' })
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(id, dto);
  }

  @Get('warehouses/:id')
  @RequirePermissions(Permissions.INV_MANAGE_WAREHOUSE)
  @ApiOperation({ summary: 'Get warehouse' })
  getWarehouse(@Param('id') id: string) {
    return this.warehouses.get(id);
  }

  @Get('policies')
  @RequirePermissions(Permissions.INV_MANAGE_WAREHOUSE)
  @ApiOperation({ summary: 'Get inventory policies' })
  getPolicies() {
    return this.policies.getOrCreateDefault();
  }

  @Patch('policies')
  @RequirePermissions(Permissions.INV_MANAGE_WAREHOUSE)
  @ApiOperation({ summary: 'Update inventory policies' })
  updatePolicies(
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.policies.update(dto, user.id);
  }

  @Post('purge')
  @RequirePermissions(Permissions.INV_DESTRUCTIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bounded Class D cleanup of zero balances' })
  purge(@Body() dto: PurgeInventoryDto) {
    return this.purgeService.purge(dto.dryRun ?? false);
  }
}
