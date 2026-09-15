import { SetMetadata } from '@nestjs/common';
import { REGISTRATION_KEY } from '../keycloak.constants';

export const Registration = () => SetMetadata(REGISTRATION_KEY, true);
