import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SubscriptionStatus } from '../../../../generated/prisma';

export class CrmUpdateSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shippingPreferenceNotes?: string | null;

  @ApiPropertyOptional({
    description: 'CRM-operational flags JSON (not Guardian admin tags).',
  })
  @IsOptional()
  @IsObject()
  opsFlags?: Record<string, unknown> | null;
}

export class CrmLifecycleReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CrmAddSubscriptionNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

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
