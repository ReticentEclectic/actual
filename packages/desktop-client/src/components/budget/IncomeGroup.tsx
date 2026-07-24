// @ts-strict-ignore
import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CategoryGroupEntity } from '@actual-app/core/types/models';

import { DropHighlight, useDraggable, useDroppable } from '#components/sort';
import type {
  DragState,
  OnDragChangeCallback,
  OnDropCallback,
} from '#components/sort';
import { Row, ROW_HEIGHT } from '#components/table';
import { useDragRef } from '#hooks/useDragRef';

import { RenderMonths } from './RenderMonths';
import { SidebarGroup } from './SidebarGroup';

import { useBudgetComponents } from '.';

type IncomeGroupProps = {
  group: CategoryGroupEntity;
  depth: number;
  visibleDescendantRows: number;
  editingCell: { id: CategoryGroupEntity['id']; cell: string } | null;
  collapsed: boolean;
  dragState: DragState<CategoryGroupEntity> | null;
  onDragChange: OnDragChangeCallback<CategoryGroupEntity>;
  onReorderGroup: OnDropCallback;
  onReorderCategory: OnDropCallback;
  onEditName: (id: CategoryGroupEntity['id']) => void;
  onSave: (group: CategoryGroupEntity) => void;
  onSortCategories?: (
    groupId: CategoryGroupEntity['id'],
    direction: 'asc' | 'desc',
  ) => void;
  onToggleCollapse: (id: CategoryGroupEntity['id']) => void;
  onShowNewCategory: (groupId: CategoryGroupEntity['id']) => void;
  onShowNewSubgroup?: (groupId: CategoryGroupEntity['id']) => void;
  onIndent?: () => void;
  onOutdent?: () => void;
  onDelete?: (id: CategoryGroupEntity['id']) => void;
};

export function IncomeGroup({
  group,
  depth,
  visibleDescendantRows,
  editingCell,
  collapsed,
  dragState,
  onDragChange,
  onReorderGroup,
  onReorderCategory,
  onEditName,
  onSave,
  onSortCategories,
  onToggleCollapse,
  onShowNewCategory,
  onShowNewSubgroup,
  onIndent,
  onOutdent,
  onDelete,
}: IncomeGroupProps) {
  const dragging = dragState && dragState.item === group;

  // The root income group itself can't be dragged - there's nowhere for
  // it to go, it's the one permanent top-level income group. Nested
  // income subgroups can be dragged like any other group.
  const { dragRef } = useDraggable({
    type: 'group',
    onDragChange,
    item: group,
    canDrag: editingCell === null && !!group.parent_group_id,
  });
  const handleDragRef = useDragRef(dragRef);

  const { dropRef, dropPos } = useDroppable({
    types: 'group',
    id: group.id,
    onDrop: onReorderGroup,
    allowNestDrop: true,
  });

  const { dropRef: catDropRef, dropPos: catDropPos } = useDroppable({
    types: 'category',
    id: group.id,
    onDrop: onReorderCategory,
    onLongHover: () => {
      if (collapsed) {
        onToggleCollapse(group.id);
      }
    },
  });

  const { IncomeGroupComponent: MonthComponent } = useBudgetComponents();
  return (
    <Row
      collapsed
      style={{
        fontWeight: 600,
        backgroundColor: theme.budgetHeaderCurrentMonth, //use budget color
      }}
    >
      {dragState && !dragState.preview && dragState.type === 'group' && (
        <View
          innerRef={dropRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: collapsed
              ? ROW_HEIGHT - 1
              : (1 + visibleDescendantRows) * (ROW_HEIGHT - 1) + 1,
            zIndex: 10000,
          }}
        >
          <DropHighlight pos={dropPos} offset={{ top: 1 }} />
        </View>
      )}

      <DropHighlight pos={catDropPos} offset={{ top: 1 }} />

      <View
        innerRef={catDropRef}
        style={{
          flex: 1,
          flexDirection: 'row',
          opacity: dragging && !dragState.preview ? 0.3 : 1,
        }}
      >
        <SidebarGroup
          innerRef={handleDragRef}
          group={group}
          depth={depth}
          collapsed={collapsed}
          dragPreview={dragging && dragState.preview}
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
          onIndent={onIndent}
          onOutdent={onOutdent}
          onDelete={onDelete}
        />
        <RenderMonths>
          {({ month }) => <MonthComponent month={month} group={group} />}
        </RenderMonths>
      </View>
    </Row>
  );
}
