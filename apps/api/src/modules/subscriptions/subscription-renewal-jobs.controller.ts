import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { Public } from '../auth/decorators/public.decorator';
import { WorkerSecretGuard } from '../payments/worker-secret.guard';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';

class RenewalJobDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Test-only clock override; ignored unless NODE_ENV=test. */
  @IsOptional()
  @IsString()
  now?: string;
}

@ApiTags('internal-jobs')
@Controller({ path: 'internal/jobs', version: '1' })
export class SubscriptionRenewalJobsController {
  constructor(private readonly processor: SubscriptionsRenewalProcessor) {}

  @Public()
  @UseGuards(WorkerSecretGuard)
  @Post('subscription-renewals')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal renewal due/grace worker tick (AUTH-015)' })
  run(@Body() dto: RenewalJobDto) {
    const allowNow =
      process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
    const now =
      allowNow && dto.now ? new Date(dto.now) : undefined;
    return this.processor.processDueBatch({
      limit: dto.limit,
      now,
    });
  }
}
