import { ApiProperty } from '@nestjs/swagger';

export class SessionUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({
    type: [String],
    description: 'Active ROLE-* codes resolved server-side',
  })
  roles!: string[];

  @ApiProperty({
    type: [String],
    description:
      'Aggregated PERM-* codes resolved server-side (advisory for UI)',
  })
  permissions!: string[];
}
