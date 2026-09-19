-- =====================================================================
--  LOCATION DE VOITURES (demande du 17/09/2026)
--
--  À EXÉCUTER AVANT de déployer la version du site qui les utilise.
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--
--  Sans risque : quatre tables nouvelles (CREATE TABLE IF NOT EXISTS),
--  aucune donnée existante n'est touchée. Relancé par erreur, le script ne
--  change rien.
--
--  Le site fonctionne sans elles (véhicules gardés dans le miroir JSON,
--  réservations dans data/location.json), mais la base est la référence.
-- =====================================================================

-- ---------------------------------------------------------------------
-- VÉHICULES DU CATALOGUE (annonces, publiées par « Publier les changements »)
-- La fiche complète est gardée dans `donnees` (JSON) ; les autres colonnes
-- servent au tri et à la lecture rapide.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vehicles` (
  `id`            VARCHAR(80)     NOT NULL,
  `name`          VARCHAR(160)    NOT NULL,
  `category`      VARCHAR(40)     NOT NULL DEFAULT '',
  `price_per_day` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `visible`       TINYINT(1)      NOT NULL DEFAULT 1,
  `featured`      TINYINT(1)      NOT NULL DEFAULT 0,
  `etat`          VARCHAR(20)     NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee',
  `sort_order`    INT             NOT NULL DEFAULT 0,
  `donnees`       JSON            NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vehicles_ordre` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- RÉSERVATIONS : demandes du site et de l'app, saisies du studio.
-- Seules `confirmee` et `en_cours` bloquent les dates du véhicule.
-- Dates en UTC (= heure d'Abidjan).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `location_reservations` (
  `id`               CHAR(36)        NOT NULL,
  `vehicule_id`      VARCHAR(80)     NOT NULL,
  `vehicule_nom`     VARCHAR(160)    NOT NULL DEFAULT '',
  `lead_id`          VARCHAR(36)     NOT NULL DEFAULT '' COMMENT 'demande liée (menu Demandes)',
  `statut`           VARCHAR(20)     NOT NULL DEFAULT 'demande' COMMENT 'demande, confirmee, en_cours, terminee, annulee',
  `debut`            DATETIME        NOT NULL,
  `fin`              DATETIME        NOT NULL,
  `chauffeur`        TINYINT(1)      NOT NULL DEFAULT 0,
  `lieu_prise`       VARCHAR(80)     NOT NULL DEFAULT '',
  `lieu_retour`      VARCHAR(80)     NOT NULL DEFAULT '',
  `adresse_prise`    VARCHAR(200)    NOT NULL DEFAULT '' COMMENT 'lieu à préciser : domicile, bureau, autre',
  `adresse_retour`   VARCHAR(200)    NOT NULL DEFAULT '',
  `options`          JSON            NULL,
  `jours`            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `montant`          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `caution`          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `client_nom`       VARCHAR(120)    NOT NULL DEFAULT '',
  `client_telephone` VARCHAR(40)     NOT NULL DEFAULT '',
  `client_email`     VARCHAR(180)    NOT NULL DEFAULT '',
  `notes`            VARCHAR(1000)   NOT NULL DEFAULT '',
  `source`           VARCHAR(10)     NOT NULL DEFAULT 'site' COMMENT 'site, app, studio',
  `cree_par`         VARCHAR(120)    NOT NULL DEFAULT '',
  `modifie_par`      VARCHAR(120)    NOT NULL DEFAULT '',
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_location_reservations_vehicule` (`vehicule_id`, `debut`),
  KEY `idx_location_reservations_statut` (`statut`),
  KEY `idx_location_reservations_lead` (`lead_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- INDISPONIBILITÉS : entretien, panne, usage interne… (bloquent les dates)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `location_indisponibilites` (
  `id`          CHAR(36)     NOT NULL,
  `vehicule_id` VARCHAR(80)  NOT NULL,
  `motif`       VARCHAR(20)  NOT NULL DEFAULT 'entretien' COMMENT 'entretien, panne, usage_interne, autre',
  `debut`       DATETIME     NOT NULL,
  `fin`         DATETIME     NOT NULL,
  `notes`       VARCHAR(500) NOT NULL DEFAULT '',
  `cree_par`    VARCHAR(120) NOT NULL DEFAULT '',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_location_indisponibilites_vehicule` (`vehicule_id`, `debut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- RÉGLAGES : lieux de prise en charge et leurs frais, options, horaires,
-- délai de réservation, battement entre deux locations, conditions.
-- Une seule ligne (`id` = 'general'), document JSON.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `location_reglages` (
  `id`         VARCHAR(20)  NOT NULL,
  `donnees`    JSON         NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contrôle, à lancer ENSUITE dans l'onglet SQL (pas dans ce fichier) :
--   SHOW TABLES LIKE '%location%';   -- 3 tables
--   SHOW TABLES LIKE 'vehicles';

-- ---------------------------------------------------------------------
-- Adresses des lieux « à préciser » (19/09/2026) : ajoutées si la table
-- existait déjà avant cette version du script. Sans effet sinon.
-- ---------------------------------------------------------------------
ALTER TABLE `location_reservations`
  ADD COLUMN IF NOT EXISTS `adresse_prise`  VARCHAR(200) NOT NULL DEFAULT '' AFTER `lieu_retour`,
  ADD COLUMN IF NOT EXISTS `adresse_retour` VARCHAR(200) NOT NULL DEFAULT '' AFTER `adresse_prise`;
