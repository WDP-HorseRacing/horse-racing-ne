import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PendingApi } from '../../common/api/pending-api';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@ApiResponse({ status: 501, description: 'Contract only' })
@Controller('auth')
export class AuthController extends PendingApi {
  @Post('login')
  @ApiOperation({ summary: 'Sign in with club account' })
  login(@Body() _body: LoginDto) {
    return this.pending();
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Exchange refresh token' })
  refresh(@Body() _body: RefreshTokenDto) {
    return this.pending();
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke refresh token' })
  logout(@Body() _body: RefreshTokenDto) {
    return this.pending();
  }
}
