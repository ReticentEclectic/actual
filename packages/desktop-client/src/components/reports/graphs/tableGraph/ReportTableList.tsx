import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { DataEntity, GroupedEntity } from '@actual-app/core/types/models';

import { Row } from '#components/table';

import type { renderRowProps } from './ReportTable';

type ReportTableListProps = {
  data: DataEntity;
  mode: string;
  groupBy: string;
  renderRow: (arg: renderRowProps) => ReactNode;
  style?: CSSProperties;
};

const groupHeaderStyle: CSSProperties = {
  color: theme.tableRowHeaderText,
  backgroundColor: theme.tableRowHeaderBackground,
  fontWeight: 600,
};

export function ReportTableList({
  data,
  mode,
  groupBy,
  renderRow,
  style,
}: ReportTableListProps) {
  const metadata: GroupedEntity[] | undefined =
    groupBy === 'Category'
      ? data.groupedData || []
      : groupBy === 'Interval'
        ? data.intervalData.map(interval => {
            return {
              id: '',
              name: '',
              date: interval.date,
              totalAssets: interval.totalAssets,
              totalDebts: interval.totalDebts,
              netAssets: interval.netAssets,
              netDebts: interval.netDebts,
              totalTotals: interval.totalTotals,
              totalBudgeted: interval.totalBudgeted,
              intervalData: [],
              categories: [],
            };
          })
        : data.data;

  // A row with either its own leaf categories or nested subgroups
  // renders as a bold group header — a subgroup is still a group, so
  // it gets the same treatment as a top-level one, just indented.
  // Checking .length rather than plain truthiness matters here: an
  // empty array is still truthy in JS, and Interval-mode rows
  // construct `categories: []` (empty, not undefined) — a plain
  // truthy check would incorrectly treat every interval row as a
  // group.
  function isGroupRow(item: GroupedEntity): boolean {
    return (
      (item.categories?.length ?? 0) > 0 || (item.subgroups?.length ?? 0) > 0
    );
  }

  // Renders one row plus everything nested under it (own categories,
  // then nested subgroups, each recursed into the same way), at
  // increasing depth/indentation. Recursion depth is bounded by actual
  // category-group nesting depth, which is always shallow.
  function renderGroupRow(
    item: GroupedEntity,
    depth: number,
    key: string,
  ): ReactNode {
    return (
      <View key={key}>
        <View>
          {renderRow({
            item,
            mode,
            depth,
            style: {
              ...(isGroupRow(item) && groupHeaderStyle),
              ...style,
            },
          })}
        </View>
        {item.categories && (
          <View>
            {item.categories.map((category, i) => (
              <View key={category.id || `${key}-cat-${i}`}>
                {renderRow({
                  item: category,
                  mode,
                  depth: depth + 1,
                  style,
                })}
              </View>
            ))}
          </View>
        )}
        {item.subgroups &&
          item.subgroups.map((subgroup, i) =>
            renderGroupRow(
              subgroup,
              depth + 1,
              subgroup.id || `${key}-sub-${i}`,
            ),
          )}
        {depth === 0 && isGroupRow(item) && <Row height={20} />}
      </View>
    );
  }

  return (
    <View>
      {metadata ? (
        <View>
          {metadata.map((item, index) =>
            renderGroupRow(item, 0, item.id || `${index}`),
          )}
        </View>
      ) : (
        <View width="flex" />
      )}
    </View>
  );
}
