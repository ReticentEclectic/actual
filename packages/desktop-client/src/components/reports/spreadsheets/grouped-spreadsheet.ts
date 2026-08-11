import { send } from '@actual-app/core/platform/client/connection';
import { getDescendantGroupIds, groupCategoryGroupsIntoTree } from '@actual-app/core/shared/categories';
import type { CategoryGroupNode } from '@actual-app/core/shared/categories';
import * as monthUtils from '@actual-app/core/shared/months';
import type { GroupedEntity } from '@actual-app/core/types/models';

import {
  categoryLists,
  ReportOptions,
} from '#components/reports/ReportOptions';
import type { QueryDataEntity } from '#components/reports/ReportOptions';
import type { useSpreadsheet } from '#hooks/useSpreadsheet';

import type { createCustomSpreadsheetProps } from './custom-spreadsheet';
import { fetchSpreadsheetQueryData } from './fetchSpreadsheetQueryData';
import { filterEmptyRows } from './filterEmptyRows';
import { recalculate } from './recalculate';
import { sortData } from './sortData';
import {
  determineIntervalRange,
  trimGroupedDataIntervals,
} from './trimIntervals';

export function createGroupedSpreadsheet({
  startDate,
  endDate,
  interval,
  categories,
  budgetType = 'envelope',
  conditions = [],
  conditionsOp,
  showEmpty,
  showOffBudget,
  showHiddenCategories,
  showUncategorized,
  trimIntervals,
  balanceTypeOp,
  sortByOp,
  firstDayOfWeekIdx,
}: createCustomSpreadsheetProps) {
  const [categoryList, categoryGroup] = categoryLists(categories);

  return async (
    spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (data: GroupedEntity[]) => void,
  ) => {
    if (categoryList.length === 0) {
      setData([]);
      return;
    }

    const { filters } = await send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    });
    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    let assets: QueryDataEntity[];
    let debts: QueryDataEntity[];

    ({ assets, debts } = await fetchSpreadsheetQueryData({
      balanceTypeOp,
      startDate,
      endDate,
      interval,
      categories: categories.list,
      categoryGroups: categories.grouped,
      conditions,
      conditionsOp,
      conditionsOpKey,
      filters,
      budgetType,
    }));

    if (interval === 'Weekly' && balanceTypeOp !== 'totalBudgeted') {
      debts = debts.map(d => {
        return {
          ...d,
          date: monthUtils.weekFromDate(d.date, firstDayOfWeekIdx),
        };
      });
      assets = assets.map(d => {
        return {
          ...d,
          date: monthUtils.weekFromDate(d.date, firstDayOfWeekIdx),
        };
      });
    }

    const intervals =
      interval === 'Weekly'
        ? monthUtils.weekRangeInclusive(startDate, endDate, firstDayOfWeekIdx)
        : monthUtils[
            ReportOptions.intervalRange.get(interval) || 'rangeInclusive'
          ](startDate, endDate);

    function buildGroupedRow(group: CategoryGroupNode): GroupedEntity {
      const grouped = recalculate({
        item: group,
        intervals,
        assets,
        debts,
        groupByLabel: 'categoryGroup',
        showOffBudget,
        showHiddenCategories,
        showUncategorized,
        startDate,
        endDate,
        matchingGroupIds: getDescendantGroupIds(group.id, categories.grouped),
      });

      const stackedCategories =
        group.categories &&
        group.categories.map(item => {
          const calc = recalculate({
            item,
            intervals,
            assets,
            debts,
            groupByLabel: 'category',
            showOffBudget,
            showHiddenCategories,
            showUncategorized,
            startDate,
            endDate,
          });
          return { ...calc };
        });

      const filteredCategories = stackedCategories?.filter(i =>
        filterEmptyRows({ showEmpty, data: i, balanceTypeOp }),
      );

      const subgroupRows = (group.subgroups ?? []).map(buildGroupedRow);
      const filteredSubgroups = subgroupRows.filter(i =>
        filterEmptyRows({ showEmpty, data: i, balanceTypeOp }),
      );

      return {
        ...grouped,
        // An empty array is still truthy in JS, and the table renders a
        // row as a bold group header based on `item.categories`/
        // `item.subgroups` being present — so "filtered down to zero"
        // needs to become undefined, not [], or an empty group would
        // render as if it still had contents.
        categories:
          filteredCategories && filteredCategories.length > 0
            ? filteredCategories
            : undefined,
        subgroups: filteredSubgroups.length > 0 ? filteredSubgroups : undefined,
      };
    }

    const groupTree = groupCategoryGroupsIntoTree(categories.grouped);
    const realGroupRows = groupTree.map(buildGroupedRow);

    // The synthetic "Uncategorized & Off budget" entry (appended by
    // categoryLists) never has real subgroups of its own, so it's
    // handled once here rather than through the recursive tree above -
    // same per-group total + leaf-category calculation, just not
    // recursive, since there's nothing to recurse into.
    const uncategorizedEntry = categoryGroup.find(
      group => 'uncategorized_id' in group && group.uncategorized_id != null,
    );

    const uncategorizedRow: GroupedEntity | null = uncategorizedEntry
      ? (() => {
          const grouped = recalculate({
            item: uncategorizedEntry,
            intervals,
            assets,
            debts,
            groupByLabel: 'categoryGroup',
            showOffBudget,
            showHiddenCategories,
            showUncategorized,
            startDate,
            endDate,
            matchingGroupIds: getDescendantGroupIds(
              uncategorizedEntry.id,
              categories.grouped,
            ),
          });

          const stackedCategories =
            uncategorizedEntry.categories &&
            uncategorizedEntry.categories.map(item => {
              const calc = recalculate({
                item,
                intervals,
                assets,
                debts,
                groupByLabel: 'category',
                showOffBudget,
                showHiddenCategories,
                showUncategorized,
                startDate,
                endDate,
              });
              return { ...calc };
            });

          const filteredCategories = stackedCategories?.filter(i =>
            filterEmptyRows({ showEmpty, data: i, balanceTypeOp }),
          );

          return {
            ...grouped,
            categories:
              filteredCategories && filteredCategories.length > 0
                ? filteredCategories
                : undefined,
          };
        })()
      : null;

    const groupedData: GroupedEntity[] = [
      ...realGroupRows,
      ...(uncategorizedRow ? [uncategorizedRow] : []),
    ];

    const groupedDataFiltered = groupedData.filter(i =>
      filterEmptyRows({ showEmpty, data: i, balanceTypeOp }),
    );

    // Determine interval range across all groups and their nested
    // categories/subgroups, recursively.
    function collectForTrimming(
      group: GroupedEntity,
      out: GroupedEntity[],
    ): void {
      out.push(group);
      if (group.categories) {
        out.push(...group.categories);
      }
      if (group.subgroups) {
        group.subgroups.forEach(subgroup => collectForTrimming(subgroup, out));
      }
    }

    const allGroupsForTrimming: GroupedEntity[] = [];
    groupedDataFiltered.forEach(group =>
      collectForTrimming(group, allGroupsForTrimming),
    );

    const { startIndex, endIndex } = determineIntervalRange(
      allGroupsForTrimming,
      groupedDataFiltered.length > 0 ? groupedDataFiltered[0].intervalData : [],
      trimIntervals,
      balanceTypeOp,
    );

    // Trim all groupedData intervals (including nested categories) based on the range
    trimGroupedDataIntervals(groupedDataFiltered, startIndex, endIndex);

    function sortGroupedRow(group: GroupedEntity): GroupedEntity {
      // Preserve undefined-vs-empty (see the empty-array-is-truthy note
      // above) rather than always assigning an array back.
      if (group.categories) {
        group.categories = [...group.categories].sort(
          sortData({ balanceTypeOp, sortByOp }),
        );
      }
      group.subgroups = group.subgroups
        ?.map(sortGroupedRow)
        .sort(sortData({ balanceTypeOp, sortByOp }));
      return group;
    }

    const sortedGroupedDataFiltered = [...groupedDataFiltered]
      .sort(sortData({ balanceTypeOp, sortByOp }))
      .map(sortGroupedRow);

    setData(sortedGroupedDataFiltered);
  };
}
