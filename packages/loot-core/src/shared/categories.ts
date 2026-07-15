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
export function groupCategoryGroupsIntoTree(
  groups: CategoryGroupEntity[],
): CategoryGroupNode[] {
  const childrenByParent = new Map<string, CategoryGroupEntity[]>();
  groups.forEach(group => {
    if (group.parent_group_id) {
      const siblings = childrenByParent.get(group.parent_group_id) ?? [];
      siblings.push(group);
      childrenByParent.set(group.parent_group_id, siblings);
    }
  });

  function attachSubgroups(group: CategoryGroupEntity): CategoryGroupNode {
    return {
      ...group,
      subgroups: (childrenByParent.get(group.id) ?? []).map(attachSubgroups),
    };
  }

  return groups.filter(group => !group.parent_group_id).map(attachSubgroups);
}
