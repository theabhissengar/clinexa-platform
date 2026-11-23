import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AddSavedPaymentMethodDto {
  /** Stripe pm_… when PAYMENTS_PROVIDER=stripe — ownership verified server-side. */
  @ApiPropertyOptional({ example: 'pm_card_visa' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  providerMethodRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  brand?: string;

  @ApiPropertyOptional({ example: '4242' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(4)
  last4?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2024)
  expYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSavedPaymentMethodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2024)
  expYear?: number;
}
