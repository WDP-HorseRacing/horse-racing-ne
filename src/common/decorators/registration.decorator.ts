import { SetMetadata } from '@nestjs/common';
import { REGISTRATION_KEY } from '../constants/auth.constants';

export const Registration = () => SetMetadata(REGISTRATION_KEY, true);
