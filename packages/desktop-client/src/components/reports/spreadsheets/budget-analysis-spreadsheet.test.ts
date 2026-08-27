import { rangeInclusive } from '@actual-app/core/shared/months';
import type { CategoryEntity } from '@actual-app/core/types/models';

import {
  filterCategoriesByGroupConditions,
  getLastSelectableMonth,
  getNextRunningBalance,
  isBaseCategory,
  summarizeMonthCategories,
} from './budget-analysis-spreadsheet';
import type { BudgetMonthCell } from './budgetMonthCell';

const makeCategory = (
  overrides: Partial<CategoryEntity> & Pick<CategoryEntity, 'id' | 'name'>,
): CategoryEntity => ({
  is_income: false,
  hidden: false,
  group: 'group1',
  ...overrides,
});

const visibleExpense = makeCategory({ id: 'c1', name: 'Groceries' });
const hiddenExpense = makeCategory({
  id: 'c2',
  name: 'Car Fund',
  hidden: true,
});
const incomeCategory = makeCategory({
  id: 'c3',
  name: 'Salary',
  is_income: true,
});
const hiddenIncome = makeCategory({
  id: 'c4',
  name: 'Hidden Income',
  is_income: true,
  hidden: true,
});

const all = [visibleExpense, hiddenExpense, incomeCategory, hiddenIncome];

function filterBaseCategories(
  categories: CategoryEntity[],
  showHiddenCategories: boolean,
): CategoryEntity[] {
  return categories.filter(cat => isBaseCategory(cat, showHiddenCategories));
}

