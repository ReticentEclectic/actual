import * as db from '#server/db';
import * as sheet from '#server/sheet';
import { resolveName } from '#server/spreadsheet/util';
// @ts-strict-ignore
import * as monthUtils from '#shared/months';
import { safeNumber } from '#shared/util';

import { createCategory as createCategoryFromBase } from './base';
import { flatten2, number, sumAmounts, unflatten2 } from './util';

function getBlankSheet(months) {
  const blankMonth = monthUtils.prevMonth(months[0]);
  return monthUtils.sheetForMonth(blankMonth);
}

export function createBlankCategory(cat, months) {
  if (months.length > 0) {
    const sheetName = getBlankSheet(months);
    sheet.get().createStatic(sheetName, `carryover-${cat.id}`, false);
    sheet.get().createStatic(sheetName, `leftover-${cat.id}`, 0);
    sheet.get().createStatic(sheetName, `leftover-pos-${cat.id}`, 0);
  }
}

function createBlankMonth(categories, sheetName, months) {
  sheet.get().createStatic(sheetName, 'is-blank', true);
  sheet.get().createStatic(sheetName, 'to-budget', 0);
  sheet.get().createStatic(sheetName, 'buffered', 0);

  categories.forEach(cat => createBlankCategory(cat, months));
}

export function createCategory(cat, sheetName, prevSheetName) {
  if (!cat.is_income) {
    sheet.get().createStatic(sheetName, `budget-${cat.id}`, 0);

    // This makes the app more robust by "fixing up" null budget values.
    // Those should not be allowed, but in case somehow a null value
    // ends up there, we are resilient to it. Preferrably the
    // spreadsheet would have types and be more strict about what is
    // allowed to be set.
    if (sheet.get().getCellValue(sheetName, `budget-${cat.id}`) == null) {
      sheet.get().set(resolveName(sheetName, `budget-${cat.id}`), 0);
    }

    sheet.get().createStatic(sheetName, `carryover-${cat.id}`, false);

    sheet.get().createDynamic(sheetName, `leftover-${cat.id}`, {
      initialValue: 0,
      dependencies: [
        `budget-${cat.id}`,
        `sum-amount-${cat.id}`,
        `${prevSheetName}!carryover-${cat.id}`,
        `${prevSheetName}!leftover-${cat.id}`,
        `${prevSheetName}!leftover-pos-${cat.id}`,
      ],
      run: (budgeted, spent, prevCarryover, prevLeftover, prevLeftoverPos) => {
        return safeNumber(
          number(budgeted) +
            number(spent) +
            (prevCarryover ? number(prevLeftover) : number(prevLeftoverPos)),
        );
      },
    });

    sheet.get().createDynamic(sheetName, 'leftover-pos-' + cat.id, {
      initialValue: 0,
      dependencies: [`leftover-${cat.id}`],
      run: leftover => {
        return leftover < 0 ? 0 : leftover;
      },
    });
  }
}

export function createCategoryGroup(group, sheetName, childGroups = []) {
  // A group's total is its own categories PLUS its child groups'
  // totals. Since child groups' cells are recursively built the same
  // way, this naturally rolls all the way up the tree - no manual
  // recursion needed here, the dependency graph handles it. Creation
  // order between parent and child doesn't matter either: the graph
  // lazily creates a placeholder node for any dependency name that
  // doesn't exist yet, and computes everything in topological order.
  sheet.get().createDynamic(sheetName, 'group-sum-amount-' + group.id, {
    initialValue: 0,
    dependencies: [
      ...group.categories.map(cat => `sum-amount-${cat.id}`),
      ...childGroups.map(child => `group-sum-amount-${child.id}`),
    ],
    run: sumAmounts,
  });

  if (!group.is_income) {
    sheet.get().createDynamic(sheetName, 'group-budget-' + group.id, {
      initialValue: 0,
      dependencies: [
        ...group.categories.map(cat => `budget-${cat.id}`),
        ...childGroups.map(child => `group-budget-${child.id}`),
      ],
      run: sumAmounts,
    });

    sheet.get().createDynamic(sheetName, 'group-leftover-' + group.id, {
      initialValue: 0,
      dependencies: [
        ...group.categories.map(cat => `leftover-${cat.id}`),
        ...childGroups.map(child => `group-leftover-${child.id}`),
      ],
      run: sumAmounts,
    });
  }
}

