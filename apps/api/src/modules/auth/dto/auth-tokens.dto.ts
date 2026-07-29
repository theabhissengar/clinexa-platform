import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

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

export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Access token lifetime in seconds' })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
