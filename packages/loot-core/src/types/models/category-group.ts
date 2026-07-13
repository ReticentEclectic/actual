import type { CategoryEntity } from './category';

export type CategoryGroupEntity = {
  id: string;
  name: string;
  is_income?: boolean;
  sort_order?: number;
  tombstone?: boolean;
  hidden?: boolean;
  categories?: CategoryEntity[];
  // Self-reference: null/undefined means this is a top-level group.
  // A child group's `is_income` is always inherited from its parent
  // (enforced at the point groups are created/moved, not by the DB).
  parent_group_id?: CategoryGroupEntity['id'] | null;
};
