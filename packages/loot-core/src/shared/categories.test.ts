import type { CategoryGroupEntity } from '#types/models';

import { groupCategoryGroupsIntoTree } from './categories';

describe('groupCategoryGroupsIntoTree', () => {
  const groups: CategoryGroupEntity[] = [
    { id: 'groceries', name: 'Groceries' },
    { id: 'home', name: 'Home' },
    { id: 'utilities', name: 'Utilities', parent_group_id: 'home' },
    { id: 'electricity', name: 'Electricity', parent_group_id: 'utilities' },
  ];

  it('returns only top-level groups at the root', () => {
    const tree = groupCategoryGroupsIntoTree(groups);
    expect(tree.map(g => g.id)).toEqual(['groceries', 'home']);
  });

  it('attaches direct children as subgroups', () => {
    const tree = groupCategoryGroupsIntoTree(groups);
    const home = tree.find(g => g.id === 'home');
    expect(home?.subgroups?.map(g => g.id)).toEqual(['utilities']);
  });

  it('attaches children recursively at any depth', () => {
    const tree = groupCategoryGroupsIntoTree(groups);
    const home = tree.find(g => g.id === 'home');
    const utilities = home?.subgroups?.find(g => g.id === 'utilities');
    expect(utilities?.subgroups?.map(g => g.id)).toEqual(['electricity']);
  });

  it('gives groups with no children an empty subgroups array', () => {
    const tree = groupCategoryGroupsIntoTree(groups);
    const groceries = tree.find(g => g.id === 'groceries');
    expect(groceries?.subgroups).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupCategoryGroupsIntoTree([])).toEqual([]);
  });
});
