import { Module, OnModuleInit } from '@nestjs/common';

import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryController } from './inventory.controller';
import { InventoryLedgerService } from './inventory-ledger.service';
import {
  InventoryAvailabilityService,
  InventoryMovementQueryService,
  InventoryPurgeService,
} from './inventory-query.service';
import { InventoryReservationService } from './inventory-reservation.service';
import {
  InventoryAdjustmentService,
  InventoryReceivingService,
  InventoryRestockService,
} from './inventory-stock-ops.service';
import { LowStockEventEmitter } from './low-stock-event.emitter';
import { InventoryPolicyService, WarehouseService } from './warehouse.service';

@Module({
  controllers: [AdminInventoryController, InventoryController],
  providers: [
    LowStockEventEmitter,
    InventoryLedgerService,
    WarehouseService,
    InventoryPolicyService,
    InventoryAdjustmentService,
    InventoryReceivingService,
    InventoryRestockService,
    InventoryReservationService,
    InventoryAvailabilityService,
    InventoryMovementQueryService,
    InventoryPurgeService,
  ],
  exports: [
    InventoryAvailabilityService,
    InventoryReservationService,
    InventoryRestockService,
    WarehouseService,
    InventoryPolicyService,
  ],
})
export class InventoryModule implements OnModuleInit {
  constructor(
    private readonly warehouses: WarehouseService,
    private readonly policies: InventoryPolicyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.warehouses.ensureDefaultWarehouse();
    await this.policies.getOrCreateDefault();
  }
}
