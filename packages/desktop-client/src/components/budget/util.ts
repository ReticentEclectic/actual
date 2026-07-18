// @ts-strict-ignore
import { styles } from '@actual-app/components/styles';
import type { CSSProperties } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { send } from '@actual-app/core/platform/client/connection';
import { groupCategoryGroupsIntoTree } from '@actual-app/core/shared/categories';
import * as monthUtils from '@actual-app/core/shared/months';
import {
  currencyToAmount,
  integerToCurrency,
} from '@actual-app/core/shared/util';
import type { Handlers } from '@actual-app/core/types/handlers';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import type { SyncedPrefs } from '@actual-app/core/types/prefs';
import { t } from 'i18next';

import type { DropPosition } from '#components/sort';
import type { useSpreadsheet } from '#hooks/useSpreadsheet';

import { getValidMonthBounds } from './MonthsContext';

export function addToBeBudgetedGroup(groups: CategoryGroupEntity[]) {
  return [
    {
      id: 'to-budget',
      name: t('To Budget'),
      categories: [
        {
          id: 'to-budget',
          name: t('To Budget'),
          group: 'to-budget',
        },
      ],
    } as CategoryGroupEntity,
    ...groups,
  ];
}

export function removeCategoriesFromGroups(
  categoryGroups: CategoryGroupEntity[],
  ...categoryIds: CategoryEntity['id'][]
) {
  if (categoryIds.length === 0) return categoryGroups;

  const categoryIdsSet = new Set(categoryIds);

  return categoryGroups
    .map(group => ({
      ...group,
      categories:
        group.categories?.filter(cat => !categoryIdsSet.has(cat.id)) ?? [],
    }))
    .filter(group => group.categories?.length);
}

export function separateGroups(categoryGroups: CategoryGroupEntity[]) {
  const tree = groupCategoryGroupsIntoTree(categoryGroups);
  return [tree.filter(g => !g.is_income), tree.find(g => g.is_income)] as const;
}

type GroupReparentTarget = {
  parentGroupId: CategoryGroupEntity['id'] | null;
  targetId: CategoryGroupEntity['id'] | null;
};

