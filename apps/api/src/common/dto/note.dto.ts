import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NoteVisibility } from '../../../generated/prisma';

export class AddNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({
    enum: NoteVisibility,
    default: NoteVisibility.PRIVATE,
  })
  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;
}
