import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '../../common/decorators';
import { KeycloakIdentityProvider } from '../../common/infrastructure/keycloak/types/oidc';
import type { Actor } from '../../common/types/actor';
import { AuthService } from './services/auth.service';
import { AuthTokensResponseDto } from './dto/auth-tokens.response.dto';
import { CurrentUserResponseDto } from './dto/current-user.response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { OidcCallbackQueryDto } from './dto/oidc-callback-query.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with club account' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  login(@Body() body: LoginDto): Promise<AuthTokensResponseDto> {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange refresh token' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  refresh(@Body() body: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke refresh token' })
  logout(@Body() body: RefreshTokenDto): Promise<void> {
    return this.authService.logout(body.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current account and role' })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  me(@CurrentUser() actor: Actor): Promise<CurrentUserResponseDto> {
    return this.authService.me(actor);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current account password' })
  changePassword(
    @CurrentUser() actor: Actor,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(
      actor,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Public()
  @Get('oidc/:provider')
  @Redirect()
  @ApiOperation({ summary: 'Bat dau luong dang nhap qua identity provider' })
  async startOidc(
    @Param('provider', new ParseEnumPipe(KeycloakIdentityProvider))
    provider: KeycloakIdentityProvider,
  ) {
    return {
      url: await this.authService.buildOidcLoginUrl(provider),
      statusCode: HttpStatus.FOUND,
    };
  }

  @Public()
  @Get('oidc/:provider/callback')
  @ApiOperation({ summary: 'Diem identity provider redirect ve' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  oidcCallback(
    @Param('provider', new ParseEnumPipe(KeycloakIdentityProvider))
    provider: KeycloakIdentityProvider,
    @Query() query: OidcCallbackQueryDto,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.completeOidcLogin(
      provider,
      query.code,
      query.state,
    );
  }
}