function siblingsOf(
  categoryGroups: CategoryGroupEntity[],
  parentGroupId: CategoryGroupEntity['id'] | null,
) {
  return categoryGroups
    .filter(g => (g.parent_group_id ?? null) === parentGroupId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// "Increase indent" - nest a group under the sibling immediately above
// it, becoming that sibling's last child. Unavailable if the group is
// already first among its siblings, or if the sibling above it is a
// different income/expense type (nesting must keep types consistent -
// same rule enforced server-side in budget/app.ts's moveCategoryGroup).
export function getIndentTarget(
  categoryGroups: CategoryGroupEntity[],
  group: CategoryGroupEntity,
): GroupReparentTarget | null {
  const siblings = siblingsOf(categoryGroups, group.parent_group_id ?? null);
  const index = siblings.findIndex(g => g.id === group.id);
  const prevSibling = siblings[index - 1];

  if (!prevSibling || prevSibling.is_income !== group.is_income) {
    return null;
  }

  return { parentGroupId: prevSibling.id, targetId: null };
}

// "Decrease indent" - promote a group to be its own parent's next
// sibling, moving up one level. Unavailable if the group is already
// top-level (nothing to promote out of).
export function getOutdentTarget(
  categoryGroups: CategoryGroupEntity[],
  group: CategoryGroupEntity,
): GroupReparentTarget | null {
  const parentId = group.parent_group_id;
  if (!parentId) {
    return null;
  }

  const parent = categoryGroups.find(g => g.id === parentId);
  if (!parent) {
    return null;
  }

  const grandparentId = parent.parent_group_id ?? null;

  // There's always exactly one top-level income group - the budget math
  // and the sidebar rendering both assume it (they grab the first
  // top-level is_income group they find and ignore any others).
  // Outdenting a direct child of it would create a second one, which
  // nothing expects, so it's silently not offered rather than left to
  // produce a group that quietly disappears from the budget.
  if (grandparentId === null && group.is_income) {
    return null;
  }

  const parentSiblings = siblingsOf(categoryGroups, grandparentId);
  const parentIndex = parentSiblings.findIndex(g => g.id === parentId);
  const nextSiblingOfParent = parentSiblings[parentIndex + 1];

  return {
    parentGroupId: grandparentId,
    targetId: nextSiblingOfParent ? nextSiblingOfParent.id : null,
  };
}

// How far, in pixels, each level of category-group nesting shifts a row.
// Used by SidebarGroup and SidebarCategory to indent nested rows.
export const SUBGROUP_INDENT_WIDTH = 14;

export function makeAmountGrey(value: number | string | null): CSSProperties {
  return value === 0 || value === '0' || value === '' || value == null
    ? { color: theme.budgetNumberZero }
    : null;
}

export function makeBalanceAmountStyle(
  value: number,
  goalValue?: number | null,
  budgetedValue?: number | null,
) {
  // Converts an integer currency value to a normalized decimal amount.
  // First converts the integer to currency format, then to a decimal amount.
  // Uses integerToCurrency to display the value correctly according to user prefs.

  const normalizeIntegerValue = (val: number | null | undefined) =>
    typeof val === 'number' ? currencyToAmount(integerToCurrency(val)) : 0;

  const currencyValue = normalizeIntegerValue(value);

  if (currencyValue < 0) {
    return { color: theme.budgetNumberNegative };
  }

  if (goalValue == null) {
    const greyed = makeAmountGrey(currencyValue);
    if (greyed) {
      return greyed;
    }
    return { color: theme.budgetNumberPositive };
  } else {
    const budgetedAmount = normalizeIntegerValue(budgetedValue);
    const goalAmount = normalizeIntegerValue(goalValue);

    if (budgetedAmount < goalAmount) {
      return { color: theme.templateNumberUnderFunded };
    }
    return { color: theme.templateNumberFunded };
  }
}

export function makeAmountFullStyle(
  value: number,
  colors?: {
    positiveColor?: string;
    negativeColor?: string;
    zeroColor?: string;
  },
) {
  const positiveColorToUse =
    colors?.positiveColor || theme.budgetNumberPositive;
  const negativeColorToUse =
    colors?.negativeColor || theme.budgetNumberNegative;
  const zeroColorToUse = colors?.zeroColor || theme.budgetNumberZero;
  return {
    color:
      value < 0
        ? negativeColorToUse
        : value === 0
          ? zeroColorToUse
          : positiveColorToUse,
  };
}

export function findSortDown<T extends { id: string }>(
  arr: T[],
  pos: DropPosition | null,
  targetId: string,
) {
  if (pos === 'top') {
    return { targetId };
  } else {
    const idx = arr.findIndex(item => item.id === targetId);

    if (idx === -1) {
      throw new Error('findSort: item not found: ' + targetId);
    }

    const newIdx = idx + 1;
    if (newIdx < arr.length) {
      return { targetId: arr[newIdx].id };
    } else {
      // Move to the end
      return { targetId: null };
    }
  }
}

export function findSortUp<T extends { id: string }>(
  arr: T[],
  pos: DropPosition | null,
  targetId: string,
) {
  if (pos === 'bottom') {
    return { targetId };
  } else {
    const idx = arr.findIndex(item => item.id === targetId);

    if (idx === -1) {
      throw new Error('findSort: item not found: ' + targetId);
    }

    const newIdx = idx - 1;
    if (newIdx >= 0) {
      return { targetId: arr[newIdx].id };
    } else {
      // Move to the beginning
      return { targetId: null };
    }
  }
}

export function getScrollbarWidth() {
  return Math.max(styles.scrollbarWidth - 2, 0);
}

export async function prewarmMonth(
  budgetType: SyncedPrefs['budgetType'],
  spreadsheet: ReturnType<typeof useSpreadsheet>,
  month: string,
) {
  const method: keyof Handlers =
    budgetType === 'tracking'
      ? 'tracking-budget-month'
      : 'envelope-budget-month';

  const values = await send(method, { month });

  for (const value of values) {
    spreadsheet.prewarmCache(value.name, value);
  }
}

export async function prewarmAllMonths(
  budgetType: SyncedPrefs['budgetType'],
  spreadsheet: ReturnType<typeof useSpreadsheet>,
  bounds: { start: string; end: string },
  startMonth: string,
) {
  const numMonths = 3;

  bounds = getValidMonthBounds(
    bounds,
    monthUtils.subMonths(startMonth, 1),
    monthUtils.addMonths(startMonth, numMonths + 1),
  );
  const months = monthUtils.rangeInclusive(bounds.start, bounds.end);

  await Promise.all(
    months.map(month => prewarmMonth(budgetType, spreadsheet, month)),
  );
}