describe('createBudgetAnalysisSpreadsheet', () => {
  describe('hidden category filtering', () => {
    it('excludes hidden categories when showHiddenCategories is false', () => {
      const result = filterBaseCategories(all, false);
      expect(result).toContain(visibleExpense);
      expect(result).not.toContain(hiddenExpense);
    });

    it('includes hidden expense categories when showHiddenCategories is true', () => {
      const result = filterBaseCategories(all, true);
      expect(result).toContain(visibleExpense);
      expect(result).toContain(hiddenExpense);
    });

    it('always excludes income categories regardless of showHiddenCategories', () => {
      const resultFalse = filterBaseCategories(all, false);
      const resultTrue = filterBaseCategories(all, true);
      expect(resultFalse).not.toContain(incomeCategory);
      expect(resultFalse).not.toContain(hiddenIncome);
      expect(resultTrue).not.toContain(incomeCategory);
      expect(resultTrue).not.toContain(hiddenIncome);
    });

    it('returns only visible expense categories by default', () => {
      const result = filterBaseCategories(all, false);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(visibleExpense);
    });

    it('returns all expense categories when flag is true', () => {
      const result = filterBaseCategories(all, true);
      expect(result).toHaveLength(2);
      expect(result).toContain(visibleExpense);
      expect(result).toContain(hiddenExpense);
    });
  });

  describe('getLastSelectableMonth', () => {
    it('extends the range to December of next year', () => {
      expect(getLastSelectableMonth('2026-06', '2026-06')).toBe('2027-12');
    });

    it('ends in December regardless of the current month', () => {
      for (const month of ['2024-01', '2024-06', '2024-12']) {
        expect(getLastSelectableMonth(month, month)).toBe('2025-12');
      }
    });

    it('keeps a later transaction month selectable', () => {
      // A transaction dated past December of next year must not be cut off.
      expect(getLastSelectableMonth('2026-08', '2028-03')).toBe('2028-03');
    });

    it('prefers December of next year when the latest transaction is earlier', () => {
      expect(getLastSelectableMonth('2026-08', '2026-11')).toBe('2027-12');
    });

    it('keeps the boundary month itself', () => {
      expect(getLastSelectableMonth('2026-08', '2027-12')).toBe('2027-12');
    });

    it('produces a range that spans from the earliest month to the endpoint', () => {
      const range = rangeInclusive(
        '2026-06',
        getLastSelectableMonth('2026-06', '2026-06'),
      );

      expect(range[0]).toBe('2026-06');
      expect(range[range.length - 1]).toBe('2027-12');
    });

    it('lists future months before the current month once reversed', () => {
      const last = getLastSelectableMonth('2026-06', '2026-06');
      const allMonths = rangeInclusive('2026-06', last).reverse();

      expect(allMonths[0]).toBe(last);
      expect(allMonths[allMonths.length - 1]).toBe('2026-06');
    });
  });

  describe('summarizeMonthCategories', () => {
    const cells = (
      values: Record<string, number | boolean>,
    ): BudgetMonthCell[] =>
      Object.entries(values).map(([name, value]) => ({
        name: `budget202601!${name}`,
        value,
      })) as BudgetMonthCell[];

    it('reports no budget data when every cell is empty', () => {
      const result = summarizeMonthCategories([], [visibleExpense]);

      expect(result).toEqual({
        budgeted: 0,
        spent: 0,
        carryoverToNextMonth: 0,
        overspendingThisMonth: 0,
        hasBudgetData: false,
      });
    });

    it('reports no budget data for a never-budgeted month', () => {
      // `envelope-budget-month` emits a cell for every category in every
      // month, so an untouched future month arrives as present-but-zero
      // cells rather than as missing ones. Presence alone cannot distinguish
      // it from a real month.
      const result = summarizeMonthCategories(
        cells({
          'budget-c1': 0,
          'sum-amount-c1': 0,
          'leftover-c1': 0,
          'carryover-c1': false,
        }),
        [visibleExpense],
      );

      expect(result.hasBudgetData).toBe(false);
    });

    it('carries a positive balance to the next month', () => {
      const result = summarizeMonthCategories(
        cells({
          'budget-c1': 10000,
          'sum-amount-c1': -4000,
          'leftover-c1': 6000,
          'carryover-c1': false,
        }),
        [visibleExpense],
      );

      expect(result.carryoverToNextMonth).toBe(6000);
      expect(result.overspendingThisMonth).toBe(0);
      expect(result.hasBudgetData).toBe(true);
    });

    it('treats an overspend without carryover as an overspending adjustment', () => {
      const result = summarizeMonthCategories(
        cells({
          'budget-c1': 0,
          'sum-amount-c1': -10000,
          'leftover-c1': -10000,
          'carryover-c1': false,
        }),
        [visibleExpense],
      );

      expect(result.carryoverToNextMonth).toBe(0);
      expect(result.overspendingThisMonth).toBe(-10000);
      expect(result.hasBudgetData).toBe(true);
    });

    it('carries a negative balance forward when carryover is enabled', () => {
      const result = summarizeMonthCategories(
        cells({
          'budget-c1': 0,
          'sum-amount-c1': -10000,
          'leftover-c1': -10000,
          'carryover-c1': true,
        }),
        [visibleExpense],
      );

      expect(result.carryoverToNextMonth).toBe(-10000);
      expect(result.overspendingThisMonth).toBe(0);
    });

    it('only counts the categories it is given', () => {
      const result = summarizeMonthCategories(
        cells({
          'budget-c1': 10000,
          'leftover-c1': 10000,
          'budget-c2': 5000,
          'leftover-c2': 5000,
        }),
        [visibleExpense],
      );

      expect(result.budgeted).toBe(10000);
      expect(result.carryoverToNextMonth).toBe(10000);
    });
  });

  describe('getNextRunningBalance', () => {
    it('hands off only what carries over when the month has data', () => {
      expect(
        getNextRunningBalance({
          hasBudgetData: true,
          carryoverToNextMonth: 6000,
          runningBalance: 20000,
        }),
      ).toBe(6000);
    });

    it('resets a non-carryover overspend instead of dragging it forward', () => {
      // The overspend surfaces as next month's overspending adjustment, so it
      // must not also reduce the running balance.
      expect(
        getNextRunningBalance({
          hasBudgetData: true,
          carryoverToNextMonth: 0,
          runningBalance: 20000,
        }),
      ).toBe(0);
    });

    it('passes the running balance through months with no budget data', () => {
      expect(
        getNextRunningBalance({
          hasBudgetData: false,
          carryoverToNextMonth: 0,
          runningBalance: 20000,
        }),
      ).toBe(20000);
    });

    it('preserves a balance across a run of empty future months', () => {
      let runningBalance = 15000;
      for (let i = 0; i < 6; i++) {
        runningBalance = getNextRunningBalance({
          hasBudgetData: false,
          carryoverToNextMonth: 0,
          runningBalance,
        });
      }

      expect(runningBalance).toBe(15000);
    });

    it('does not carry a non-carryover overspend into later empty months', () => {
      // Overspend of -10000 in a category without carryover enabled.
      let runningBalance = getNextRunningBalance({
        hasBudgetData: true,
        carryoverToNextMonth: 0,
        runningBalance: 0,
      });

      for (let i = 0; i < 3; i++) {
        runningBalance = getNextRunningBalance({
          hasBudgetData: false,
          carryoverToNextMonth: 0,
          runningBalance,
        });
      }

      expect(runningBalance).toBe(0);
    });
  });

  describe('filterCategoriesByGroupConditions', () => {
    const billsGroupId = 'bills-group';
    const utilitiesGroupId = 'utilities-group';
    const funGroupId = 'fun-group';

    const allCategoryGroups = [
      { id: billsGroupId, name: 'Bills', parent_group_id: null },
      {
        id: utilitiesGroupId,
        name: 'Utilities',
        parent_group_id: billsGroupId,
      },
      { id: funGroupId, name: 'Fun', parent_group_id: null },
    ];

    const rent = makeCategory({
      id: 'rent',
      name: 'Rent',
      group: billsGroupId,
    });
    const electric = makeCategory({
      id: 'electric',
      name: 'Electric',
      group: utilitiesGroupId,
    });
    const movies = makeCategory({
      id: 'movies',
      name: 'Movies',
      group: funGroupId,
    });

    const categories = [rent, electric, movies];

    it('returns all categories when there are no relevant conditions', () => {
      const result = filterCategoriesByGroupConditions(
        categories,
        [],
        'and',
        allCategoryGroups,
      );

      expect(result).toEqual(categories);
    });

    it('matches an exact category id', () => {
      const result = filterCategoriesByGroupConditions(
        categories,
        [{ field: 'category', op: 'is', value: 'rent' }],
        'and',
        allCategoryGroups,
      );

      expect(result).toEqual([rent]);
    });

    it('matches categories both directly in the target group and in a nested subgroup', () => {
      const result = filterCategoriesByGroupConditions(
        categories,
        [{ field: 'category_group', op: 'is', value: billsGroupId }],
        'and',
        allCategoryGroups,
      );

      // Electric's immediate group is Utilities, not Bills — but Utilities
      // is a subgroup of Bills, so it should match too, not just Rent.
      expect(result).toEqual(expect.arrayContaining([rent, electric]));
      expect(result).toHaveLength(2);
      expect(result).not.toContain(movies);
    });

    it("text-based operators match only the category's own immediate group name, not descendants", () => {
      const result = filterCategoriesByGroupConditions(
        categories,
        [{ field: 'category_group', op: 'contains', value: 'Bill' }],
        'and',
        allCategoryGroups,
      );

      // Electric's immediate group is "Utilities", which doesn't contain
      // "Bill" — unlike the id-based 'is' case above, this should NOT expand
      // to match it just because Utilities is nested under Bills.
      expect(result).toEqual([rent]);
    });

    it('combines multiple conditions with AND', () => {
      const result = filterCategoriesByGroupConditions(
        categories,
        [
          { field: 'category_group', op: 'is', value: billsGroupId },
          { field: 'category', op: 'is', value: 'rent' },
        ],
        'and',
        allCategoryGroups,
      );

      expect(result).toEqual([rent]);
    });

    it('combines multiple conditions with OR', () => {
      const result = filterCategoriesByGroupConditions(
        categories,
        [
          { field: 'category_group', op: 'is', value: funGroupId },
          { field: 'category', op: 'is', value: 'rent' },
        ],
        'or',
        allCategoryGroups,
      );

      expect(result).toEqual(expect.arrayContaining([rent, movies]));
      expect(result).toHaveLength(2);
    });
  });
});
