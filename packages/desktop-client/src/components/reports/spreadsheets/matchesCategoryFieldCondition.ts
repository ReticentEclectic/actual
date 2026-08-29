import type { RuleConditionEntity } from '@actual-app/core/types/models';

/**
 * Evaluates whether a category (or category group)'s id/name satisfies a
 * single category/category_group condition. Shared between
 * budget-analysis-spreadsheet.ts and sankey-spreadsheet.ts, which both
 * independently filter report data by these two condition fields.
 *
 * For id-based operators (is/isNot/oneOf/notOneOf), pass `idValues` to
 * override cond.value with an already-resolved set of matching ids —
 * used by callers that need to expand a category_group condition to
 * include descendant subgroups (see getDescendantGroupIds in
 * @actual-app/core/shared/categories). When omitted, cond.value is used
 * directly (unexpanded), which is correct for the `category` field,
 * since individual categories don't have descendants to expand.
 *
 * Text-based operators (contains/doesNotContain/matches) always match
 * against `name` directly, using cond.value as-is; they have no id to
 * expand.
 *
 * Two deliberate behavior decisions made while unifying two previously
 * separate implementations of this logic:
 * - `matches` supports both a bare pattern ("Bills") and a
 *   delimiter-wrapped one ("/Bills/") — a strict superset of what either
 *   original implementation did alone, not a behavior change for either
 *   caller.
 * - A malformed condition (an array-only operator given a non-array
 *   value) is treated as "no match" rather than "match everything",
 *   the more conservative of the two behaviors the original
 *   implementations disagreed on.
 */
export function matchesCategoryFieldCondition(
  id: string,
  name: string,
  cond: RuleConditionEntity,
  idValues?: string[],
): boolean {
  if (typeof cond.op !== 'string') {
    return false;
  }

  const value = idValues ?? cond.value;

  switch (cond.op) {
    case 'is':
      return Array.isArray(value) ? value.includes(id) : value === id;
    case 'isNot':
      return Array.isArray(value) ? !value.includes(id) : value !== id;
    case 'oneOf':
      return Array.isArray(value) && value.includes(id);
    case 'notOneOf':
      return Array.isArray(value) && !value.includes(id);
    case 'contains':
      return (
        typeof cond.value === 'string' &&
        name.toLowerCase().includes(cond.value.toLowerCase())
      );
    case 'doesNotContain':
      return (
        typeof cond.value === 'string' &&
        !name.toLowerCase().includes(cond.value.toLowerCase())
      );
    case 'matches': {
      if (typeof cond.value !== 'string' || cond.value.length > 256) {
        return false;
      }
      try {
        // Support both a bare pattern ("Bills") and a delimiter-wrapped
        // one ("/Bills/i"-style, minus flags) — strips the wrapping
        // slashes if present, otherwise uses the value as-is.
        const pattern =
          cond.value.startsWith('/') && cond.value.lastIndexOf('/') > 0
            ? cond.value.slice(1, cond.value.lastIndexOf('/'))
            : cond.value;
        return new RegExp(pattern, 'i').test(name);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
