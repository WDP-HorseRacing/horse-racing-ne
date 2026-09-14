import { PartialType } from '@nestjs/swagger';
import { CreateCareScheduleDto } from './create-care-schedule.dto';

export class UpdateCareScheduleDto extends PartialType(CreateCareScheduleDto) {}
