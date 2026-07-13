BEGIN TRANSACTION;

ALTER TABLE category_groups ADD COLUMN parent_group_id TEXT REFERENCES category_groups(id);

COMMIT;
