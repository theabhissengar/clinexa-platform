import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

import { Public } from '../auth/decorators/public.decorator';
import { PaymentsService } from './payments.service';

class WebhookEnvelopeDto {
  @IsString()
  @MinLength(1)
  provider!: string;

  @IsString()
  @MinLength(1)
  providerEventId!: string;

  @IsString()
  @MinLength(1)
  type!: string;

  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

@ApiTags('payments-webhooks')
@Controller({ path: 'webhooks/payments', version: '1' })
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PSP webhook ingest (API-068)' })
  async ingest(
    @Headers('x-payments-webhook-secret') secretHeader: string | undefined,
    @Body() body: WebhookEnvelopeDto,
  ) {
    return this.payments.ingestWebhook({
      secretHeader,
      envelope: body,
    });
  }
}
