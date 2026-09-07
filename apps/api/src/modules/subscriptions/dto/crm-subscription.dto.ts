import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SubscriptionStatus } from '../../../../generated/prisma';
import { AddNoteDto } from '../../../common/dto/note.dto';

export class CrmUpdateSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shippingPreferenceNotes?: string | null;

  @ApiPropertyOptional({
    description: 'CRM-operational flags JSON.',
  })
  @IsOptional()
  @IsObject()
  opsFlags?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  adminTags?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethodId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextRenewalAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

export class CrmLifecycleReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CrmMigrateSubscriptionDto extends CrmLifecycleReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  migratedToSubscriptionId?: string;
}

export class CrmAddSubscriptionNoteDto extends AddNoteDto {}

export function parseSubscriptionStatusFilter(
  value?: string,
): SubscriptionStatus | 'ALL' | undefined {
  if (!value || value === 'ALL') return value as 'ALL' | undefined;
  if ((Object.values(SubscriptionStatus) as string[]).includes(value)) {
    return value as SubscriptionStatus;
  }
  return undefined;
}

export { SubscriptionStatus };
