import React, { Fragment, useMemo } from 'react';
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ComponentType,
  CSSProperties,
  ReactElement,
  ReactNode,
  SVGProps,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgSplit } from '@actual-app/components/icons/v0';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { TextOneLine } from '@actual-app/components/text-one-line';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { groupCategoryGroupsIntoTree } from '@actual-app/core/shared/categories';
import type { CategoryGroupNode } from '@actual-app/core/shared/categories';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { css, cx } from '@emotion/css';

import { useEnvelopeSheetValue } from '#components/budget/envelope/EnvelopeBudgetComponents';
import {
  makeAmountFullStyle,
  SUBGROUP_INDENT_WIDTH,
} from '#components/budget/util';
import { FinancialText } from '#components/FinancialText';
import { useCategories } from '#hooks/useCategories';
import { useSheetValue } from '#hooks/useSheetValue';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { envelopeBudget, trackingBudget } from '#spreadsheet/bindings';

import { Autocomplete } from './Autocomplete';
import { filterCategorySuggestions } from './filterCategorySuggestions';
import { ItemHeader } from './ItemHeader';

type CategoryAutocompleteItem = Omit<CategoryEntity, 'group'> & {
  group?: CategoryGroupEntity;
  /** Nesting depth of `group` — 0 for a top-level group, 1 for a
   * subgroup directly inside it, and so on. Used to indent both the
   * group header and the category item itself. */
  groupDepth?: number;
};

type CategoryListProps = {
  items: CategoryAutocompleteItem[];
  getItemProps?: (arg: {
    item: CategoryAutocompleteItem;
  }) => Partial<ComponentProps<typeof View>>;
  highlightedIndex: number;
  embedded?: boolean;
  footer?: ReactNode;
  renderSplitTransactionButton?: (
    props: ComponentPropsWithoutRef<typeof SplitTransactionButton>,
  ) => ReactElement<typeof SplitTransactionButton>;
  renderCategoryItemGroupHeader?: (
    props: ComponentPropsWithoutRef<typeof ItemHeader>,
  ) => ReactElement<typeof ItemHeader>;
  renderCategoryItem?: (
    props: ComponentPropsWithoutRef<typeof CategoryItem>,
  ) => ReactElement<typeof CategoryItem>;
  showHiddenItems?: boolean;
  showBalances?: boolean;
};
function CategoryList({
  items,
  getItemProps,
  highlightedIndex,
  embedded,
  footer,
  renderSplitTransactionButton = defaultRenderSplitTransactionButton,
  renderCategoryItemGroupHeader = defaultRenderCategoryItemGroupHeader,
  renderCategoryItem = defaultRenderCategoryItem,
  showHiddenItems,
  showBalances,
}: CategoryListProps) {
  const { t } = useTranslation();
  const splitTransactionIndex = items.findIndex(item => item.id === 'split');
  const splitTransaction =
    splitTransactionIndex === -1
      ? null
      : {
          ...items[splitTransactionIndex],
          highlightedIndex: splitTransactionIndex,
        };
  const categoryItems = items
    .map((item, index) => ({ ...item, highlightedIndex: index }))
    .filter(item => item.id !== 'split');

  return (
    <View>
      <View
        style={{
          overflowY: 'auto',
          willChange: 'transform',
          padding: '5px 0',
          ...(!embedded && { maxHeight: 175 }),
        }}
      >
        {splitTransaction &&
          (() => {
            const splitButtonProps = getItemProps
              ? getItemProps({ item: splitTransaction })
              : {};
            const { onClick, ...restSplitButtonProps } = splitButtonProps;
            return renderSplitTransactionButton({
              key: 'split',
              ...restSplitButtonProps,
              onClick,
              highlighted:
                splitTransaction.highlightedIndex === highlightedIndex,
              embedded,
            });
          })()}
        {categoryItems.map((item, index) => {
          const group = item.group;

          if (!group) {
            return null;
          }

          const previousGroup = categoryItems[index - 1]?.group;
          const showGroupHeader = previousGroup?.id !== group.id;

          return (
            <Fragment key={item.id}>
              {showGroupHeader &&
                renderCategoryItemGroupHeader({
                  title: `${group.name}${group.hidden ? ` ${t('(hidden)')}` : ''}`,
                  style: {
                    paddingLeft:
                      9 + (item.groupDepth ?? 0) * SUBGROUP_INDENT_WIDTH,
                    ...(showHiddenItems &&
                      group.hidden && { color: theme.pageTextSubdued }),
                  },
                })}
              {renderCategoryItem({
                ...(getItemProps ? getItemProps({ item }) : {}),
                item,
                highlighted: highlightedIndex === item.highlightedIndex,
                embedded,
                style: {
                  paddingLeft:
                    20 + (item.groupDepth ?? 0) * SUBGROUP_INDENT_WIDTH,
                  ...(showHiddenItems &&
                    (item.hidden || group.hidden) && {
                      color: theme.pageTextSubdued,
                    }),
                },
                showBalances,
              })}
            </Fragment>
          );
        })}
      </View>
      {footer}
    </View>
  );
}

