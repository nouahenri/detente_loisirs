-- Ajoute l'axe « cadre » (emplacement) aux résidences.
-- Distinct de `category`, qui porte l'angle commercial de residences.html.
-- Valeurs alignées 1:1 sur le filtre « Résidence » du simulateur de devis.
-- Idempotent : réexécutable sans erreur.
SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'villas' AND COLUMN_NAME = 'environment') = 0,
  'ALTER TABLE villas ADD COLUMN environment VARCHAR(32) NOT NULL DEFAULT ''terre'' AFTER category_label',
  'SELECT ''colonne environment deja presente'''));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reprise des fiches existantes depuis l'ancienne catégorie.
UPDATE villas SET environment = 'lagune'  WHERE environment = 'terre' AND category = 'lagune';
UPDATE villas SET environment = 'ocean'   WHERE environment = 'terre' AND category = 'ocean';
UPDATE villas SET environment = 'piscine' WHERE environment = 'terre' AND category = 'piscine';
