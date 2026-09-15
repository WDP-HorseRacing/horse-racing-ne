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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/integration/keycloak/decorators/public.decorator';
import { Registration } from '../../common/integration/keycloak/decorators/registration.decorator';
import { CurrentUser } from '../../common/integration/keycloak/decorators/current-user.decorator';
import { KeycloakIdentityProvider } from '../../common/integration/keycloak/types/oidc';
import type { Actor } from '../../common/auth/actor';
import { AuthService } from './services/auth.service';
import { AuthTokensResponseDto } from './dto/auth-tokens.response.dto';
import { CurrentUserResponseDto } from './dto/current-user.response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UserResponseDto } from '../users/dto/user.response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Tu dang ky, cho CLUB_MANAGER duyet' })
  @ApiCreatedResponse({ type: UserResponseDto })
  register(@Body() body: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(body);
  }

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

  @Registration()
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
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.completeOidcLogin(provider, code, state);
  }
}
