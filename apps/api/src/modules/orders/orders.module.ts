import { Module, forwardRef } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { AdminOrdersController } from './admin-orders.controller';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CrmOrdersController } from './crm-orders.controller';
import { OrderEditPolicyService } from './order-edit-policy.service';
import { OrderInventoryOrchestrator } from './order-inventory.orchestrator';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSnapshotService } from './order-snapshot.service';
import { OrderTotalsService } from './order-totals.service';
import { OrdersService } from './orders.service';
import { StoreOrdersController } from './store-orders.controller';

/**
 * Orders domain + CRM (P13c) + Guardian admin (P13d) + patient checkout (6D).
 * P13e: InventoryModule imported for in-txn Reserve/Release/Commit/Restock.
 */
@Module({
  imports: [
    InventoryModule,
    forwardRef(() => PromotionsModule),
    forwardRef(() => PaymentsModule),
  ],
  controllers: [
    CrmOrdersController,
    AdminOrdersController,
    CheckoutController,
    StoreOrdersController,
  ],
  providers: [
    OrderLifecycleService,
    OrderTotalsService,
    OrderSnapshotService,
    OrderEditPolicyService,
    OrderInventoryOrchestrator,
    OrdersService,
    CheckoutService,
  ],
  exports: [
    OrdersService,
    OrderLifecycleService,
    OrderTotalsService,
    OrderSnapshotService,
    OrderEditPolicyService,
    CheckoutService,
  ],
})
export class OrdersModule {}
