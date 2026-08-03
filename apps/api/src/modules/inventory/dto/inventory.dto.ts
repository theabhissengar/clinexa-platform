import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { OversellMode, WarehouseStatus } from '../../../../generated/prisma';

export class AdjustStockDto {
  @IsUUID()
  productVariantId!: string;

  /** Signed delta applied to on-hand (nonzero). */
  @Type(() => Number)
  @IsInt()
  quantityDelta!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class ReceiveStockDto {
  @IsUUID()
  productVariantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(WarehouseStatus)
  status?: WarehouseStatus;
}

export class UpdatePolicyDto {
  @IsOptional()
  @IsEnum(OversellMode)
  oversellMode?: OversellMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reservationTimeoutMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  allocationStrategy?: string | null;
}

export class ReserveLineDto {
  @IsUUID()
  productVariantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class ReserveStockDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReserveLineDto)
  lines!: ReserveLineDto[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class RestockDto {
  @IsUUID()
  productVariantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PurgeInventoryDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