export function createSummary(groups, categories, prevSheetName, sheetName) {
  // Only top-level groups feed into the month's totals - a nested
  // group's own contribution is already folded into its parent's
  // group-sum-amount/group-budget/group-leftover cells recursively,
  // so including it again here would double-count it.
  const incomeGroup = groups.filter(
    group => group.is_income && !group.parent_group_id,
  )[0];
  const expenseCategories = categories.filter(cat => !cat.is_income);
  const incomeCategories = categories.filter(cat => cat.is_income);

  sheet.get().createStatic(sheetName, 'buffered', 0);

  sheet.get().createDynamic(sheetName, 'from-last-month', {
    initialValue: 0,
    dependencies: [
      `${prevSheetName}!to-budget`,
      `${prevSheetName}!buffered-selected`,
    ],
    run: (toBudget, buffered) =>
      safeNumber(number(toBudget) + number(buffered)),
  });

  // Alias the group income total to `total-income`
  sheet.get().createDynamic(sheetName, 'total-income', {
    initialValue: 0,
    dependencies: [`group-sum-amount-${incomeGroup.id}`],
    run: amount => amount,
  });

  sheet.get().createDynamic(sheetName, 'available-funds', {
    initialValue: 0,
    dependencies: ['total-income', 'from-last-month'],
    run: (income, fromLastMonth) =>
      safeNumber(number(income) + number(fromLastMonth)),
  });

  sheet.get().createDynamic(sheetName, 'last-month-overspent', {
    initialValue: 0,
    dependencies: flatten2(
      expenseCategories.map(cat => [
        `${prevSheetName}!leftover-${cat.id}`,
        `${prevSheetName}!carryover-${cat.id}`,
      ]),
    ),
    run: (...data) => {
      data = unflatten2(data);
      return safeNumber(
        data.reduce((total, [leftover, carryover]) => {
          if (carryover) {
            return total;
          }
          return total + Math.min(0, number(leftover));
        }, 0),
      );
    },
  });

  sheet.get().createDynamic(sheetName, 'total-budgeted', {
    initialValue: 0,
    dependencies: groups
      .filter(group => !group.is_income && !group.parent_group_id)
      .map(group => `group-budget-${group.id}`),
    run: (...amounts) => {
      // Negate budgeted amount
      return -sumAmounts(...amounts);
    },
  });

  sheet.get().createDynamic(sheetName, 'buffered', { initialValue: 0 });
  sheet.get().createDynamic(sheetName, 'buffered-auto', {
    initialValue: 0,
    dependencies: flatten2(
      incomeCategories.map(c => [
        `${sheetName}!sum-amount-${c.id}`,
        `${sheetName}!carryover-${c.id}`,
      ]),
    ),
    run: (...data) => {
      data = unflatten2(data);
      return safeNumber(
        data.reduce((total, [sumAmount, carryover]) => {
          if (carryover) {
            return total + sumAmount;
          }
          return total;
        }, 0),
      );
    },
  });
  sheet.get().createDynamic(sheetName, 'buffered-selected', {
    initialValue: 0,
    dependencies: [`${sheetName}!buffered`, `${sheetName}!buffered-auto`],
    run: (man, auto) => {
      if (man !== 0) {
        return man;
      }
      return auto;
    },
  });

  sheet.get().createDynamic(sheetName, 'to-budget', {
    initialValue: 0,
    dependencies: [
      'available-funds',
      'last-month-overspent',
      'total-budgeted',
      'buffered-selected',
    ],
    run: (available, lastOverspent, totalBudgeted, buffered) => {
      return safeNumber(
        number(available) +
          number(lastOverspent) +
          number(totalBudgeted) -
          number(buffered),
      );
    },
  });

  sheet.get().createDynamic(sheetName, 'total-spent', {
    initialValue: 0,
    dependencies: groups
      .filter(group => !group.is_income && !group.parent_group_id)
      .map(group => `group-sum-amount-${group.id}`),
    run: sumAmounts,
  });

  sheet.get().createDynamic(sheetName, 'total-leftover', {
    initialValue: 0,
    dependencies: groups
      .filter(group => !group.is_income && !group.parent_group_id)
      .map(group => `group-leftover-${group.id}`),
    run: sumAmounts,
  });
}

