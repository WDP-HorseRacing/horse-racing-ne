import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { fieldBadRequest, validationExceptionFactory } from './field-errors';

class ItemDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

class SampleDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  age!: number;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items!: ItemDto[];
}

const pipeOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
};

async function responseOf(
  pipe: ValidationPipe,
  value: unknown,
): Promise<Record<string, unknown>> {
  try {
    await pipe.transform(value, { type: 'body', metatype: SampleDto });
  } catch (error) {
    return (error as BadRequestException).getResponse() as Record<
      string,
      unknown
    >;
  }
  throw new Error('expected validation to fail');
}

describe('field-errors', () => {
  const invalid = { name: 1, age: 0, extra: 'x', items: [{ code: '' }, {}] };

  it('keeps the same message list as the default ValidationPipe', async () => {
    const defaults = await responseOf(new ValidationPipe(pipeOptions), invalid);
    const custom = await responseOf(
      new ValidationPipe({
        ...pipeOptions,
        exceptionFactory: validationExceptionFactory,
      }),
      invalid,
    );
    expect(custom.message).toEqual(defaults.message);
  });

  it('lists one error per failed constraint with a dotted field path', async () => {
    const custom = await responseOf(
      new ValidationPipe({
        ...pipeOptions,
        exceptionFactory: validationExceptionFactory,
      }),
      invalid,
    );
    const errors = custom.errors as { field: string; message: string }[];
    expect(errors.map((error) => error.field)).toEqual([
      'extra',
      'name',
      'age',
      'items.0.code',
      'items.1.code',
      'items.1.code',
    ]);
    expect(errors.map((error) => error.message)).toEqual(custom.message);
  });

  it('builds a 400 with one field error', () => {
    const error = fieldBadRequest('damId', 'Ngựa mẹ sai');
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      message: 'Ngựa mẹ sai',
      errors: [{ field: 'damId', message: 'Ngựa mẹ sai' }],
    });
  });
});
