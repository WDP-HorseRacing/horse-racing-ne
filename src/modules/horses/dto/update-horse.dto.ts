import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateHorseDto } from './create-horse.dto';

export class UpdateHorseDto extends PartialType(
  OmitType(CreateHorseDto, ['isReference'] as const),
) {}
