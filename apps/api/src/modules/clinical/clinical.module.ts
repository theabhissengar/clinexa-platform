import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { ClinicalOutcomesService } from './clinical-outcomes.service';
import { CrmConsultationsController } from './crm-consultations.controller';

/**
 * P14g Clinical integration adapter (refs/events only).
 * Not clinical record SoT — no Consultation / QST / Prescription models.
 */
@Module({
  imports: [OrdersModule],
  controllers: [CrmConsultationsController],
  providers: [ClinicalOutcomesService],
  exports: [ClinicalOutcomesService],
})
export class ClinicalModule {}
