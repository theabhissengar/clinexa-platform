import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  OrderAdjustmentKind,
  OrderStatus,
  OrderType,
} from '../../../../generated/prisma';

export class AdminOrderAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  line1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  line2?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  postalCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;
}

export class AdminCreateOrderLineDto {
  @ApiProperty()
  @IsUUID()
  variantId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  discountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  taxCents?: number;
}

export class AdminCreateOrderDto {
  @ApiProperty()
  @IsUUID()
  patientUserId!: string;

  @ApiProperty({ type: [AdminCreateOrderLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminCreateOrderLineDto)
  lines!: AdminCreateOrderLineDto[];

  @ApiProperty({ type: AdminOrderAddressDto })
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  shippingAddress!: AdminOrderAddressDto;

  @ApiProperty({ type: AdminOrderAddressDto })
  @ValidateNested()
  @Type(() => AdminOrderAddressDto)
  billingAddress!: AdminOrderAddressDto;

  @ApiPropertyOptional({ enum: OrderType })
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  shippingTotalCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  discountTotalCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  taxTotalCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({
    enum: [OrderStatus.DRAFT, OrderStatus.PAYMENT_PENDING],
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  initialStatus?: typeof OrderStatus.DRAFT | typeof OrderStatus.PAYMENT_PENDING;
}

export class AdminUpdateOrderDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  shippingPhone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  adminTags?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  reconciliationFlags?: Record<string, unknown> | null;
}

export class AdminClassDReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AdminCorrectionDto {
  @ApiProperty()
  @IsInt()
  amountCents!: number;

  @ApiPropertyOptional({ enum: OrderAdjustmentKind })
  @IsOptional()
  @IsEnum(OrderAdjustmentKind)
  kind?: OrderAdjustmentKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentRef?: string | null;
}

export class AdminOverrideDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  toStatus!: OrderStatus;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class AdminAddNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class AdminTransitionDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  toStatus!: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export { OrderAdjustmentKind, OrderStatus, OrderType };
