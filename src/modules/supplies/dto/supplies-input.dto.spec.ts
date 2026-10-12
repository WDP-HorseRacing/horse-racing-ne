import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import { CreateSupplyItemDto, UpdateSupplyItemDto } from './supply-item.dto';
import {
  EditSupplyRequestDto,
  UpdateSupplyRequestStatusDto,
} from './supply-request.dto';

async function failedFields<T extends object>(
  dto: ClassConstructor<T>,
  body: object,
): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body));
  return errors.map((error) => error.property);
}

describe('supplies DTO text fields', () => {
  const item = {
    name: 'Cỏ khô',
    category: 'FEED',
    unit: 'kg',
    reorderThreshold: 10,
  };

  it('rejects a whitespace-only name or unit', async () => {
    await expect(
      failedFields(CreateSupplyItemDto, { ...item, name: ' ', unit: ' ' }),
    ).resolves.toEqual(['name', 'unit']);
    await expect(
      failedFields(UpdateSupplyItemDto, { name: ' ', unit: ' ' }),
    ).resolves.toEqual(['name', 'unit']);
  });

  it('rejects a whitespace-only reject reason', async () => {
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.REJECTED,
        reason: '   ',
      }),
    ).resolves.toEqual(['reason']);
  });
});

describe('EditSupplyRequestDto', () => {
  it('accepts omitted fields', async () => {
    await expect(failedFields(EditSupplyRequestDto, {})).resolves.toEqual([]);
  });

  it('rejects null quantity and note', async () => {
    await expect(
      failedFields(EditSupplyRequestDto, { quantity: null, note: null }),
    ).resolves.toEqual(['quantity', 'note']);
  });
});
