import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '../../../common/utils/field-errors';
import { HorseMeasurementListQueryDto } from './horse-measure.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});

describe('HorseMeasurementListQueryDto page cap', () => {
  it('accepts page 10000 and rejects 10001', async () => {
    const query = (page: string) =>
      pipe.transform(
        { page },
        { type: 'query', metatype: HorseMeasurementListQueryDto },
      );

    await expect(query('10000')).resolves.toMatchObject({ page: 10000 });
    await expect(query('10001')).rejects.toThrow(BadRequestException);
  });
});
