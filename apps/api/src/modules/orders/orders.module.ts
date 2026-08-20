import { Module } from '@nestjs/common';

import { AdminOrdersController } from './admin-orders.controller';
import { CrmOrdersController } from './crm-orders.controller';
import { OrderEditPolicyService } from './order-edit-policy.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSnapshotService } from './order-snapshot.service';
import { OrderTotalsService } from './order-totals.service';
import { OrdersService } from './orders.service';

/**
 * Orders domain + CRM (P13c) + Guardian admin (P13d) HTTP surfaces.
 */
@Module({
  controllers: [CrmOrdersController, AdminOrdersController],
  providers: [
    OrderLifecycleService,
    OrderTotalsService,
    OrderSnapshotService,
    OrderEditPolicyService,
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
