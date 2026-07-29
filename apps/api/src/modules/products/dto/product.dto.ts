import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ProductLifecycleStatus, ProductType } from '../../../../generated/prisma';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRxEligible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  featuredMediaAssetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoCanonical?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  medicalInfo?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Catalog attributes array: [{ name, values, forVariation }]',
  })
  @IsOptional()
  attributes?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  questionnaireBindingRef?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gtin?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  soldIndividually?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weightLbs?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  lengthIn?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  widthIn?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  heightIn?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingClass?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  oneTimeShipping?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bundleSellsTitle?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bundleSellsDiscount?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  defaultVariationOptions?: Record<string, string> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purchaseNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  menuOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableReviews?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  limitSubscription?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stripeButtonPosition?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  stripeGateways?: unknown;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  upsellIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  crossSellIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  bundleSellIds?: string[];
}

export class TransitionProductDto {
  @ApiProperty({ enum: ProductLifecycleStatus })
  @IsEnum(ProductLifecycleStatus)
  status!: ProductLifecycleStatus;
}

export class SetCategoriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds!: string[];
}

export class CreateVariantDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salePriceCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFulfillable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  optionValues?: Record<string, unknown>;
}

export class UpdateVariantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  salePriceCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFulfillable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  optionValues?: Record<string, unknown>;
}

export class AttachMediaDto {
  @ApiProperty({
    description:
      'Opaque Media Library asset id. Products never uploads binaries.',
  })
  @IsString()
  @MinLength(1)
  mediaAssetId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  alt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReorderMediaDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  orderedMediaIds!: string[];
}

export class BulkProductIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}
