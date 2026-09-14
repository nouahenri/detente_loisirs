-- =====================================================================
--  RÉFÉRENTIELS ADMINISTRABLES : localisations, catégories, équipements,
--  badges et statuts (13/09/2026)
--
--  À EXÉCUTER AVANT de déployer la version du site qui les lit.
--  phpMyAdmin → base « c2828676c_henri&philippe » → onglet SQL.
--
--  1. Crée les cinq tables et leurs valeurs initiales (INSERT IGNORE :
--     rejouer le script n'écrase aucune valeur modifiée dans le studio).
--  2. Ajoute les colonnes de rattachement aux villas, terrains, activités et
--     publications Facebook. ADD COLUMN n'efface aucune donnée.
--  3. Rattache les fiches existantes. Chaque UPDATE vérifie la valeur
--     actuelle : une fiche modifiée entre-temps n'est pas touchée.
--
--  Le texte affiché reste identique au caractère près, sauf « Assinie
--  Terminal (Accès direct plage) » qui devient « Assinie Terminal, Accès
--  direct plage » (ville + repère).
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ref_localisations` (
  `id`         VARCHAR(80)  NOT NULL,
  `nom`        VARCHAR(160) NOT NULL,
  `ordre`      INT          NOT NULL DEFAULT 0,
  `actif`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ref_categories` (
  `id`         VARCHAR(80)  NOT NULL,
  `libelle_fr` VARCHAR(160) NOT NULL,
  `libelle_en` VARCHAR(160) NOT NULL DEFAULT '',
  `libelle_es` VARCHAR(160) NOT NULL DEFAULT '',
  `ordre`      INT          NOT NULL DEFAULT 0,
  `actif`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ref_equipements` (
  `id`         VARCHAR(80)  NOT NULL,
  `libelle_fr` VARCHAR(160) NOT NULL,
  `libelle_en` VARCHAR(160) NOT NULL DEFAULT '',
  `libelle_es` VARCHAR(160) NOT NULL DEFAULT '',
  `ordre`      INT          NOT NULL DEFAULT 0,
  `actif`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ref_badges` (
  `id`         VARCHAR(80)  NOT NULL,
  `libelle_fr` VARCHAR(160) NOT NULL,
  `libelle_en` VARCHAR(160) NOT NULL DEFAULT '',
  `libelle_es` VARCHAR(160) NOT NULL DEFAULT '',
  `ordre`      INT          NOT NULL DEFAULT 0,
  `actif`      TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codes fixes : le site en dépend (un terrain « vendu » disparaît du site).
-- Seuls les libellés se modifient dans le studio.
CREATE TABLE IF NOT EXISTS `ref_statuts` (
  `cible`      VARCHAR(20)  NOT NULL COMMENT 'villa ou terrain',
  `code`       VARCHAR(40)  NOT NULL,
  `libelle_fr` VARCHAR(160) NOT NULL,
  `libelle_en` VARCHAR(160) NOT NULL DEFAULT '',
  `libelle_es` VARCHAR(160) NOT NULL DEFAULT '',
  `ordre`      INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cible`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Valeurs initiales (identiques à db/referentiels.js), en trois langues.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO `ref_localisations` (`id`, `nom`, `ordre`) VALUES
  ('assinie-mafia', 'Assinie-Mafia', 1),
  ('assinie-terminal', 'Assinie Terminal', 2),
  ('assinie', 'Assinie', 3);

INSERT IGNORE INTO `ref_categories` (`id`, `libelle_fr`, `libelle_en`, `libelle_es`, `ordre`) VALUES
  ('lagune', 'Bord de Lagune', 'Lagoon Front', 'Frente a la laguna', 1),
  ('ocean', 'Bord d''Océan', 'Ocean Front', 'Frente al océano', 2),
  ('piscine', 'Piscines Privées', 'Private Pools', 'Piscinas privadas', 3),
  ('evenement', 'Grands Groupes & Événements', 'Large Groups & Events', 'Grupos grandes y eventos', 4),
  ('romantique', 'Escapades en Amoureux', 'Romantic Getaways', 'Escapadas en pareja', 5);

INSERT IGNORE INTO `ref_equipements` (`id`, `libelle_fr`, `libelle_en`, `libelle_es`, `ordre`) VALUES
  ('piscine', 'Piscine', 'Pool', 'Piscina', 1),
  ('jacuzzi', 'Jacuzzi', 'Jacuzzi', 'Jacuzzi', 2),
  ('wifi', 'Wi-Fi', 'Wi-Fi', 'Wi-Fi', 3),
  ('climatisation', 'Climatisation', 'Air conditioning', 'Aire acondicionado', 4),
  ('ponton', 'Ponton privé', 'Private pontoon', 'Embarcadero privado', 5),
  ('acces-plage', 'Accès direct à la plage', 'Direct beach access', 'Acceso directo a la playa', 6),
  ('parking', 'Parking', 'Parking', 'Aparcamiento', 7),
  ('groupe-electrogene', 'Groupe électrogène', 'Backup generator', 'Generador eléctrico', 8),
  ('gardiennage', 'Gardiennage / sécurité', 'Caretaker / security', 'Vigilancia / seguridad', 9),
  ('barbecue', 'Barbecue', 'Barbecue', 'Barbacoa', 10),
  ('cuisine-equipee', 'Cuisine équipée', 'Fitted kitchen', 'Cocina equipada', 11),
  ('television', 'Télévision', 'Television', 'Televisión', 12),
  ('menage', 'Ménage / gouvernante', 'Housekeeping', 'Servicio de limpieza', 13),
  ('chef', 'Chef cuisinier', 'Chef', 'Cocinero', 14);

INSERT IGNORE INTO `ref_badges` (`id`, `libelle_fr`, `libelle_en`, `libelle_es`, `ordre`) VALUES
  ('disponible', 'Disponible', 'Available', 'Disponible', 1),
  ('coup-de-coeur', 'Coup de Cœur', 'Our Favourite', 'Nuestro Favorito', 2),
  ('plage-privee', 'Plage Privée', 'Private Beach', 'Playa Privada', 3),
  ('famille-amis', 'Famille & Amis', 'Family & Friends', 'Familia y Amigos', 4),
  ('grands-groupes', 'Grands Groupes', 'Large Groups', 'Grupos Grandes', 5),
  ('special-couple', 'Spécial Couple', 'Perfect for Couples', 'Ideal para Parejas', 6),
  ('vue-exceptionnelle', 'Vue Exceptionnelle', 'Exceptional View', 'Vista Excepcional', 7),
  ('exclusivite', 'Exclusivité', 'Exclusive', 'Exclusiva', 8),
  ('reserve', 'Réservé', 'Reserved', 'Reservado', 9),
  ('projet-hotelier', 'Projet hôtelier', 'Hotel project', 'Proyecto hotelero', 10),
  ('top-activite', 'Top Activité', 'Top Activity', 'Actividad Estrella', 11),
  ('sensations-fortes', 'Sensations Fortes', 'Thrills', 'Emociones Fuertes', 12),
  ('ecotourisme', 'Écotourisme', 'Ecotourism', 'Ecoturismo', 13),
  ('aventure', 'Aventure', 'Adventure', 'Aventura', 14),
  ('en-famille', 'En Famille', 'Family Friendly', 'En Familia', 15),
  ('gourmand', 'Gourmand', 'Gourmet', 'Gourmet', 16),
  ('nature', 'Nature', 'Nature', 'Naturaleza', 17),
  ('transfert', 'Transfert', 'Transfer', 'Traslado', 18);

INSERT IGNORE INTO `ref_statuts` (`cible`, `code`, `libelle_fr`, `libelle_en`, `libelle_es`, `ordre`) VALUES
  ('villa', 'disponible', 'Disponible', 'Available', 'Disponible', 1),
  ('villa', 'sur-demande', 'Sur demande', 'On request', 'Bajo petición', 2),
  ('villa', 'indisponible', 'Indisponible', 'Unavailable', 'No disponible', 3),
  ('terrain', 'disponible', 'Disponible', 'Available', 'Disponible', 1),
  ('terrain', 'reserve', 'Réservé', 'Reserved', 'Reservado', 2),
  ('terrain', 'vendu', 'Vendu', 'Sold', 'Vendido', 3);

-- ---------------------------------------------------------------------
-- 2. Colonnes de rattachement
-- ---------------------------------------------------------------------
ALTER TABLE `villas`
  ADD COLUMN `localisation_id`        VARCHAR(80)  NULL AFTER `location`,
  ADD COLUMN `localisation_precision` VARCHAR(240) NOT NULL DEFAULT '' AFTER `localisation_id`,
  ADD COLUMN `badge_id`               VARCHAR(80)  NULL AFTER `badge`,
  ADD COLUMN `equipements`            JSON         NULL AFTER `features`;

ALTER TABLE `terrains`
  ADD COLUMN `localisation_id`        VARCHAR(80)  NULL AFTER `location`,
  ADD COLUMN `localisation_precision` VARCHAR(240) NOT NULL DEFAULT '' AFTER `localisation_id`,
  ADD COLUMN `badge_id`               VARCHAR(80)  NULL AFTER `badge`;

ALTER TABLE `activities`
  ADD COLUMN `badge_id`               VARCHAR(80)  NULL AFTER `badge`;

ALTER TABLE `facebook_posts`
  ADD COLUMN `localisation_id`        VARCHAR(80)  NULL AFTER `location`,
  ADD COLUMN `localisation_precision` VARCHAR(240) NOT NULL DEFAULT '' AFTER `localisation_id`,
  ADD COLUMN `badge_id`               VARCHAR(80)  NULL AFTER `badge`,
  ADD COLUMN `equipements`            JSON         NULL AFTER `features`;

-- ---------------------------------------------------------------------
-- 3. Rattachement des fiches existantes
-- ---------------------------------------------------------------------
-- Localisations : ville + repère, fiche par fiche, sur leur texte actuel.
UPDATE `villas` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'Km 14 (Bord de lagune)'
  WHERE `id` = 'villa-oasis' AND `location` = 'Assinie-Mafia, Km 14 (Bord de lagune)';
UPDATE `villas` SET `localisation_id` = 'assinie-terminal', `localisation_precision` = 'Accès direct plage',
  `location` = 'Assinie Terminal, Accès direct plage'
  WHERE `id` = 'residence-palm-beach' AND `location` = 'Assinie Terminal (Accès direct plage)';
UPDATE `villas` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'Km 9'
  WHERE `id` = 'villa-akwaba' AND `location` = 'Assinie-Mafia, Km 9';
UPDATE `villas` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'Km 18'
  WHERE `id` = 'domaine-eden' AND `location` = 'Assinie-Mafia, Km 18';
UPDATE `villas` SET `localisation_id` = 'assinie', `localisation_precision` = 'Km 6'
  WHERE `id` = 'pavillon-serenite' AND `location` = 'Assinie, Km 6';
UPDATE `villas` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'Km 16'
  WHERE `id` = 'villa-sunset-paradise' AND `location` = 'Assinie-Mafia, Km 16';

UPDATE `terrains` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'Km 12 (bord de lagune)'
  WHERE `id` = 'terrain-lagune-km12' AND `location` = 'Assinie-Mafia, Km 12 (bord de lagune)';
UPDATE `terrains` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'côté océan'
  WHERE `id` = 'terrain-ocean-mafia' AND `location` = 'Assinie-Mafia, côté océan';
UPDATE `terrains` SET `localisation_id` = 'assinie', `localisation_precision` = 'secteur La Passe'
  WHERE `id` = 'terrain-lotissement-passe' AND `location` = 'Assinie, secteur La Passe';
UPDATE `terrains` SET `localisation_id` = 'assinie-mafia', `localisation_precision` = 'Km 16'
  WHERE `id` = 'terrain-grand-lot-agrement' AND `location` = 'Assinie-Mafia, Km 16';

-- Badges : rattachés par leur libellé actuel, quelle que soit la fiche.
UPDATE `villas` v JOIN `ref_badges` b ON b.`libelle_fr` = v.`badge` SET v.`badge_id` = b.`id` WHERE v.`badge_id` IS NULL;
UPDATE `terrains` t JOIN `ref_badges` b ON b.`libelle_fr` = t.`badge` SET t.`badge_id` = b.`id` WHERE t.`badge_id` IS NULL;
UPDATE `activities` a JOIN `ref_badges` b ON b.`libelle_fr` = a.`badge` SET a.`badge_id` = b.`id` WHERE a.`badge_id` IS NULL;

-- Équipements : pré-cochés d'après les lignes descriptives de chaque villa
-- (à vérifier dans le studio). « Piscine » n'est coché que lorsque le mot
-- figure dans la fiche : le filtre « Piscines Privées » donne les mêmes
-- résultats qu'avant la migration.
UPDATE `villas` SET `equipements` = '["piscine","wifi","climatisation","ponton","parking","groupe-electrogene","gardiennage","barbecue","cuisine-equipee","television","menage"]'
  WHERE `id` = 'villa-oasis' AND `equipements` IS NULL;
UPDATE `villas` SET `equipements` = '["piscine","wifi","climatisation","acces-plage","groupe-electrogene","gardiennage","barbecue","cuisine-equipee","chef"]'
  WHERE `id` = 'residence-palm-beach' AND `equipements` IS NULL;
UPDATE `villas` SET `equipements` = '["piscine","wifi","climatisation","parking","gardiennage","barbecue","cuisine-equipee","television","menage"]'
  WHERE `id` = 'villa-akwaba' AND `equipements` IS NULL;
UPDATE `villas` SET `equipements` = '["piscine","wifi","climatisation","ponton","parking","groupe-electrogene","gardiennage","cuisine-equipee","chef"]'
  WHERE `id` = 'domaine-eden' AND `equipements` IS NULL;
UPDATE `villas` SET `equipements` = '["jacuzzi","wifi","climatisation","gardiennage","cuisine-equipee","television"]'
  WHERE `id` = 'pavillon-serenite' AND `equipements` IS NULL;
UPDATE `villas` SET `equipements` = '["piscine","wifi","climatisation","ponton","groupe-electrogene","gardiennage","barbecue","cuisine-equipee","menage"]'
  WHERE `id` = 'villa-sunset-paradise' AND `equipements` IS NULL;

-- Contrôles
SELECT `id`, `location`, `localisation_id`, `localisation_precision`, `badge`, `badge_id`, `equipements` FROM `villas`;
SELECT `id`, `location`, `localisation_id`, `localisation_precision`, `badge`, `badge_id` FROM `terrains`;
SELECT `id`, `badge`, `badge_id` FROM `activities`;
