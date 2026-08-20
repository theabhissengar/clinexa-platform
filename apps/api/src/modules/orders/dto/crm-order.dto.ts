import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrderStatus, OrderType } from '../../../../generated/prisma';

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

export class CrmAddOrderNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
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