export function createBudget(meta, categories, months) {
  // The spreadsheet is now strict - so we need to fill in some
  // default values for the month before the first month. Only do this
  // if it doesn't already exist
  const blankSheet = getBlankSheet(months);
  if (meta.blankSheet !== blankSheet) {
    sheet.get().clearSheet(meta.blankSheet);
    createBlankMonth(categories, blankSheet, months);
    meta.blankSheet = blankSheet;
  }
}

export function handleCategoryChange(months, oldValue, newValue) {
  // Build list of cells and dependencies that need updated
  function getDeps(sheetName, prevSheetName, groupId, cat) {
    const deps: Array<[string, string[]]> = [
      [`group-sum-amount-${groupId}`, [`sum-amount-${cat.id}`]],
      [`group-budget-${groupId}`, [`budget-${cat.id}`]],
      [`group-leftover-${groupId}`, [`leftover-${cat.id}`]],
    ];

    if (cat.is_income) {
      deps.push([
        'buffered-auto',
        [
          `${sheetName}!sum-amount-${cat.id}`,
          `${sheetName}!carryover-${cat.id}`,
        ],
      ]);
    } else {
      deps.push([
        'last-month-overspent',
        [
          `${prevSheetName}!leftover-${cat.id}`,
          `${prevSheetName}!carryover-${cat.id}`,
        ],
      ]);
    }

    return deps;
  }

  function addDeps(sheetName, prevSheetName, groupId, cat) {
    getDeps(sheetName, prevSheetName, groupId, cat).forEach(
      ([cellName, deps]) => {
        sheet.get().addDependencies(sheetName, cellName, deps);
      },
    );
  }

  function removeDeps(sheetName, prevSheetName, groupId, cat) {
    getDeps(sheetName, prevSheetName, groupId, cat).forEach(
      ([cellName, deps]) => {
        sheet.get().removeDependencies(sheetName, cellName, deps);
      },
    );
  }

  if (oldValue && oldValue.tombstone === 0 && newValue.tombstone === 1) {
    months.forEach(month => {
      const prevSheetName = monthUtils.sheetForMonth(
        monthUtils.prevMonth(month),
      );
      const sheetName = monthUtils.sheetForMonth(month);

      removeDeps(sheetName, prevSheetName, newValue.cat_group, newValue);
    });
  } else if (
    newValue.tombstone === 0 &&
    (!oldValue || oldValue.tombstone === 1)
  ) {
    createBlankCategory(newValue, months);

    months.forEach(month => {
      const prevMonth = monthUtils.prevMonth(month);
      const prevSheetName = monthUtils.sheetForMonth(prevMonth);
      const sheetName = monthUtils.sheetForMonth(month);
      const { start, end } = monthUtils.bounds(month);

      createCategoryFromBase(newValue, sheetName, prevSheetName, start, end);

      addDeps(sheetName, prevSheetName, newValue.cat_group, newValue);
    });
  } else if (oldValue && oldValue.cat_group !== newValue.cat_group) {
    // The category moved so we need to update the dependencies
    months.forEach(month => {
      const prevSheetName = monthUtils.sheetForMonth(
        monthUtils.prevMonth(month),
      );
      const sheetName = monthUtils.sheetForMonth(month);

      removeDeps(sheetName, prevSheetName, oldValue.cat_group, newValue);
      addDeps(sheetName, prevSheetName, newValue.cat_group, newValue);
    });
  }
}

