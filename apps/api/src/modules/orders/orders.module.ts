import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { AdminOrdersController } from './admin-orders.controller';
import { CrmOrdersController } from './crm-orders.controller';
import { OrderEditPolicyService } from './order-edit-policy.service';
import { OrderInventoryOrchestrator } from './order-inventory.orchestrator';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSnapshotService } from './order-snapshot.service';
import { OrderTotalsService } from './order-totals.service';
import { OrdersService } from './orders.service';

/**
 * Orders domain + CRM (P13c) + Guardian admin (P13d) HTTP surfaces.
 * P13e: InventoryModule imported for in-txn Reserve/Release/Commit/Restock.
 */
@Module({
  imports: [InventoryModule],
  controllers: [CrmOrdersController, AdminOrdersController],
  providers: [
    OrderLifecycleService,
    OrderTotalsService,
    OrderSnapshotService,
    OrderEditPolicyService,
    OrderInventoryOrchestrator,
    OrdersService,
  ],
  exports: [
    OrdersService,
    OrderLifecycleService,
    OrderTotalsService,
    OrderSnapshotService,
    OrderEditPolicyService,
  ],
})
export class OrdersModule {}
