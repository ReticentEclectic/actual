import { describe, expect, test } from 'vitest';

import type {
  QueryDataEntity,
  UncategorizedEntity,
} from '#components/reports/ReportOptions';

import { recalculate } from './recalculate';

function makeRow(overrides: Partial<QueryDataEntity> = {}): QueryDataEntity {
  return {
    date: '2020-01',
    category: 'electric',
    categoryHidden: false,
    categoryGroup: 'bills',
    categoryGroupHidden: false,
    account: 'checking',
    accountOffBudget: false,
    payee: 'power-co',
    transferAccount: '',
    amount: -100,
    ...overrides,
  };
}

const billsGroup: UncategorizedEntity = {
  id: 'bills',
  name: 'Bills',
  hidden: false,
};

describe('recalculate', () => {
  test('categoryGroup total only includes rows in the exact group when matchingGroupIds is omitted', () => {
    const debts: QueryDataEntity[] = [
      makeRow({ categoryGroup: 'bills', amount: -100 }),
      // Lives in a subgroup of Bills, not directly in it — without
      // matchingGroupIds this should NOT be counted (today's behavior).
      makeRow({ categoryGroup: 'utilities', amount: -50 }),
    ];

    const result = recalculate({
      item: billsGroup,
      intervals: ['2020-01'],
      assets: [],
      debts,
      groupByLabel: 'categoryGroup',
      startDate: '2020-01-01',
      endDate: '2020-01-31',
    });

    expect(result.totalDebts).toBe(-100);
  });

  test('categoryGroup total rolls up a descendant subgroup when matchingGroupIds includes it', () => {
    const debts: QueryDataEntity[] = [
      makeRow({ categoryGroup: 'bills', amount: -100 }),
      makeRow({ categoryGroup: 'utilities', amount: -50 }),
      makeRow({ categoryGroup: 'unrelated', amount: -9999 }),
    ];

    const result = recalculate({
      item: billsGroup,
      intervals: ['2020-01'],
      assets: [],
      debts,
      groupByLabel: 'categoryGroup',
      startDate: '2020-01-01',
      endDate: '2020-01-31',
      matchingGroupIds: ['bills', 'utilities'],
    });

    expect(result.totalDebts).toBe(-150);
  });

  test('category (leaf) totals are unaffected by matchingGroupIds, always exact-match', () => {
    const electricCategory: UncategorizedEntity = {
      id: 'electric',
      name: 'Electric',
      hidden: false,
    };
    const debts: QueryDataEntity[] = [
      makeRow({ category: 'electric', amount: -100 }),
      makeRow({ category: 'water', amount: -30 }),
    ];

    const result = recalculate({
      item: electricCategory,
      intervals: ['2020-01'],
      assets: [],
      debts,
      groupByLabel: 'category',
      startDate: '2020-01-01',
      endDate: '2020-01-31',
    });

    expect(result.totalDebts).toBe(-100);
  });
});