type CategoryAutocompleteProps = ComponentProps<
  typeof Autocomplete<CategoryAutocompleteItem>
> & {
  categoryGroups?: Array<CategoryGroupEntity>;
  showBalances?: boolean;
  showSplitOption?: boolean;
  renderSplitTransactionButton?: (
    props: ComponentPropsWithoutRef<typeof SplitTransactionButton>,
  ) => ReactElement<typeof SplitTransactionButton>;
  renderCategoryItemGroupHeader?: (
    props: ComponentPropsWithoutRef<typeof ItemHeader>,
  ) => ReactElement<typeof ItemHeader>;
  renderCategoryItem?: (
    props: ComponentPropsWithoutRef<typeof CategoryItem>,
  ) => ReactElement<typeof CategoryItem>;
  showHiddenCategories?: boolean;
};

export function CategoryAutocomplete({
  categoryGroups,
  showBalances = true,
  showSplitOption,
  embedded,
  closeOnBlur,
  renderSplitTransactionButton,
  renderCategoryItemGroupHeader,
  renderCategoryItem,
  showHiddenCategories,
  ...props
}: CategoryAutocompleteProps) {
  const { data: { grouped: defaultCategoryGroups } = { grouped: [] } } =
    useCategories();
  const categorySuggestions: CategoryAutocompleteItem[] = useMemo(() => {
    const tree = groupCategoryGroupsIntoTree(
      categoryGroups || defaultCategoryGroups,
    );

    const allSuggestions: CategoryAutocompleteItem[] = showSplitOption
      ? [{ id: 'split', name: '' } as CategoryAutocompleteItem]
      : [];

    // Depth-first: a group's own categories first, then each subgroup
    // (and everything nested under it) in turn — so items end up in
    // real tree order rather than flat sort_order across every group
    // at every depth.
    function collect(node: CategoryGroupNode, depth: number) {
      for (const category of node.categories || []) {
        if (category.group === node.id) {
          allSuggestions.push({
            ...category,
            group: node,
            groupDepth: depth,
          });
        }
      }
      for (const subgroup of node.subgroups ?? []) {
        collect(subgroup, depth + 1);
      }
    }

    tree.forEach(node => collect(node, 0));

    if (!showHiddenCategories) {
      return allSuggestions.filter(
        suggestion =>
          suggestion.id === 'split' ||
          (!suggestion.hidden && !suggestion.group?.hidden),
      );
    }

    return allSuggestions;
  }, [
    categoryGroups,
    defaultCategoryGroups,
    showSplitOption,
    showHiddenCategories,
  ]);

  return (
    <Autocomplete
      strict
      highlightFirst
      embedded={embedded}
      closeOnBlur={closeOnBlur}
      getHighlightedIndex={suggestions => {
        if (suggestions.length === 0) {
          return null;
        } else if (suggestions[0].id === 'split') {
          // Highlight the first category since the split option is at index 0.
          return suggestions.length > 1 ? 1 : null;
        }
        return 0;
      }}
      filterSuggestions={filterCategorySuggestions}
      suggestions={categorySuggestions}
      renderItems={(items, getItemProps, highlightedIndex) => (
        <CategoryList
          items={items}
          embedded={embedded}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          renderSplitTransactionButton={renderSplitTransactionButton}
          renderCategoryItemGroupHeader={renderCategoryItemGroupHeader}
          renderCategoryItem={renderCategoryItem}
          showHiddenItems={showHiddenCategories}
          showBalances={showBalances}
        />
      )}
      {...props}
    />
  );
}

function defaultRenderCategoryItemGroupHeader(
  props: ComponentPropsWithoutRef<typeof ItemHeader>,
): ReactElement<typeof ItemHeader> {
  return <ItemHeader {...props} type="category" />;
}

type SplitTransactionButtonProps = ComponentPropsWithoutRef<typeof View> & {
  Icon?: ComponentType<SVGProps<SVGElement>>;
  highlighted?: boolean;
  embedded?: boolean;
  style?: CSSProperties;
};

