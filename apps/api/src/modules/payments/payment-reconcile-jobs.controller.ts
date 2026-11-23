import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { WorkerSecretGuard } from './worker-secret.guard';

class PaymentReconcileJobDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Only consider rows whose durable backoff / age exceeds this. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  olderThanSeconds?: number;
}

@ApiTags('internal-jobs')
@Controller({ path: 'internal/jobs', version: '1' })
export class PaymentReconcileJobsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @UseGuards(WorkerSecretGuard)
  @Post('payment-reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Internal payment reconcile batch (stuck auth/capture/refund; AUTH-015)',
  })
  run(@Body() dto: PaymentReconcileJobDto) {
    return this.payments.reconcileStuckBatch({
      limit: dto.limit,
      olderThanSeconds: dto.olderThanSeconds,
    });
  }
}
