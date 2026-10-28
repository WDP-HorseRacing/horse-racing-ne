import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: 'So giay access token con hieu luc' })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;
}
