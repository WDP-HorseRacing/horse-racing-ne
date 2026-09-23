import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../user.enums';
import { CreateUserDto, UpdateUserDto, UserListQueryDto } from './user.dto';

describe('user.dto', () => {
  const validCreate = {
    fullName: 'Nguyen Van A',
    email: 'a@example.com',
    role: UserRole.GROOM,
    password: 'secret123',
  };

  const errorsOf = async <T extends object>(
    type: new () => T,
    plain: object,
  ) => {
    const dto = plainToInstance(type, plain);
    return { dto, errors: await validate(dto) };
  };

  it('trims fullName and email when creating a user', async () => {
    const { dto, errors } = await errorsOf(CreateUserDto, {
      ...validCreate,
      fullName: '  Nguyen Van A  ',
      email: '  a@example.com ',
    });

    expect(errors).toHaveLength(0);
    expect(dto.fullName).toBe('Nguyen Van A');
    expect(dto.email).toBe('a@example.com');
  });

  it('rejects a blank fullName after trimming', async () => {
    const { errors } = await errorsOf(CreateUserDto, {
      ...validCreate,
      fullName: '   ',
    });

    expect(errors.map((e) => e.property)).toEqual(['fullName']);
  });

  it('rejects a fullName longer than the 160-char column', async () => {
    const { errors } = await errorsOf(CreateUserDto, {
      ...validCreate,
      fullName: 'a'.repeat(161),
    });

    expect(errors.map((e) => e.property)).toEqual(['fullName']);
  });

  it('rejects an email longer than the 254-char column', async () => {
    const { errors } = await errorsOf(CreateUserDto, {
      ...validCreate,
      email: `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}.com`,
    });

    expect(errors.map((e) => e.property)).toEqual(['email']);
  });

  it('does not trim the password', async () => {
    const { dto } = await errorsOf(CreateUserDto, {
      ...validCreate,
      password: ' secret123 ',
    });

    expect(dto.password).toBe(' secret123 ');
  });

  it('trims and length-checks fullName when updating a user', async () => {
    const trimmed = await errorsOf(UpdateUserDto, { fullName: '  Ten Moi ' });
    const blank = await errorsOf(UpdateUserDto, { fullName: '  ' });
    const tooLong = await errorsOf(UpdateUserDto, {
      fullName: 'a'.repeat(161),
    });

    expect(trimmed.errors).toHaveLength(0);
    expect(trimmed.dto.fullName).toBe('Ten Moi');
    expect(blank.errors.map((e) => e.property)).toEqual(['fullName']);
    expect(tooLong.errors.map((e) => e.property)).toEqual(['fullName']);
  });

  it('trims the list search term', async () => {
    const { dto } = await errorsOf(UserListQueryDto, { search: '  ngua ' });

    expect(dto.search).toBe('ngua');
  });
});
