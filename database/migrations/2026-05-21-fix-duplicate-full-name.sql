-- Migration: fix duplicate full_name values in users and add unique constraint
-- WARNING: Run only after backing up your database. Requires admin privileges.

BEGIN;

-- Preview duplicated names (for review)
SELECT full_name, count(*) AS duplicates, array_agg(id ORDER BY id) AS ids
FROM public.users
GROUP BY full_name
HAVING count(*) > 1;

-- Rename duplicate rows (keep the first id in lexical order as canonical)
WITH duplicates AS (
  SELECT full_name, id, row_number() OVER (PARTITION BY full_name ORDER BY id) rn
  FROM public.users
),
to_update AS (
  SELECT id, full_name AS old_full_name, full_name || ' (' || left(id::text, 8) || ')' AS new_full_name
  FROM duplicates
  WHERE rn > 1
)
UPDATE public.users u
SET full_name = t.new_full_name
FROM to_update t
WHERE u.id = t.id
RETURNING u.id, t.old_full_name, t.new_full_name;

-- At this point full_name values should be unique. Add unique constraint.
ALTER TABLE public.users
  ADD CONSTRAINT unique_full_name UNIQUE (full_name);

COMMIT;
