import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { q } from '@actual-app/core/shared/query';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import type { DropPosition } from '#components/sort';
import { SchedulesProvider } from '#hooks/useCachedSchedules';
import { useCategories } from '#hooks/useCategories';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { useLocalPref } from '#hooks/useLocalPref';

import { BudgetCategories } from './BudgetCategories';
import { BudgetSummaries } from './BudgetSummaries';
import { BudgetTotals } from './BudgetTotals';
import { MonthsProvider } from './MonthsContext';
import type { MonthBounds } from './MonthsContext';
import { findSortDown, getGroupDropTarget, getScrollbarWidth } from './util';

type BudgetTableProps = {
  type: string;
  prewarmStartMonth: string;
  startMonth: string;
  numMonths: number;
  monthBounds: MonthBounds;
  onSaveCategory: (category: CategoryEntity) => void;
  onDeleteCategory: (id: CategoryEntity['id']) => void;
  onSaveGroup: (group: CategoryGroupEntity) => void;
  onDeleteGroup: (id: CategoryGroupEntity['id']) => void;
  onApplyBudgetTemplatesInGroup: (
    categoryIds: Array<CategoryEntity['id']>,
  ) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onReorderCategory: (params: {
    id: CategoryEntity['id'];
    groupId: CategoryGroupEntity['id'];
    targetId: CategoryEntity['id'] | null;
  }) => void;
  onReorderGroup: (params: {
    id: CategoryGroupEntity['id'];
    targetId: CategoryEntity['id'] | null;
    parentGroupId?: CategoryGroupEntity['id'] | null;
  }) => void;
  onIndentGroup: (id: CategoryGroupEntity['id']) => void;
  onOutdentGroup: (id: CategoryGroupEntity['id']) => void;
  onShowActivity: (id: CategoryEntity['id'], month?: string) => void;
  onBudgetAction: (month: string, type: string, args: unknown) => void;
};

