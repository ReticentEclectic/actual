// @ts-strict-ignore
import React, { Fragment, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheckAll,
  SvgUncheckAll,
  SvgViewHide,
  SvgViewShow,
} from '@actual-app/components/icons/v2';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { groupCategoryGroupsIntoTree } from '@actual-app/core/shared/categories';
import type { CategoryGroupNode } from '@actual-app/core/shared/categories';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';

import { SUBGROUP_INDENT_WIDTH } from '#components/budget/util';
import { Checkbox } from '#components/forms';

import { GraphButton } from './GraphButton';

type CategorySelectorProps = {
  categoryGroups: Array<CategoryGroupEntity>;
  selectedCategories: CategoryEntity[];
  setSelectedCategories: (selectedCategories: CategoryEntity[]) => void;
  showHiddenCategories?: boolean;
};

export function CategorySelector({
  categoryGroups,
  selectedCategories,
  setSelectedCategories,
  showHiddenCategories = true,
}: CategorySelectorProps) {
  const { t } = useTranslation();
  const [uncheckedHidden, setUncheckedHidden] = useState(false);
  const filteredGroup = (categoryGroup: CategoryGroupEntity) => {
    return categoryGroup.categories.filter(f => {
      return showHiddenCategories || !f.hidden ? true : false;
    });
  };

  // A group's own direct categories, plus every descendant subgroup's
  // own categories, at any depth. Used for checkbox state/selection so
  // toggling a parent group's checkbox covers everything nested under
  // it, not just categories directly in that group.
  const subtreeCategories = (group: CategoryGroupNode): CategoryEntity[] => [
    ...filteredGroup(group),
    ...(group.subgroups ?? []).flatMap(subtreeCategories),
  ];

  const tree = useMemo(
    () => groupCategoryGroupsIntoTree(categoryGroups ?? []),
    [categoryGroups],
  );

  const selectAll: CategoryEntity[] = [];
  categoryGroups.map(categoryGroup =>
    filteredGroup(categoryGroup).map(category => selectAll.push(category)),
  );

  if (selectedCategories === undefined) {
    selectedCategories = categoryGroups.flatMap(cg => cg.categories);
  }

  const selectedCategoryMap = useMemo(
    () => selectedCategories.map(selected => selected.id),
    [selectedCategories],
  );

  const allCategoriesSelected = selectAll.every(category =>
    selectedCategoryMap.includes(category.id),
  );

  const allCategoriesUnselected = !selectAll.some(category =>
    selectedCategoryMap.includes(category.id),
  );

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 5,
          flexShrink: 0,
        }}
      >
        <Button
          variant="bare"
          onPress={() => setUncheckedHidden(state => !state)}
          style={{ padding: 8 }}
        >
          <View>
            {uncheckedHidden ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <SvgViewShow
                  width={15}
                  height={15}
                  style={{ marginRight: 5 }}
                />
                <Text>
                  <Trans>Show unchecked</Trans>
                </Text>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <SvgViewHide
                  width={15}
                  height={15}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={{
                    maxWidth: 100,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <Trans>Hide unchecked</Trans>
                </Text>
              </View>
            )}
          </View>
        </Button>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <GraphButton
            selected={allCategoriesSelected}
            title={t('Select All')}
            onSelect={() => {
              setSelectedCategories(selectAll);
            }}
            style={{ marginRight: 5, padding: 8 }}
          >
            <SvgCheckAll width={15} height={15} />
          </GraphButton>
          <GraphButton
            selected={allCategoriesUnselected}
            title={t('Unselect All')}
            onSelect={() => {
              setSelectedCategories([]);
            }}
            style={{ padding: 8 }}
          >
            <SvgUncheckAll width={15} height={15} />
          </GraphButton>
        </View>
      </View>

      <ul
        style={{
          listStyle: 'none',
          marginLeft: 0,
          paddingLeft: 0,
          paddingRight: 10,
          flexGrow: 1,
          overflowY: 'auto',
        }}
      >
        {tree.map(group => renderGroupNode(group, 0))}
      </ul>
    </View>
  );

  function renderGroupNode(group: CategoryGroupNode, depth: number) {
    const groupSubtreeCategories = subtreeCategories(group);
    const allCategoriesInGroupSelected = groupSubtreeCategories.every(
      category =>
        selectedCategories.some(
          selectedCategory => selectedCategory.id === category.id,
        ),
    );
    const noCategorySelected = groupSubtreeCategories.every(
      category =>
        !selectedCategories.some(
          selectedCategory => selectedCategory.id === category.id,
        ),
    );
    return (
      <Fragment key={group.id}>
        <li
          style={{
            display: noCategorySelected && uncheckedHidden ? 'none' : 'flex',
            marginBottom: 8,
            flexDirection: 'row',
            paddingLeft: depth * SUBGROUP_INDENT_WIDTH,
          }}
        >
          <Checkbox
            id={`form_${group.id}`}
            checked={allCategoriesInGroupSelected}
            onChange={() => {
              const selectedCategoriesExcludingGroupCategories =
                selectedCategories.filter(
                  selectedCategory =>
                    !groupSubtreeCategories.some(
                      groupCategory => groupCategory.id === selectedCategory.id,
                    ),
                );
              if (allCategoriesInGroupSelected) {
                setSelectedCategories(
                  selectedCategoriesExcludingGroupCategories,
                );
              } else {
                setSelectedCategories(
                  selectedCategoriesExcludingGroupCategories.concat(
                    groupSubtreeCategories,
                  ),
                );
              }
            }}
          />
          <label
            htmlFor={`form_${group.id}`}
            style={{ userSelect: 'none', fontWeight: 'bold' }}
          >
            {group.name}
          </label>
        </li>
        <li>
          <ul
            style={{
              listStyle: 'none',
              marginLeft: 0,
              marginBottom: 10,
              paddingLeft: 0,
            }}
          >
            {filteredGroup(group).map(category => {
              const isChecked = selectedCategories.some(
                selectedCategory => selectedCategory.id === category.id,
              );
              return (
                <li
                  key={category.id}
                  style={{
                    display: !isChecked && uncheckedHidden ? 'none' : 'flex',
                    flexDirection: 'row',
                    marginBottom: 4,
                    paddingLeft: (depth + 1) * SUBGROUP_INDENT_WIDTH,
                  }}
                >
                  <Checkbox
                    id={`form_${category.id}`}
                    checked={isChecked}
                    onChange={() => {
                      if (isChecked) {
                        setSelectedCategories(
                          selectedCategories.filter(
                            selectedCategory =>
                              selectedCategory.id !== category.id,
                          ),
                        );
                      } else {
                        setSelectedCategories([
                          ...selectedCategories,
                          category,
                        ]);
                      }
                    }}
                  />
                  <label
                    htmlFor={`form_${category.id}`}
                    style={{ userSelect: 'none' }}
                  >
                    {category.name}
                  </label>
                </li>
              );
            })}
            {(group.subgroups ?? []).map(subgroup =>
              renderGroupNode(subgroup, depth + 1),
            )}
          </ul>
        </li>
      </Fragment>
    );
  }
}
