import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class InitiateRefundDto {
  @ApiProperty({ description: 'Refund amount in cents (must be > 0)' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ description: 'Required staff reason for the refund' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional()
  status?: string;

  @ApiPropertyOptional()
  provider?: string;

  @ApiPropertyOptional()
  q?: string;

  @ApiPropertyOptional()
  createdFrom?: string;

  @ApiPropertyOptional()
  createdTo?: string;

  @ApiPropertyOptional()
  skip?: string;

  @ApiPropertyOptional()
  take?: string;
}
