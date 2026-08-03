import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';

export class CreateUploadSessionDto {
  @IsString()
  @MaxLength(512)
  originalFilename!: string;

  @IsString()
  @MaxLength(255)
  mimeType!: string;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  altText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string | null;
}

export class BulkAssetIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsOptional()
  @IsString()
  action?: 'archive' | 'delete';
}
