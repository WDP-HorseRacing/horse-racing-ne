import { ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  translateConstraint,
  translatePipeMessage,
} from './validation-messages';

enum Color {
  RED = 'RED',
  BLUE = 'BLUE',
}

class ItemDto {
  @IsString()
  code!: string;
}

class SampleDto {
  @IsString()
  @MaxLength(3)
  name!: string;

  @IsInt()
  @Min(1)
  age!: number;

  @IsEnum(Color)
  color!: Color;

  @IsUUID('4', { each: true })
  @ArrayUnique()
  ids!: string[];

  @IsString({ message: 'Ghi chú phải là chữ' })
  note!: string;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items!: ItemDto[];
}

async function messagesOf(value: object): Promise<string[]> {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => errors,
  });
  try {
    await pipe.transform(value, { type: 'body', metatype: SampleDto });
  } catch (errors) {
    const flat = (list: typeof errors): string[] =>
      (
        list as {
          property: string;
          constraints?: Record<string, string>;
          children?: unknown[];
        }[]
      ).flatMap((error) => [
        ...Object.entries(error.constraints ?? {}).map(([key, text]) =>
          translateConstraint(key, text),
        ),
        ...flat(error.children ?? []),
      ]);
    return flat(errors);
  }
  throw new Error('expected validation to fail');
}

describe('translateConstraint', () => {
  it('turns the class-validator defaults into Vietnamese', async () => {
    const messages = await messagesOf({
      name: 'abcd',
      age: 0,
      color: 'GREEN',
      ids: ['x', 'x'],
      note: 'ok',
      items: [{ code: 1 }],
      extra: true,
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        'name tối đa 3 ký tự',
        'age không được nhỏ hơn 1',
        'color phải là một trong: RED, BLUE',
        'Mỗi phần tử của ids phải là UUID',
        'Các phần tử của ids không được trùng nhau',
        'code phải là chuỗi',
        'Không nhận ô extra',
      ]),
    );
  });

  it('keeps a message written for the field', async () => {
    expect(await messagesOf({ note: 1 })).toContain('Ghi chú phải là chữ');
  });

  it('translates a primitive inside a nested array', async () => {
    expect(await messagesOf({ items: [1] })).toContain(
      'Mỗi phần tử của items phải là object hoặc mảng',
    );
  });

  it('translates an unknown field whose name has a dollar sign', async () => {
    expect(await messagesOf({ 'x$&': 1 })).toContain('Không nhận ô x$&');
  });

  it('keeps a message it does not know', () => {
    expect(translateConstraint('isFoo', 'name is foo')).toBe('name is foo');
  });
});

describe('translatePipeMessage', () => {
  it('translates the built-in pipe messages and keeps the rest', () => {
    expect(translatePipeMessage('Validation failed (uuid is expected)')).toBe(
      'Mã định danh trên đường dẫn phải là UUID',
    );
    expect(translatePipeMessage('Không tìm thấy ngựa')).toBe(
      'Không tìm thấy ngựa',
    );
  });
});
