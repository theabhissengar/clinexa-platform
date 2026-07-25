import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'clinexa-api' })
  service!: string;

  @ApiProperty({ example: '2026-07-25T00:00:00.000Z' })
  timestamp!: string;
}
