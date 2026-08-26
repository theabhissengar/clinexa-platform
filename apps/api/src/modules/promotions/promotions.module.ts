import { Module, forwardRef } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { AdminCouponsController } from './admin-coupons.controller';
import { CouponValidationService } from './coupon-validation.service';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { PricingEngineService } from './pricing-engine.service';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [AdminCouponsController, CouponsController],
  providers: [
    CouponValidationService,
    PricingEngineService,
    CouponsService,
  ],
  exports: [CouponValidationService, PricingEngineService, CouponsService],
})
export class PromotionsModule {}
