import * as monthUtils from '@actual-app/core/shared/months';
import type {
  GroupedEntity,
  IntervalEntity,
} from '@actual-app/core/types/models';

import type {
  QueryDataEntity,
  UncategorizedEntity,
} from '#components/reports/ReportOptions';

import { filterHiddenItems } from './filterHiddenItems';

type recalculateProps = {
  item: UncategorizedEntity;
  intervals: Array<string>;
  assets: QueryDataEntity[];
  debts: QueryDataEntity[];
  groupByLabel: 'category' | 'categoryGroup' | 'payee' | 'account';
  showOffBudget?: boolean;
  showHiddenCategories?: boolean;
  showUncategorized?: boolean;
  startDate: string;
  endDate: string;
  /**
   * For groupByLabel: 'categoryGroup' rollups only — the full set of
   * group ids that should count toward this item's total: its own id
   * plus every descendant subgroup's id, at any depth (see
   * getDescendantGroupIds). A row is included if its categoryGroup is
   * anywhere in this set, not just an exact match on item.id, so a
   * parent group's total correctly includes categories nested inside
   * its subgroups. Omit for groupings that don't nest (category,
   * payee, account), which keep today's exact-match behavior.
   */
  matchingGroupIds?: string[];
};

export function recalculate({
  item,
  intervals,
  assets,
  debts,
  groupByLabel,
  showOffBudget,
  showHiddenCategories,
  showUncategorized,
  startDate,
  endDate,
  matchingGroupIds,
}: recalculateProps): GroupedEntity {
  let totalAssets = 0;
  let totalDebts = 0;
  const intervalData = intervals.reduce(
    (arr: IntervalEntity[], intervalItem, index) => {
      const last = arr.length === 0 ? null : arr[arr.length - 1];

      const groupsByCategory =
        groupByLabel === 'category' || groupByLabel === 'categoryGroup';
      const matchesItem = (row: QueryDataEntity) =>
        matchingGroupIds
          ? matchingGroupIds.includes(row[groupByLabel] as string)
          : row[groupByLabel] === (item.id ?? null);
      const intervalAssets = filterHiddenItems(
        item,
        assets,
        showOffBudget,
        showHiddenCategories,
        showUncategorized,
        groupsByCategory,
      )
        .filter(
          asset =>
            asset.date === intervalItem &&
            (matchesItem(asset) || (item.uncategorized_id && groupsByCategory)),
        )
        .reduce((a, v) => a + v.amount, 0);
      totalAssets += intervalAssets;

      const intervalDebts = filterHiddenItems(
        item,
        debts,
        showOffBudget,
        showHiddenCategories,
        showUncategorized,
        groupsByCategory,
      )
        .filter(
          debt =>
            debt.date === intervalItem &&
            (matchesItem(debt) || (item.uncategorized_id && groupsByCategory)),
        )
        .reduce((a, v) => a + v.amount, 0);
      totalDebts += intervalDebts;

      const intervalTotals = intervalAssets + intervalDebts;

      const change = last ? intervalTotals - last.totalTotals : 0;

      arr.push({
        date: intervalItem,
        totalAssets: intervalAssets,
        totalDebts: intervalDebts,
        netAssets: intervalTotals > 0 ? intervalTotals : 0,
        netDebts: intervalTotals < 0 ? intervalTotals : 0,
        totalTotals: intervalTotals,
        totalBudgeted: intervalTotals,
        change,
        intervalStartDate: index === 0 ? startDate : intervalItem,
        intervalEndDate:
          index + 1 === intervals.length
            ? endDate
            : monthUtils.subDays(intervals[index + 1], 1),
      });

      return arr;
    },
    [],
  );

  const totalTotals = totalAssets + totalDebts;

  return {
    id: item.id || '',
    name: item.name,
    uncategorizedId: item.uncategorized_id,
    totalAssets,
    totalDebts,
    netAssets: totalTotals > 0 ? totalTotals : 0,
    netDebts: totalTotals < 0 ? totalTotals : 0,
    totalTotals,
    totalBudgeted: totalTotals,
    intervalData,
  };
}
