import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderStatus, OrderType } from '../../../../generated/prisma';
import { AdminOrderAddressDto } from './admin-order.dto';

export class CrmUpdateOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  trackingNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  carrier?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  shippedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Shipping address phone assist (CRM-operational).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  shippingPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  patientUserId?: string;

  @ApiPropertyOptional({ type: AdminOrderAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  shippingAddress?: AdminOrderAddressDto;

  @ApiPropertyOptional({ type: AdminOrderAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  billingAddress?: AdminOrderAddressDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  adminTags?: Record<string, unknown> | null;
}

export class CrmCancelOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CrmFulfillOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  trackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  carrier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

import { AddNoteDto } from '../../../common/dto/note.dto';

export class CrmAddOrderNoteDto extends AddNoteDto {}

export class CrmTransitionOrderDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  toStatus!: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CrmRetryOrderPaymentDto {
  @ApiProperty()
  @IsUUID()
  paymentMethodId!: string;
}

export function parseOrderStatusFilter(
  value?: string,
): OrderStatus | 'ALL' | undefined {
  if (!value || value === 'ALL') return value as 'ALL' | undefined;
  if ((Object.values(OrderStatus) as string[]).includes(value)) {
    return value as OrderStatus;
  }
  return undefined;
}

export function parseOrderTypeFilter(
  value?: string,
): OrderType | 'ALL' | undefined {
  if (!value || value === 'ALL') return value as 'ALL' | undefined;
  if ((Object.values(OrderType) as string[]).includes(value)) {
    return value as OrderType;
  }
  return undefined;
}

export { OrderStatus, OrderType };
