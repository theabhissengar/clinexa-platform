import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsInt,
} from 'class-validator';

export class CheckoutAddressDto {
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

export class CheckoutLineDto {
  @ApiProperty()
  @IsUUID()
  variantId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}

/** Patient thin checkout — no prices, totals, or coupons (Phase 6D). */
export class CheckoutRequestDto {
  @ApiProperty({ type: [CheckoutLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @ApiProperty({ type: CheckoutAddressDto })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  shippingAddress!: CheckoutAddressDto;

  @ApiProperty({ type: CheckoutAddressDto })
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  billingAddress!: CheckoutAddressDto;

  /**
   * Required when order total > 0 after server pricing.
   * Must be omitted for zero-total checkouts (rejected if sent with zero).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}

export class PayOrderDto {
  @ApiPropertyOptional({
    description: 'Required when order.totalCents > 0',
  })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}