export function handleCategoryGroupChange(months, oldValue, newValue) {
  // A group's own group-* cells feed either into its parent group's
  // cells (if it's nested) or into the month's total-* cells (if
  // it's top-level). This mirrors handleCategoryChange's addDeps just
  // one level higher up the tree.
  function addDeps(sheetName, groupId, parentId) {
    const [budgetedTarget, spentTarget, leftoverTarget] = parentId
      ? [
          `group-budget-${parentId}`,
          `group-sum-amount-${parentId}`,
          `group-leftover-${parentId}`,
        ]
      : ['total-budgeted', 'total-spent', 'total-leftover'];

    sheet
      .get()
      .addDependencies(sheetName, budgetedTarget, [`group-budget-${groupId}`]);
    sheet
      .get()
      .addDependencies(sheetName, spentTarget, [
        `group-sum-amount-${groupId}`,
      ]);
    sheet
      .get()
      .addDependencies(sheetName, leftoverTarget, [
        `group-leftover-${groupId}`,
      ]);
  }

  function removeDeps(sheetName, groupId, parentId) {
    const [budgetedTarget, spentTarget, leftoverTarget] = parentId
      ? [
          `group-budget-${parentId}`,
          `group-sum-amount-${parentId}`,
          `group-leftover-${parentId}`,
        ]
      : ['total-budgeted', 'total-spent', 'total-leftover'];

    sheet
      .get()
      .removeDependencies(sheetName, budgetedTarget, [
        `group-budget-${groupId}`,
      ]);
    sheet
      .get()
      .removeDependencies(sheetName, spentTarget, [
        `group-sum-amount-${groupId}`,
      ]);
    sheet
      .get()
      .removeDependencies(sheetName, leftoverTarget, [
        `group-leftover-${groupId}`,
      ]);
  }

  if (newValue.tombstone === 1 && oldValue && oldValue.tombstone === 0) {
    const id = newValue.id;
    months.forEach(month => {
      const sheetName = monthUtils.sheetForMonth(month);
      removeDeps(sheetName, id, oldValue.parent_group_id);
    });
  } else if (
    newValue.tombstone === 0 &&
    (!oldValue || oldValue.tombstone === 1)
  ) {
    const group = newValue;

    if (!group.is_income) {
      months.forEach(month => {
        const sheetName = monthUtils.sheetForMonth(month);

        // Dirty, dirty hack. These functions should not be async, but this is
        // OK because we're leveraging the sync nature of queries. Ideally we
        // wouldn't be querying here. But I think we have to. At least for now
        // we do
        const categories = db.runQuery(
          'SELECT * FROM categories WHERE tombstone = 0 AND cat_group = ?',
          [group.id],
          true,
        );
        // A brand-new group can't already have children - nothing
        // could have referenced it as a parent before it existed.
        createCategoryGroup({ ...group, categories }, sheetName);

        addDeps(sheetName, group.id, group.parent_group_id);
      });
    }
  } else if (
    oldValue &&
    oldValue.parent_group_id !== newValue.parent_group_id
  ) {
    // The group moved to a different parent (or in/out of the top
    // level) - rewire its contribution from the old parent (or
    // totals) to the new one.
    // NOTE: nothing can trigger this yet - there's no UI/API that sets
    // parent_group_id after creation - so this branch is currently
    // unexercised. It's here so the live-update path stays correct
    // once group moving is built (layer 3).
    const id = newValue.id;

    months.forEach(month => {
      const sheetName = monthUtils.sheetForMonth(month);
      removeDeps(sheetName, id, oldValue.parent_group_id);
      addDeps(sheetName, id, newValue.parent_group_id);
    });
  }
}
