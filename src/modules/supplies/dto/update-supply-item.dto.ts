import { PartialType } from '@nestjs/swagger';
import { CreateSupplyItemDto } from './create-supply-item.dto';

export class UpdateSupplyItemDto extends PartialType(CreateSupplyItemDto) {}
