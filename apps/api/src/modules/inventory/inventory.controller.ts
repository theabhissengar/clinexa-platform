import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { Permissions } from '../rbac/constants/permissions';
import { ReserveStockDto, RestockDto } from './dto/inventory.dto';
import {
  InventoryAvailabilityService,
  InventoryMovementQueryService,
} from './inventory-query.service';
import { InventoryReservationService } from './inventory-reservation.service';
import { InventoryRestockService } from './inventory-stock-ops.service';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(
    private readonly reservations: InventoryReservationService,
    private readonly restock: InventoryRestockService,
    private readonly availability: InventoryAvailabilityService,
    private readonly movements: InventoryMovementQueryService,
  ) {}

  @Post('reservations')
  @RequirePermissions(Permissions.INV_RESERVE)
  @ApiOperation({ summary: 'Reserve stock (appends reserve movement)' })
  reserve(
    @Body() dto: ReserveStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservations.reserve(dto, user.id);
  }

  @Post('reservations/:id/release')
  @RequirePermissions(Permissions.INV_RESERVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release reservation' })
  release(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservations.release(id, user.id);
  }

  @Post('reservations/:id/commit')
  @RequirePermissions(Permissions.INV_RESERVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Commit reservation (fulfill path)' })
  commit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservations.commit(id, user.id);
  }

  @Post('restock')
  @RequirePermissions(Permissions.INV_RESERVE)
  @ApiOperation({ summary: 'Restock (refund/cancel path)' })
  restockStock(
    @Body() dto: RestockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.restock.restock(dto, user.id);
  }

  @Get('availability')
  @RequirePermissions(Permissions.INV_VIEW)
  @ApiOperation({ summary: 'Availability / summary' })
  availabilityQuery(
    @Query('productId') productId?: string,
    @Query('productVariantId') productVariantId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.availability.availabilityQuery({
      productId,
      productVariantId,
      warehouseId,
    });
  }

  @Get('movements')
  @RequirePermissions(Permissions.INV_VIEW)
  @ApiOperation({ summary: 'Order-scoped or filtered ledger read' })
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
}
