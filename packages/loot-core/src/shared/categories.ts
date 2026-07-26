import type { CategoryGroupEntity } from '#types/models';

export type CategoryGroupNode = CategoryGroupEntity & {
  subgroups?: CategoryGroupNode[];
};

/**
 * Takes the flat list of category groups as they come from the database
 * (each with an optional `parent_group_id`) and returns only the
 * top-level groups, each carrying a `subgroups` array populated with its
 * direct children, recursively. Order within `subgroups` follows the
 * order groups appear in the input array.
 */
export type GroupWithParent = {
  id: string;
  parent_group_id?: string | null;
};

function buildChildrenByParentMap<T extends GroupWithParent>(
  groups: T[],
): Map<string, T[]> {
  const childrenByParent = new Map<string, T[]>();
  groups.forEach(group => {
    if (group.parent_group_id) {
      const siblings = childrenByParent.get(group.parent_group_id) ?? [];
      siblings.push(group);
      childrenByParent.set(group.parent_group_id, siblings);
    }
  });
  return childrenByParent;
}

export function groupCategoryGroupsIntoTree(
  groups: CategoryGroupEntity[],
): CategoryGroupNode[] {
  const childrenByParent = buildChildrenByParentMap(groups);

  function attachSubgroups(group: CategoryGroupEntity): CategoryGroupNode {
    return {
      ...group,
      subgroups: (childrenByParent.get(group.id) ?? []).map(attachSubgroups),
    };
  }

  return groups.filter(group => !group.parent_group_id).map(attachSubgroups);
}

/**
 * Given a group id, walks upward through `parent_group_id` and returns
 * the full ancestor chain: the group's own id first, then its parent,
 * grandparent, and so on up to (and including) the root group.
 *
 * Used to check "is this category under group X" style matching: X
 * matches if it appears anywhere in the chain, regardless of depth.
 *
 * Only needs `id`/`parent_group_id`, so it accepts either the
 * client-facing `CategoryGroupEntity` or a raw server-side row shape
 * (e.g. `DbCategoryGroup`) — both satisfy `GroupWithParent`.
 */
export function getAncestorGroupIds(
  groupId: string | null | undefined,
  groups: GroupWithParent[],
): string[] {
  if (!groupId) {
    return [];
  }

  const byId = new Map(groups.map(group => [group.id, group]));
  const chain: string[] = [];
  const seen = new Set<string>();

  let current: string | null | undefined = groupId;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = byId.get(current)?.parent_group_id ?? null;
  }

  return chain;
}

/**
 * Given a group id, returns that group's own id plus the ids of every
 * descendant group at any depth (children, grandchildren, etc).
 *
 * Used to expand "categories in group X" into the full set of groups
 * that should count as "under X" for matching/filtering purposes.
 *
 * Only needs `id`/`parent_group_id`; see `getAncestorGroupIds` above.
 */
export function getDescendantGroupIds(
  groupId: string,
  groups: GroupWithParent[],
): string[] {
  const childrenByParent = buildChildrenByParentMap(groups);

  const result: string[] = [groupId];
  const queue: string[] = [groupId];

  let i = 0;
  while (i < queue.length) {
    const current = queue[i];
    i++;
    for (const child of childrenByParent.get(current) ?? []) {
      result.push(child.id);
      queue.push(child.id);
    }
  }

  return result;
}
