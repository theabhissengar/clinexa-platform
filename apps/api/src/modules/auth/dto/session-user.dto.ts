import { ApiProperty } from '@nestjs/swagger';

export class SessionUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;
}
