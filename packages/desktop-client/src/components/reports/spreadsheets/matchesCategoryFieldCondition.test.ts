import { describe, expect, test } from 'vitest';

import type { RuleConditionEntity } from '@actual-app/core/types/models';

import { matchesCategoryFieldCondition } from './matchesCategoryFieldCondition';

function makeCondition(overrides: {
  field?: string;
  op?: string;
  value?: unknown;
}): RuleConditionEntity {
  return {
    field: 'category_group',
    op: 'is',
    value: '',
    ...overrides,
  } as RuleConditionEntity;
}

describe('matchesCategoryFieldCondition', () => {
  test('is: matches an exact id', () => {
    const cond = makeCondition({ op: 'is', value: 'bills' });
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(true);
    expect(matchesCategoryFieldCondition('fun', 'Fun', cond)).toBe(false);
  });

  test('isNot: negates an exact id match', () => {
    const cond = makeCondition({ op: 'isNot', value: 'bills' });
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(false);
    expect(matchesCategoryFieldCondition('fun', 'Fun', cond)).toBe(true);
  });

  test('oneOf: matches any id in the array', () => {
    const cond = makeCondition({ op: 'oneOf', value: ['bills', 'fun'] });
    expect(matchesCategoryFieldCondition('fun', 'Fun', cond)).toBe(true);
    expect(matchesCategoryFieldCondition('groceries', 'Groceries', cond)).toBe(
      false,
    );
  });

  test('notOneOf: negates array membership', () => {
    const cond = makeCondition({ op: 'notOneOf', value: ['bills', 'fun'] });
    expect(matchesCategoryFieldCondition('fun', 'Fun', cond)).toBe(false);
    expect(matchesCategoryFieldCondition('groceries', 'Groceries', cond)).toBe(
      true,
    );
  });

  test('notOneOf with a malformed (non-array) value is treated as no match, not a match-everything fallback', () => {
    // Deliberate reconciliation of a real disagreement between the two
    // original implementations this was extracted from — see the
    // function's own doc comment.
    const cond = makeCondition({
      op: 'notOneOf',
      value: 'bills' as unknown as string[],
    });
    expect(matchesCategoryFieldCondition('fun', 'Fun', cond)).toBe(false);
  });

  test('idValues overrides cond.value for id-based operators, simulating descendant expansion', () => {
    const cond = makeCondition({ op: 'is', value: 'bills' });
    // The id under test here is Electric's own group id ("utilities"),
    // not Electric's own category id — category_group matching always
    // compares a category's group against the (possibly expanded) set
    // of target group ids, never the category's own id.
    expect(
      matchesCategoryFieldCondition('utilities', 'Utilities', cond, [
        'bills',
        'utilities',
      ]),
    ).toBe(true);
  });

  test('idValues does not affect text-based operators', () => {
    const cond = makeCondition({ op: 'contains', value: 'Bill' });
    expect(
      matchesCategoryFieldCondition('utilities', 'Utilities', cond, [
        'bills',
        'utilities',
      ]),
    ).toBe(false);
  });

  test('contains/doesNotContain are case-insensitive substring matches on name', () => {
    const contains = makeCondition({ op: 'contains', value: 'bill' });
    expect(matchesCategoryFieldCondition('bills', 'Bills', contains)).toBe(
      true,
    );

    const doesNotContain = makeCondition({
      op: 'doesNotContain',
      value: 'bill',
    });
    expect(
      matchesCategoryFieldCondition('bills', 'Bills', doesNotContain),
    ).toBe(false);
    expect(matchesCategoryFieldCondition('fun', 'Fun', doesNotContain)).toBe(
      true,
    );
  });

  test('matches: supports a bare regex pattern', () => {
    const cond = makeCondition({ op: 'matches', value: '^Bills$' });
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(true);
    expect(matchesCategoryFieldCondition('fun', 'Fun', cond)).toBe(false);
  });

  test('matches: also supports a delimiter-wrapped pattern', () => {
    const cond = makeCondition({ op: 'matches', value: '/^Bills$/' });
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(true);
  });

  test('matches: an invalid regex fails gracefully rather than throwing', () => {
    const cond = makeCondition({ op: 'matches', value: '[' });
    expect(() =>
      matchesCategoryFieldCondition('bills', 'Bills', cond),
    ).not.toThrow();
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(false);
  });

  test('matches: a pattern over 256 characters is rejected', () => {
    const cond = makeCondition({ op: 'matches', value: 'a'.repeat(257) });
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(false);
  });

  test('an unrecognized operator returns false rather than throwing', () => {
    const cond = makeCondition({ op: 'unknownOp' as 'is' });
    expect(() =>
      matchesCategoryFieldCondition('bills', 'Bills', cond),
    ).not.toThrow();
    expect(matchesCategoryFieldCondition('bills', 'Bills', cond)).toBe(false);
  });
});
