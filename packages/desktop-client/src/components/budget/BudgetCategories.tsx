import React, { memo, useMemo, useState } from 'react';

import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryGroupNode } from '@actual-app/core/shared/categories';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { DropHighlightPosContext } from '#components/sort';
import type { DragState, OnDropCallback } from '#components/sort';
import { Row } from '#components/table';
import { useLocalPref } from '#hooks/useLocalPref';

import { ExpenseCategory } from './ExpenseCategory';
import { ExpenseGroup } from './ExpenseGroup';
import { IncomeCategory } from './IncomeCategory';
import { IncomeGroup } from './IncomeGroup';
import { IncomeHeader } from './IncomeHeader';
import { SidebarCategory } from './SidebarCategory';
import { SidebarGroup } from './SidebarGroup';
import { separateGroups } from './util';

type BudgetItem =
  | { type: 'new-group'; depth: number; parentId?: CategoryGroupEntity['id'] }
  | { type: 'new-category' }
  | { type: 'expense-group'; value: CategoryGroupEntity; depth: number }
  | {
      type: 'expense-category';
      value: CategoryEntity;
      group: CategoryGroupEntity;
      depth: number;
    }
  | { type: 'income-separator' }
  | { type: 'income-group'; value: CategoryGroupEntity; depth: number }
  | { type: 'income-category'; value: CategoryEntity; depth: number };

type LocalDragState =
  | DragState<CategoryEntity>
  | DragState<CategoryGroupEntity>
  | null;

type BudgetCategoriesProps = {
  categoryGroups: CategoryGroupEntity[];
  editingCell: { id: string; cell: string } | null;
  onBudgetAction: (month: string, action: string, arg: unknown) => void;
  onShowActivity: (id: CategoryEntity['id'], month?: string) => void;
  onEditName: (id: CategoryEntity['id']) => void;
  onEditMonth: (id: CategoryEntity['id'], month: string) => void;
  onSaveCategory: (category: CategoryEntity) => void;
  onSaveGroup: (group: CategoryGroupEntity) => void;
  onDeleteCategory: (id: CategoryEntity['id']) => void;
  onDeleteGroup: (id: CategoryGroupEntity['id']) => void;
  onApplyBudgetTemplatesInGroup: (categoryIds: CategoryEntity['id'][]) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onReorderCategory: OnDropCallback;
  onReorderGroup: OnDropCallback;
};

