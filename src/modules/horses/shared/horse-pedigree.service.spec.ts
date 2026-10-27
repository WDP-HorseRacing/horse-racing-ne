import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { HorseEntity } from '../entities/horse.entity';
import { HorseGender } from '../enums/horse-gender.enum';
import type { HorseAccessService } from './horse-access.service';
import type { HorsePedigreeRepository } from './horse-pedigree.repository';
import { HorsePedigreeService } from './horse-pedigree.service';

describe('HorsePedigreeService.validateParents', () => {
  const manager = {} as EntityManager;
  const stallion = {
    id: 's',
    gender: HorseGender.MALE,
    dateOfBirth: null,
  } as HorseEntity;
  const mare = {
    id: 'd',
    gender: HorseGender.FEMALE,
    dateOfBirth: null,
  } as HorseEntity;
  let horses: Map<string, HorseEntity>;
  let cyclicParents: Set<string>;
  let service: HorsePedigreeService;

  beforeEach(() => {
    horses = new Map([
      ['s', stallion],
      ['d', mare],
    ]);
    cyclicParents = new Set();
    const access = {
      findById: jest.fn((id: string) =>
        Promise.resolve(horses.get(id) ?? null),
      ),
    };
    const pedigree = {
      wouldCreateCycle: jest.fn((_: EntityManager, __: string, id: string) =>
        Promise.resolve(cyclicParents.has(id)),
      ),
    };
    service = new HorsePedigreeService(
      pedigree as unknown as HorsePedigreeRepository,
      access as unknown as HorseAccessService,
    );
  });

  const responseOf = async (promise: Promise<void>) => {
    try {
      await promise;
    } catch (error) {
      return {
        type: (error as Error).constructor,
        body: (error as BadRequestException).getResponse(),
      };
    }
    throw new Error('expected validateParents to reject');
  };

  it.each([
    ['sireId', 'missing', null, 'Ngựa cha không tồn tại'],
    ['damId', null, 'missing', 'Ngựa mẹ không tồn tại'],
  ])(
    'attaches a missing parent to the %s field with 400',
    async (field, sireId, damId, message) => {
      await expect(
        responseOf(
          service.validateParents(manager, { id: 'c' }, sireId, damId),
        ),
      ).resolves.toEqual({
        type: BadRequestException,
        body: { message, errors: [{ field, message }] },
      });
    },
  );

  it.each([
    ['sireId', 's'],
    ['damId', 'd'],
  ])(
    'attaches a pedigree loop to the %s field with 409',
    async (field, parentId) => {
      cyclicParents.add(parentId);
      const message = 'Quan hệ cha/mẹ tạo thành vòng lặp phả hệ';
      await expect(
        responseOf(service.validateParents(manager, { id: 'c' }, 's', 'd')),
      ).resolves.toEqual({
        type: ConflictException,
        body: { message, errors: [{ field, message }] },
      });
    },
  );
});