function SplitTransactionButton({
  Icon,
  highlighted,
  embedded,
  style,
  ...props
}: SplitTransactionButtonProps) {
  return (
    <View
      // Downshift calls `setTimeout(..., 250)` in the `onMouseMove`
      // event handler they set on this element. When this code runs
      // in WebKit on touch-enabled devices, taps on this element end
      // up not triggering the `onClick` event (and therefore delaying
      // response to user input) until after the `setTimeout` callback
      // finishes executing. This is caused by content observation code
      // that implements various strategies to prevent the user from
      // accidentally clicking content that changed as a result of code
      // run in the `onMouseMove` event.
      //
      // Long story short, we don't want any delay here between the user
      // tapping and the resulting action being performed. It turns out
      // there's some "fast path" logic that can be triggered in various
      // ways to force WebKit to bail on the content observation process.
      // One of those ways is setting `role="button"` (or a number of
      // other aria roles) on the element, which is what we're doing here.
      //
      // ref:
      // * https://github.com/WebKit/WebKit/blob/447d90b0c52b2951a69df78f06bb5e6b10262f4b/LayoutTests/fast/events/touch/ios/content-observation/400ms-hover-intent.html
      // * https://github.com/WebKit/WebKit/blob/58956cf59ba01267644b5e8fe766efa7aa6f0c5c/Source/WebCore/page/ios/ContentChangeObserver.cpp
      // * https://github.com/WebKit/WebKit/blob/58956cf59ba01267644b5e8fe766efa7aa6f0c5c/Source/WebKit/WebProcess/WebPage/ios/WebPageIOS.mm#L783
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      style={{
        backgroundColor: highlighted
          ? theme.menuAutoCompleteBackgroundHover
          : 'transparent',
        borderRadius: embedded ? 4 : 0,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        fontSize: 11,
        fontWeight: 500,
        color: theme.noticeTextMenu,
        padding: '6px 8px',
        ':active': {
          backgroundColor: 'rgba(100, 100, 100, .25)',
        },
        ...style,
      }}
      data-testid="split-transaction-button"
      {...props}
    >
      <Text style={{ lineHeight: 0 }}>
        {Icon ? (
          <Icon style={{ marginRight: 5 }} />
        ) : (
          <SvgSplit width={10} height={10} style={{ marginRight: 5 }} />
        )}
      </Text>
      <Trans>Split Transaction</Trans>
    </View>
  );
}

function defaultRenderSplitTransactionButton(
  props: SplitTransactionButtonProps,
): ReactElement<typeof SplitTransactionButton> {
  return <SplitTransactionButton {...props} />;
}

type CategoryItemProps = {
  item: CategoryAutocompleteItem;
  className?: string;
  style?: CSSProperties;
  highlighted?: boolean;
  embedded?: boolean;
  showBalances?: boolean;
};

function CategoryItem({
  item,
  className,
  style,
  highlighted,
  embedded,
  showBalances,
  ...props
}: CategoryItemProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const narrowStyle = isNarrowWidth
    ? {
        ...styles.mobileMenuItem,
        borderRadius: 0,
        borderTop: `1px solid ${theme.pillBorder}`,
      }
    : {};
  const [budgetType = 'envelope'] = useSyncedPref('budgetType');

  const balanceBinding =
    budgetType === 'envelope'
      ? envelopeBudget.catBalance(item.id)
      : trackingBudget.catBalance(item.id);
  const balance = useSheetValue<
    'envelope-budget' | 'tracking-budget',
    typeof balanceBinding
  >(balanceBinding);

  const isToBudgetItem = item.id === 'to-budget';
  const toBudget = useEnvelopeSheetValue(envelopeBudget.toBudget);

  return (
    <button
      type="button"
      style={style}
      // See comment above.
      className={cx(
        className,
        css({
          backgroundColor: highlighted
            ? theme.menuAutoCompleteBackgroundHover
            : 'transparent',
          color: highlighted
            ? theme.menuAutoCompleteItemTextHover
            : theme.menuAutoCompleteItemText,
          padding: 4,
          paddingLeft: 20,
          borderRadius: embedded ? 4 : 0,
          border: 'none',
          font: 'inherit',
          ...narrowStyle,
        }),
      )}
      data-testid={`${item.name}-category-item`}
      data-highlighted={highlighted || undefined}
      {...props}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextOneLine>
          {item.name}
          {item.hidden || item.group?.hidden ? ' ' + t('(hidden)') : ''}
        </TextOneLine>
        <TextOneLine
          style={{
            display: !showBalances ? 'none' : undefined,
            marginLeft: 5,
            flexShrink: 0,
            ...makeAmountFullStyle((isToBudgetItem ? toBudget : balance) || 0, {
              positiveColor: theme.noticeTextMenu,
              negativeColor: theme.errorTextMenu,
            }),
          }}
        >
          {isToBudgetItem
            ? toBudget != null && (
                <>
                  {' '}
                  <FinancialText>
                    {integerToCurrency(toBudget || 0)}
                  </FinancialText>
                </>
              )
            : balance != null && (
                <>
                  {' '}
                  <FinancialText>
                    {integerToCurrency(balance || 0)}
                  </FinancialText>
                </>
              )}
        </TextOneLine>
      </View>
    </button>
  );
}

function defaultRenderCategoryItem(
  props: ComponentPropsWithoutRef<typeof CategoryItem>,
): ReactElement<typeof CategoryItem> {
  return <CategoryItem {...props} />;
}
