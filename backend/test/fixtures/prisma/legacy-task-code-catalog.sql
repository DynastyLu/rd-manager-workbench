UPDATE "app"."tasks"
SET "code" = CASE "id"
  WHEN 'legacy-max' THEN 'TASK-FFFFFFFFFF'
  WHEN 'legacy-next' THEN 'TASK-0000000004'
  WHEN 'legacy-other' THEN 'TASK-ABCDEF1234'
END
WHERE "id" IN ('legacy-max', 'legacy-next', 'legacy-other');
