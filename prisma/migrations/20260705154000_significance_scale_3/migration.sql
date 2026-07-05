-- Collapse chapter significance from 1-5 to 1-3 (Background / Meaningful / Pivotal).
UPDATE "Goal"
SET significance = CASE
  WHEN significance <= 2 THEN 1
  WHEN significance = 3 THEN 2
  WHEN significance >= 4 THEN 3
END
WHERE significance IS NOT NULL;
