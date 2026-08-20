import { Module } from '@nestjs/common';

import { CrmOrdersController } from './crm-orders.controller';
import { OrderEditPolicyService } from './order-edit-policy.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSnapshotService } from './order-snapshot.service';
import { OrderTotalsService } from './order-totals.service';
import { OrdersService } from './orders.service';

/**
 * Orders domain + CRM HTTP surface (P13b + P13c).
 * Guardian admin controllers land in P13d.
 */
@Module({
  controllers: [CrmOrdersController],
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