export function BudgetTable(props: BudgetTableProps) {
  const {
    type,
    prewarmStartMonth,
    startMonth,
    numMonths,
    monthBounds,
    onSaveCategory,
    onDeleteCategory,
    onSaveGroup,
    onDeleteGroup,
    onApplyBudgetTemplatesInGroup,
    onSortCategories,
    onReorderCategory,
    onReorderGroup,
    onIndentGroup,
    onOutdentGroup,
    onShowActivity,
    onBudgetAction,
  } = props;

  const { data: { grouped: categoryGroups } = { grouped: [] } } =
    useCategories();
  const [collapsedGroupIds = [], setCollapsedGroupIdsPref] =
    useLocalPref('budget.collapsed');
  const [showHiddenCategories, setShowHiddenCategoriesPef] = useLocalPref(
    'budget.showHiddenCategories',
  );
  const [categoryExpandedStatePref] = useGlobalPref('categoryExpandedState');
  const categoryExpandedState = categoryExpandedStatePref ?? 0;
  const [editing, setEditing] = useState<{ id: string; cell: string } | null>(
    null,
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const savedScrollPosition = sessionStorage.getItem(
      'budget-scroll-position',
    );
    if (savedScrollPosition != null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = Number(savedScrollPosition);
      sessionStorage.removeItem('budget-scroll-position');
    }
  }, []);

  const onEditMonth = (id: string, month: string) => {
    setEditing(id ? { id, cell: month } : null);
  };

  const onEditName = (id: string) => {
    setEditing(id ? { id, cell: 'name' } : null);
  };

  const _onReorderCategory = (
    id: string,
    dropPos: DropPosition | null,
    targetId: string,
  ) => {
    const draggedCategory = categoryGroups
      .flatMap(g => g.categories ?? [])
      .find(cat => cat.id === id);
    if (!draggedCategory) {
      return;
    }

    const isGroup = !!categoryGroups.find(g => g.id === targetId);

    let group: CategoryGroupEntity | undefined;
    let shoveTargetId: CategoryEntity['id'] | null;

    if (isGroup) {
      // Dropped directly on a group's own header row - always means
      // "put this category into this group", regardless of dropPos.
      // There's no meaningful "before" or "after" a group for a
      // category, since a category can't become a group's sibling.
      // (This used to look at the category's position in the flat,
      // non-hierarchical group list to guess a "previous group" - that
      // only worked when every group was top-level, and broke for
      // nested or empty groups.)
      group = categoryGroups.find(g => g.id === targetId);
      const categories = group?.categories ?? [];
      shoveTargetId = categories.length === 0 ? null : categories[0].id;
    } else {
      group = categoryGroups.find(({ categories = [] }) =>
        categories.some(cat => cat.id === targetId),
      );
      shoveTargetId = group
        ? findSortDown(group.categories || [], dropPos, targetId).targetId
        : null;
    }

    // A category can't move to a group of a different income/expense
    // type - checked here so it's silently refused, same as an invalid
    // group drop, rather than left to the server-side rejection alone.
    if (!group || draggedCategory.is_income !== group.is_income) {
      return;
    }

    onReorderCategory({ id, groupId: group.id, targetId: shoveTargetId });
  };

  const _onReorderGroup = (
    id: string,
    dropPos: DropPosition | null,
    targetId: string,
  ) => {
    if (!dropPos) {
      return;
    }
    const target = getGroupDropTarget(categoryGroups, id, dropPos, targetId);
    if (target) {
      onReorderGroup({ id, ...target });
    }
  };

  const moveVertically = (dir: 1 | -1) => {
    const flattened = categoryGroups.reduce(
      (all, group) => {
        if (collapsedGroupIds.includes(group.id)) {
          return all.concat({ id: group.id, isGroup: true });
        }
        return all.concat([
          { id: group.id, isGroup: true },
          ...(group?.categories || []),
        ]);
      },
      [] as Array<
        { id: CategoryGroupEntity['id']; isGroup: boolean } | CategoryEntity
      >,
    );

    if (editing) {
      const idx = flattened.findIndex(item => item.id === editing.id);
      let nextIdx = idx + dir;

      while (nextIdx >= 0 && nextIdx < flattened.length) {
        const next = flattened[nextIdx];

        if ('isGroup' in next && next.isGroup) {
          nextIdx += dir;
          continue;
        } else if (
          type === 'tracking' ||
          ('is_income' in next && !next.is_income)
        ) {
          onEditMonth(next.id, editing.cell);
          return;
        } else {
          break;
        }
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!editing) {
      return null;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      moveVertically(e.shiftKey ? -1 : 1);
    }
  };

  const onCollapse = (collapsedIds: string[]) => {
    setCollapsedGroupIdsPref(collapsedIds);
  };

  const onToggleHiddenCategories = () => {
    setShowHiddenCategoriesPef(!showHiddenCategories);
  };

  const toggleHiddenCategories = () => {
    onToggleHiddenCategories();
  };

  const expandAllCategories = () => {
    onCollapse([]);
  };

  const collapseAllCategories = () => {
    onCollapse(categoryGroups.map(g => g.id));
  };

  const _onShowActivity = (id: string, month?: string) => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem(
        'budget-scroll-position',
        String(scrollContainerRef.current.scrollTop),
      );
    }
    onShowActivity(id, month);
  };

  const schedulesQuery = useMemo(() => q('schedules').select('*'), []);

  return (
    <View
      data-testid="budget-table"
      style={{
        flex: 1,
        ...(styles.lightScrollbar && {
          '& ::-webkit-scrollbar': {
            backgroundColor: 'transparent',
          },
          '& ::-webkit-scrollbar-thumb:vertical': {
            backgroundColor: theme.pageTextSubdued,
            // changed from tableHeaderBackground. pageTextSubdued is always visible on pageBackground
          },
        }),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          overflow: 'hidden',
          flexShrink: 0,
          // This is necessary to align with the table because the
          // table has this padding to allow the shadow to show
          paddingLeft: 5,
          paddingRight: 5 + getScrollbarWidth(),
        }}
      >
        <View style={{ width: 200 + 100 * categoryExpandedState }} />
        <MonthsProvider
          startMonth={prewarmStartMonth}
          numMonths={numMonths}
          monthBounds={monthBounds}
          type={type}
        >
          <BudgetSummaries />
        </MonthsProvider>
      </View>

      <MonthsProvider
        startMonth={startMonth}
        numMonths={numMonths}
        monthBounds={monthBounds}
        type={type}
      >
        <BudgetTotals
          toggleHiddenCategories={toggleHiddenCategories}
          expandAllCategories={expandAllCategories}
          collapseAllCategories={collapseAllCategories}
        />
        <View
          ref={scrollContainerRef}
          data-testid="budget-table-scroll-container"
          style={{
            overflowY: 'scroll',
            overflowAnchor: 'none',
            flex: 1,
            paddingLeft: 5,
            paddingRight: 5,
          }}
        >
          <View
            style={{
              flexShrink: 0,
            }}
            onKeyDown={onKeyDown}
          >
            <SchedulesProvider query={schedulesQuery}>
              <BudgetCategories
                categoryGroups={categoryGroups}
                editingCell={editing}
                onEditMonth={onEditMonth}
                onEditName={onEditName}
                onSaveCategory={onSaveCategory}
                onSaveGroup={onSaveGroup}
                onDeleteCategory={onDeleteCategory}
                onDeleteGroup={onDeleteGroup}
                onReorderCategory={_onReorderCategory}
                onReorderGroup={_onReorderGroup}
                onIndentGroup={onIndentGroup}
                onOutdentGroup={onOutdentGroup}
                onBudgetAction={onBudgetAction}
                onShowActivity={_onShowActivity}
                onApplyBudgetTemplatesInGroup={onApplyBudgetTemplatesInGroup}
                onSortCategories={onSortCategories}
              />
            </SchedulesProvider>
          </View>
        </View>
      </MonthsProvider>
    </View>
  );
}

BudgetTable.displayName = 'BudgetTable';
