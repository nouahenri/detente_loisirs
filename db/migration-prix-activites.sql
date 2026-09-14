-- =====================================================================
--  Détente & Loisirs / Henri & Philippe
--  MIGRATION — tarification chiffrée des activités
--
--  À APPLIQUER SUR LA BASE DE PRODUCTION DÉJÀ CRÉÉE :
--    phpMyAdmin → base « c2828676c_henri&philippe » → onglet « Importer »
--    → choisir ce fichier → « Exécuter ».
--
--  POURQUOI : la colonne `price` est un libellé libre affiché aux visiteurs
--  (« À partir de 25 000 FCFA / jour »). Le simulateur de devis devait en
--  extraire un montant par analyse de texte, ce qui échoue dès qu'on écrit
--  « Nous consulter » ou « 25.000 F ». Ces deux colonnes portent la valeur
--  exacte et sa base de facturation.
--
--  Ce script ne détruit aucune donnée et peut être rejoué sans risque.
-- =====================================================================
SET NAMES utf8mb4;

-- MySQL 5.7 / MariaDB 10.3 n'acceptent pas « ADD COLUMN IF NOT EXISTS ».
-- On passe donc par information_schema : la requête ne s'exécute que si la
-- colonne manque réellement.
SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `activities` ADD COLUMN `price_amount` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `price`',
    'SELECT ''Colonne price_amount déjà présente'' AS info'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'price_amount'
);
PREPARE requete FROM @sql; EXECUTE requete; DEALLOCATE PREPARE requete;

SET @sql := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `activities` ADD COLUMN `price_unit` VARCHAR(20) NOT NULL DEFAULT ''forfait'' AFTER `price_amount`',
    'SELECT ''Colonne price_unit déjà présente'' AS info'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'price_unit'
);
PREPARE requete FROM @sql; EXECUTE requete; DEALLOCATE PREPARE requete;

-- ---------------------------------------------------------------------
--  Reprise des tarifs existants : on renseigne les nouvelles colonnes à
--  partir des libellés actuels, pour que le simulateur garde exactement les
--  mêmes montants qu'avant la migration. Seules les lignes encore à 0 sont
--  touchées : une valeur déjà saisie dans le studio n'est jamais écrasée.
-- ---------------------------------------------------------------------
UPDATE `activities` SET `price_amount` = 25000, `price_unit` = 'jour'     WHERE `id` = 'chef-prive'          AND `price_amount` = 0;
UPDATE `activities` SET `price_amount` = 60000, `price_unit` = 'forfait'  WHERE `id` = 'balade-bateau'       AND `price_amount` = 0;
UPDATE `activities` SET `price_amount` = 45000, `price_unit` = 'forfait'  WHERE `id` = 'jet-ski'             AND `price_amount` = 0;
UPDATE `activities` SET `price_amount` = 75000, `price_unit` = 'forfait'  WHERE `id` = 'iles-ehotiles'       AND `price_amount` = 0;
UPDATE `activities` SET `price_amount` = 35000, `price_unit` = 'forfait'  WHERE `id` = 'randonnee-quad'      AND `price_amount` = 0;
UPDATE `activities` SET `price_amount` =  5000, `price_unit` = 'personne' WHERE `id` = 'parc-dipi'           AND `price_amount` = 0;
UPDATE `activities` SET `price_amount` = 25000, `price_unit` = 'forfait'  WHERE `id` = 'location-quad-plage' AND `price_amount` = 0;

-- Contrôle
SELECT `id`, `title`, `price`, `price_amount`, `price_unit` FROM `activities` ORDER BY `sort_order`;
