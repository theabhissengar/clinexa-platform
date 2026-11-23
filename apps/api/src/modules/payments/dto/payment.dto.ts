import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
} from '../../../../generated/prisma';

export class InitiateRefundDto {
  @ApiProperty({ description: 'Refund amount in cents (must be > 0)' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ description: 'Required staff reason for the refund' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/** Empty string → undefined so optional filters stay omitted. */
function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  return value;
}

const PAYMENT_STATUS_FILTER = [...Object.values(PaymentStatus), 'ALL'] as const;
const LIFECYCLE_FILTER = [
  ...Object.values(PaymentLifecycleState),
  'ALL',
] as const;
const PURPOSE_FILTER = [...Object.values(PaymentPurpose), 'ALL'] as const;

export class ListPaymentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: PAYMENT_STATUS_FILTER })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PAYMENT_STATUS_FILTER)
  status?: (typeof PAYMENT_STATUS_FILTER)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional({ enum: LIFECYCLE_FILTER })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(LIFECYCLE_FILTER)
  lifecycleState?: (typeof LIFECYCLE_FILTER)[number];

  @ApiPropertyOptional({ enum: PURPOSE_FILTER })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(PURPOSE_FILTER)
  purpose?: (typeof PURPOSE_FILTER)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

/** Explicit allow-list for GET /admin/payment-providers (no secrets). */
export class ProviderConfigResponseDto {
  @ApiProperty()
  provider!: string;

  @ApiProperty({ enum: ['sandbox', 'live'] })
  mode!: 'sandbox' | 'live';

  @ApiProperty({ type: [String] })
  capabilities!: readonly string[];

  @ApiProperty()
  webhookEndpointUrl!: string;
}

export const PROVIDER_CONFIG_RESPONSE_KEYS = [
  'provider',
  'mode',
  'capabilities',
  'webhookEndpointUrl',
] as const;

/** Stable staff reconcile outcomes (allow-listed). */
export const RECONCILE_OUTCOMES = [
  'noop_terminal',
  'authorized',
  'authorization_failed',
  'captured',
  'capture_failed',
  'refunded',
  'voided',
  'progressed',
  'refund_reconciled',
  'pending',
  'pending_action',
  'refund_pending_without_refund',
  'deferred_renewal',
  'deferred_renewal_lease_held',
] as const;

export type ReconcileOutcome = (typeof RECONCILE_OUTCOMES)[number];

export class ReconcilePaymentResponseDto {
  @ApiProperty()
  paymentId!: string;

  @ApiProperty({ enum: RECONCILE_OUTCOMES })
  outcome!: ReconcileOutcome;
}
