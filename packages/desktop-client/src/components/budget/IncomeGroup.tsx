// @ts-strict-ignore
import React from 'react';

import { theme } from '@actual-app/components/theme';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { Row } from '#components/table';

import { RenderMonths } from './RenderMonths';
import { SidebarGroup } from './SidebarGroup';

import { useBudgetComponents } from '.';

type IncomeGroupProps = {
  group: CategoryGroupEntity;
  depth: number;
  editingCell: { id: CategoryGroupEntity['id']; cell: string } | null;
  collapsed: boolean;
  onEditName: (id: CategoryGroupEntity['id']) => void;
  onSave: (group: CategoryGroupEntity) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onToggleCollapse: (id: CategoryGroupEntity['id']) => void;
  onShowNewCategory: (groupId: CategoryGroupEntity['id']) => void;
  onShowNewSubgroup?: (groupId: CategoryGroupEntity['id']) => void;
  onDelete?: (id: CategoryGroupEntity['id']) => void;
};

export function IncomeGroup({
  group,
  depth,
  editingCell,
  collapsed,
  onEditName,
  onSave,
  onSortCategories,
  onToggleCollapse,
  onShowNewCategory,
  onShowNewSubgroup,
  onDelete,
}: IncomeGroupProps) {
  const { IncomeGroupComponent: MonthComponent } = useBudgetComponents();
  return (
    <Row
      collapsed
      style={{
        fontWeight: 600,
        backgroundColor: theme.budgetHeaderCurrentMonth, //use budget color
      }}
    >
      <SidebarGroup
        group={group}
        depth={depth}
        collapsed={collapsed}
        editing={
          editingCell &&
          editingCell.cell === 'name' &&
          editingCell.id === group.id
        }
        onEdit={onEditName}
        onSave={onSave}
        onSortCategories={onSortCategories}
        onToggleCollapse={onToggleCollapse}
        onShowNewCategory={onShowNewCategory}
        onShowNewSubgroup={onShowNewSubgroup}
        onDelete={onDelete}
      />
      <RenderMonths>
        {({ month }) => <MonthComponent month={month} group={group} />}
      </RenderMonths>
    </Row>
  );
}
