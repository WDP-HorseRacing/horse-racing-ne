import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupplyRequestStatus } from '../enums/supply-request-status.enum';
import {
  CreateSupplyItemDto,
  SupplyReceiptDto,
  UpdateSupplyItemDto,
} from './supply-item.dto';
import {
  CreateSupplyRequestDto,
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

  it('requires a non-blank reason to cancel', async () => {
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.CANCELLED,
      }),
    ).resolves.toEqual(['reason']);
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.CANCELLED,
        reason: '   ',
      }),
    ).resolves.toEqual(['reason']);
  });
});

describe('CreateSupplyRequestDto', () => {
  it('needs only the item', async () => {
    await expect(
      failedFields(CreateSupplyRequestDto, {
        itemId: '7b0f2c1e-3c7d-4a59-9d1e-2f6f3b8a4c11',
      }),
    ).resolves.toEqual([]);
  });
});

describe('EditSupplyRequestDto', () => {
  it('accepts omitted fields', async () => {
    await expect(failedFields(EditSupplyRequestDto, {})).resolves.toEqual([]);
  });

  it('rejects a null note', async () => {
    await expect(
      failedFields(EditSupplyRequestDto, { note: null }),
    ).resolves.toEqual(['note']);
  });
});

describe('supplies DTO unit price', () => {
  it('requires a whole VND price on a receipt', async () => {
    await expect(
      failedFields(SupplyReceiptDto, { quantity: 10, unitPrice: 20000 }),
    ).resolves.toEqual([]);
    await expect(
      failedFields(SupplyReceiptDto, { quantity: 10 }),
    ).resolves.toEqual(['unitPrice']);
    await expect(
      failedFields(SupplyReceiptDto, { quantity: 10, unitPrice: 1.5 }),
    ).resolves.toEqual(['unitPrice']);
  });

  it('requires the price and the received quantity only when fulfilling a request', async () => {
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.FULFILLED,
      }),
    ).resolves.toEqual(['unitPrice', 'quantity']);
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.FULFILLED,
        unitPrice: 20000,
        quantity: 40,
      }),
    ).resolves.toEqual([]);
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.FULFILLED,
        unitPrice: 20000,
        quantity: 0,
      }),
    ).resolves.toEqual(['quantity']);
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.FULFILLED,
        unitPrice: 20000,
        quantity: 1.005,
      }),
    ).resolves.toEqual(['quantity']);
    await expect(
      failedFields(UpdateSupplyRequestStatusDto, {
        status: SupplyRequestStatus.APPROVED,
      }),
    ).resolves.toEqual([]);
  });
});