export const BudgetCategories = memo<BudgetCategoriesProps>(
  ({
    categoryGroups,
    editingCell,
    onBudgetAction,
    onShowActivity,
    onEditName,
    onEditMonth,
    onSaveCategory,
    onSaveGroup,
    onDeleteCategory,
    onDeleteGroup,
    onApplyBudgetTemplatesInGroup,
    onSortCategories,
    onReorderCategory,
    onReorderGroup,
  }) => {
    const [collapsedGroupIds = [], setCollapsedGroupIdsPref] =
      useLocalPref('budget.collapsed');
    const [showHiddenCategories] = useLocalPref('budget.showHiddenCategories');
    function onCollapse(value: Array<CategoryGroupEntity['id']>) {
      setCollapsedGroupIdsPref(value);
    }

    const [isAddingGroup, setIsAddingGroup] = useState(false);
    const [addingSubgroupForId, setAddingSubgroupForId] = useState<
      CategoryGroupEntity['id'] | null
    >(null);
    const [newCategoryForGroup, setNewCategoryForGroup] = useState<
      string | null
    >(null);
    const items: BudgetItem[] = useMemo(() => {
      const [expenseGroups, incomeGroup] = separateGroups(categoryGroups);

      function flattenExpenseGroup(
        group: CategoryGroupNode,
        depth: number,
      ): BudgetItem[] {
        if (group.hidden && !showHiddenCategories) {
          return [];
        }

        const groupCategories = group.categories?.filter(
          cat => showHiddenCategories || !cat.hidden,
        );

        const groupItems: BudgetItem[] = [
          { type: 'expense-group', value: { ...group }, depth },
        ];

        if (newCategoryForGroup === group.id) {
          groupItems.push({ type: 'new-category' });
        }

        if (collapsedGroupIds.includes(group.id)) {
          return groupItems;
        }

        return [
          ...groupItems,
          ...(groupCategories || []).map(
            (cat): BudgetItem => ({
              type: 'expense-category',
              value: cat,
              group,
              depth,
            }),
          ),
          ...(group.subgroups || []).flatMap(child =>
            flattenExpenseGroup(child, depth + 1),
          ),
          ...(addingSubgroupForId === group.id
            ? [
                {
                  type: 'new-group' as const,
                  depth: depth + 1,
                  parentId: group.id,
                },
              ]
            : []),
        ];
      }

      function flattenIncomeGroup(
        group: CategoryGroupNode,
        depth: number,
      ): BudgetItem[] {
        const groupItems: BudgetItem[] = [
          { type: 'income-group', value: group, depth },
        ];

        if (newCategoryForGroup === group.id) {
          groupItems.push({ type: 'new-category' });
        }

        if (collapsedGroupIds.includes(group.id)) {
          return groupItems;
        }

        return [
          ...groupItems,
          ...(
            group.categories?.filter(
              cat => showHiddenCategories || !cat.hidden,
            ) || []
          ).map(
            (cat): BudgetItem => ({
              type: 'income-category',
              value: cat,
              depth,
            }),
          ),
          ...(group.subgroups || []).flatMap(child =>
            flattenIncomeGroup(child, depth + 1),
          ),
          ...(addingSubgroupForId === group.id
            ? [
                {
                  type: 'new-group' as const,
                  depth: depth + 1,
                  parentId: group.id,
                },
              ]
            : []),
        ];
      }

      let items: BudgetItem[] = expenseGroups.flatMap(group =>
        flattenExpenseGroup(group, 0),
      );

      if (isAddingGroup) {
        items.push({ type: 'new-group', depth: 0 });
      }

      if (incomeGroup) {
        items = items.concat([
          { type: 'income-separator' },
          ...flattenIncomeGroup(incomeGroup, 0),
        ]);
      }

      return items;
    }, [
      categoryGroups,
      collapsedGroupIds,
      newCategoryForGroup,
      isAddingGroup,
      addingSubgroupForId,
      showHiddenCategories,
    ]);

    const [dragState, setDragState] = useState<LocalDragState>(null);
    const [savedCollapsed, setSavedCollapsed] = useState<Array<
      CategoryGroupEntity['id']
    > | null>(null);

    // TODO: If we turn this into a reducer, we could probably memoize
    // each item in the list for better perf
    function onDragChange(
      newDragState: DragState<CategoryEntity> | DragState<CategoryGroupEntity>,
    ) {
      const { state } = newDragState;

      if (state === 'start-preview') {
        // @ts-expect-error fix me
        setDragState({
          type: newDragState.type,
          item: newDragState.item,
          preview: true,
        });
      } else if (state === 'start') {
        if (dragState) {
          setDragState({
            ...dragState,
            preview: false,
          });
          setSavedCollapsed(collapsedGroupIds);
        }
      } else if (state === 'end') {
        setDragState(null);
        onCollapse(savedCollapsed || []);
      }
    }

    function onToggleCollapse(id: CategoryGroupEntity['id']) {
      if (collapsedGroupIds.includes(id)) {
        onCollapse(collapsedGroupIds.filter(id_ => id_ !== id));
      } else {
        onCollapse([...collapsedGroupIds, id]);
      }
    }

    function onShowNewGroup() {
      setIsAddingGroup(true);
    }

    function onHideNewGroup() {
      setIsAddingGroup(false);
    }

    function onShowNewSubgroup(parentId: CategoryGroupEntity['id']) {
      onCollapse(collapsedGroupIds.filter(c => c !== parentId));
      setAddingSubgroupForId(parentId);
    }

    function onHideNewSubgroup() {
      setAddingSubgroupForId(null);
    }

    function _onSaveGroup(group: CategoryGroupEntity) {
      onSaveGroup?.(group);
      if (group.id === 'new') {
        onHideNewGroup();
        onHideNewSubgroup();
      }
    }

    function onShowNewCategory(groupId: CategoryGroupEntity['id']) {
      onCollapse(collapsedGroupIds.filter(c => c !== groupId));
      setNewCategoryForGroup(groupId);
    }

    function onHideNewCategory() {
      setNewCategoryForGroup(null);
    }

    function _onSaveCategory(category: CategoryEntity) {
      onSaveCategory?.(category);
      if (category.id === 'new') {
        onHideNewCategory();
      }
    }

    return (
      <View
        style={{
          marginBottom: 10,
          backgroundColor: theme.budgetCurrentMonth, // match budget colors, not generic table colors.
          overflow: 'hidden',
          boxShadow: styles.cardShadow,
          borderRadius: '0 0 4px 4px',
          flex: 1,
        }}
      >
        {items.map((item, idx) => {
          let content;
          switch (item.type) {
            case 'new-group':
              content = (
                <Row
                  style={{ backgroundColor: theme.budgetHeaderCurrentMonth }}
                >
                  <SidebarGroup
                    group={{
                      id: 'new',
                      name: '',
                      parent_group_id: item.parentId,
                    }}
                    depth={item.depth}
                    collapsed={false}
                    editing
                    onSave={_onSaveGroup}
                    onHideNewGroup={
                      item.parentId ? onHideNewSubgroup : onHideNewGroup
                    }
                    onEdit={onEditName}
                  />
                </Row>
              );
              break;
            case 'new-category':
              content = (
                <Row>
                  <SidebarCategory
                    innerRef={null}
                    category={{
                      name: '',
                      group: newCategoryForGroup!,
                      is_income:
                        newCategoryForGroup ===
                        categoryGroups.find(g => g.is_income)?.id,
                      id: 'new',
                    }}
                    editing
                    onSave={_onSaveCategory}
                    onHideNewCategory={onHideNewCategory}
                    onEditName={onEditName!}
                  />
                </Row>
              );
              break;

            case 'expense-group':
              content = (
                <ExpenseGroup
                  group={item.value}
                  depth={item.depth}
                  editingCell={editingCell}
                  collapsed={collapsedGroupIds.includes(item.value.id)}
                  dragState={dragState}
                  onEditName={onEditName}
                  onSave={_onSaveGroup}
                  onDelete={onDeleteGroup}
                  onDragChange={onDragChange}
                  onReorderGroup={onReorderGroup}
                  onReorderCategory={onReorderCategory}
                  onToggleCollapse={onToggleCollapse}
                  onShowNewCategory={onShowNewCategory}
                  onShowNewSubgroup={onShowNewSubgroup}
                  onApplyBudgetTemplatesInGroup={onApplyBudgetTemplatesInGroup}
                  onSortCategories={onSortCategories}
                />
              );
              break;
            case 'expense-category':
              content = (
                <ExpenseCategory
                  cat={item.value}
                  categoryGroup={item.group}
                  depth={item.depth}
                  editingCell={editingCell}
                  dragState={dragState}
                  onEditName={onEditName}
                  onEditMonth={onEditMonth}
                  onSave={_onSaveCategory}
                  onDelete={onDeleteCategory}
                  onDragChange={onDragChange}
                  onReorder={onReorderCategory}
                  onBudgetAction={onBudgetAction}
                  onShowActivity={onShowActivity}
                />
              );
              break;
            case 'income-separator':
              content = (
                <View
                  style={{
                    height: styles.incomeHeaderHeight,
                    backgroundColor: theme.budgetCurrentMonth,
                  }}
                >
                  <IncomeHeader onShowNewGroup={onShowNewGroup} />
                </View>
              );
              break;
            case 'income-group':
              content = (
                <IncomeGroup
                  group={item.value}
                  depth={item.depth}
                  editingCell={editingCell}
                  collapsed={collapsedGroupIds.includes(item.value.id)}
                  onEditName={onEditName!}
                  onSave={_onSaveGroup}
                  onSortCategories={onSortCategories}
                  onToggleCollapse={onToggleCollapse}
                  onShowNewCategory={onShowNewCategory!}
                  onShowNewSubgroup={onShowNewSubgroup}
                  onDelete={
                    item.value.parent_group_id ? onDeleteGroup : undefined
                  }
                />
              );
              break;
            case 'income-category':
              content = (
                <IncomeCategory
                  cat={item.value}
                  depth={item.depth}
                  editingCell={editingCell}
                  isLast={idx === items.length - 1}
                  onEditName={onEditName}
                  onEditMonth={onEditMonth}
                  onSave={_onSaveCategory}
                  onDelete={onDeleteCategory}
                  onDragChange={onDragChange}
                  onReorder={onReorderCategory}
                  onBudgetAction={onBudgetAction}
                  onShowActivity={onShowActivity}
                />
              );
              break;
            default:
              // @ts-expect-error Error is expected here because "item.type" is "never"
              throw new Error('Unknown item type: ' + item.type);
          }

          const pos =
            idx === 0 ? 'first' : idx === items.length - 1 ? 'last' : null;

          return (
            <DropHighlightPosContext.Provider
              key={
                'value' in item
                  ? item.value.id
                  : item.type === 'income-separator'
                    ? 'separator'
                    : idx
              }
              value={pos}
            >
              <View
                style={
                  dragState
                    ? {}
                    : {
                        ':hover': { backgroundColor: theme.budgetCurrentMonth },
                      }
                }
              >
                {content}
              </View>
            </DropHighlightPosContext.Provider>
          );
        })}
      </View>
    );
  },
);

BudgetCategories.displayName = 'BudgetCategories';
