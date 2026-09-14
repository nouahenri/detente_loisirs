-- Forfait groupe des activités : un prix pour N participants, appliqué
-- automatiquement par le simulateur dès que le groupe atteint cette taille.
-- Idempotent : réexécutable sans erreur.
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'group_price_amount') = 0,
  'ALTER TABLE activities ADD COLUMN group_price_amount INT UNSIGNED NOT NULL DEFAULT 0 AFTER price_unit',
  'SELECT ''group_price_amount deja presente'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'group_size') = 0,
  'ALTER TABLE activities ADD COLUMN group_size TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER group_price_amount',
  'SELECT ''group_size deja presente'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
