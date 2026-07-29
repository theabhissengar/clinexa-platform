import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
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
  @IsUUID('4')
  parentId?: string | null;

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
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailMediaAssetId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxQuantity?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  groupOf?: number | null;

  @ApiPropertyOptional({
    description:
      'Store display type: Default | Products | Subcategories | Both',
  })
  @IsOptional()
  @IsString()
  displayType?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headerContentAlign?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headerTextAlign?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headerImageAssetId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Role codes that may view this category on Store. Empty = everyone.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentPermissionRoles?: string[];
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
