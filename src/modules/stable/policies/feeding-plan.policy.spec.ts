import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { SupplyCategory } from '../../supplies/enums/supply-category.enum';
import { FeedingMeal } from '../constants/feeding-meal.enum';
import { FeedingPlanStatus } from '../constants/feeding-plan-status.enum';
import {
  assertFeedableCategory,
  assertFeedingPlanDraft,
  assertGroomSeesActivePlan,
  assertNoDeletedSupplies,
  assertNoDuplicateMealItems,
  assertOneRationSource,
} from './feeding-plan.policy';

describe('feeding plan policy', () => {
  it.each([
    [true, false],
    [false, true],
  ])('accepts exactly one ration source (items %s, copy %s)', (a, b) => {
    expect(() => assertOneRationSource(a, b)).not.toThrow();
  });

  it.each([
    [true, true],
    [false, false],
  ])('rejects items %s with copy %s', (a, b) => {
    expect(() => assertOneRationSource(a, b)).toThrow(BadRequestException);
  });

  it('allows the same item at different meals', () => {
    expect(() =>
      assertNoDuplicateMealItems([
        { meal: FeedingMeal.NOON, supplyItemId: 'oats' },
        { meal: FeedingMeal.EVENING, supplyItemId: 'oats' },
      ]),
    ).not.toThrow();
  });

  it('rejects the same item twice in one meal', () => {
    expect(() =>
      assertNoDuplicateMealItems([
        { meal: FeedingMeal.NOON, supplyItemId: 'oats' },
        { meal: FeedingMeal.NOON, supplyItemId: 'oats' },
      ]),
    ).toThrow('Bữa Trưa');
  });

  it.each([SupplyCategory.FEED, SupplyCategory.SUPPLEMENT])(
    'accepts %s in a ration',
    (category) => {
      expect(() => assertFeedableCategory('x', category)).not.toThrow();
    },
  );

  it.each([SupplyCategory.MEDICINE, SupplyCategory.EQUIPMENT])(
    'rejects %s in a ration',
    (category) => {
      expect(() => assertFeedableCategory('Bandage', category)).toThrow(
        BadRequestException,
      );
    },
  );

  it('only lets a draft change', () => {
    expect(() => assertFeedingPlanDraft(FeedingPlanStatus.DRAFT)).not.toThrow();
    expect(() => assertFeedingPlanDraft(FeedingPlanStatus.ACTIVE)).toThrow(
      ConflictException,
    );
    expect(() => assertFeedingPlanDraft(FeedingPlanStatus.ARCHIVED)).toThrow(
      ConflictException,
    );
  });

  it('blocks approval while a deleted supply is still listed', () => {
    expect(() => assertNoDeletedSupplies([])).not.toThrow();
    expect(() => assertNoDeletedSupplies(['Yến mạch'])).toThrow('Yến mạch');
  });

  it('shows a groom only the active plan', () => {
    expect(() =>
      assertGroomSeesActivePlan(FeedingPlanStatus.ACTIVE),
    ).not.toThrow();
    expect(() => assertGroomSeesActivePlan(FeedingPlanStatus.DRAFT)).toThrow(
      ForbiddenException,
    );
  });
});
