import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

const pageErrors = async (page: string) => {
  const dto = plainToInstance(PaginationQueryDto, { page });
  const errors = await validate(dto);
  return errors.filter((error) => error.property === 'page');
};

describe('PaginationQueryDto', () => {
  it('accepts page 10000', async () => {
    expect(await pageErrors('10000')).toEqual([]);
  });

  it('rejects page above 10000', async () => {
    expect(await pageErrors('10001')).toHaveLength(1);
  });
});
