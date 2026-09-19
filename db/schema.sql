-- =====================================================================
--  Détente & Loisirs à Assinie — schéma MySQL
--  Moteur InnoDB · utf8mb4_unicode_ci · compatible MySQL 5.7+ / MariaDB 10.3+
--
--  À importer via phpMyAdmin (onglet « Importer ») ou via `npm run migrate`.
--  Toutes les tables utilisent CREATE TABLE IF NOT EXISTS : le script peut
--  être rejoué sans risque, il ne détruit jamais de données existantes.
--
--  CHOIX DE MODÉLISATION — pourquoi des colonnes JSON et non des tables filles
--  pour `images`, `features`, `highlights`, `utilities` :
--   1. Ces tableaux sont TOUJOURS lus avec leur parent et jamais séparément :
--      aucune requête du site ne demande « les villas ayant telle image ».
--   2. Ils sont ORDONNÉS (la première image est le visuel principal) ; une
--      table fille imposerait une colonne `position` et un ORDER BY partout.
--   3. Ils sont écrits en bloc (l'admin renvoie la liste complète) : un
--      DELETE + INSERT en cascade serait plus coûteux et moins atomique.
--   4. Cela conserve une correspondance 1 pour 1 avec `data/site-content.json`,
--      ce qui permet aux deux modes (JSON et MySQL) de partager exactement les
--      mêmes signatures de fonctions dans db/repository.js.
--   Seule `terrains.utilities` aurait pu justifier une table fille (filtrage
--   « terrains viabilisés en eau »), mais avec quelques dizaines de terrains
--   un filtrage applicatif reste largement suffisant.
--   MariaDB traite JSON comme un alias de LONGTEXT : la compatibilité est
--   assurée sur l'ensemble des offres cPanel.
-- =====================================================================

SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ---------------------------------------------------------------------
-- RÉFÉRENTIELS ADMINISTRABLES (studio → Référentiels)
-- Valeurs initiales : db/migration-referentiels.sql et db/referentiels.js.
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

-- Codes fixes : le site en dépend (un terrain « vendu » perd son bouton de
-- contact). Seuls les libellés se modifient dans le studio.
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
-- VILLAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `villas` (
  `id`              VARCHAR(80)     NOT NULL,
  `name`            VARCHAR(160)    NOT NULL,
  `tagline`         VARCHAR(240)    NOT NULL DEFAULT '',
  `category`        VARCHAR(80)     NOT NULL DEFAULT '' COMMENT 'thème (ref_categories.id), facultatif',
  `category_label`  VARCHAR(80)     NOT NULL DEFAULT '',
  `environment`     VARCHAR(32)     NOT NULL DEFAULT 'terre',
  `location`        VARCHAR(240)    NOT NULL DEFAULT '',
  `localisation_id` VARCHAR(80)     NULL COMMENT 'ref_localisations.id',
  `localisation_precision` VARCHAR(240) NOT NULL DEFAULT '',
  `description`     TEXT            NULL,
  `price_per_night` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `price_euro`      INT UNSIGNED    NOT NULL DEFAULT 0,
  `weekend_package` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `capacity`        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `bedrooms`        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `bathrooms`       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `beds`            VARCHAR(160)    NOT NULL DEFAULT '',
  `status`          VARCHAR(40)     NOT NULL DEFAULT 'disponible',
  `badge`           VARCHAR(80)     NOT NULL DEFAULT '',
  `badge_id`        VARCHAR(80)     NULL COMMENT 'ref_badges.id',
  `visible`         TINYINT(1)      NOT NULL DEFAULT 1,
  `featured`        TINYINT(1)      NOT NULL DEFAULT 0,
  `rating`          DECIMAL(2,1)    NULL,
  `reviews_count`   INT UNSIGNED    NOT NULL DEFAULT 0,
  `images`          JSON            NULL,
  `features`        JSON            NULL,
  `equipements`     JSON            NULL COMMENT 'codes ref_equipements',
  `highlights`      JSON            NULL,
  `translations`    JSON            NULL COMMENT 'textes EN/ES de la fiche',
  `etat`            VARCHAR(20)     NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee',
  `facebook`        TINYINT(1)      NULL DEFAULT NULL COMMENT 'case Publier sur Facebook (NULL : jamais enregistrée)',
  `sort_order`      INT             NOT NULL DEFAULT 0,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_villas_visible` (`visible`),
  KEY `idx_villas_featured` (`featured`),
  KEY `idx_villas_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- TERRAINS (vente de parcelles)
-- `price_per_sqm` et `price_euro` sont des valeurs DÉRIVÉES : elles sont
-- toujours recalculées par le serveur avant écriture, jamais saisies.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `terrains` (
  `id`                VARCHAR(80)     NOT NULL,
  `reference`         VARCHAR(40)     NOT NULL,
  `title`             VARCHAR(160)    NOT NULL,
  `location`          VARCHAR(240)    NOT NULL DEFAULT '',
  `localisation_id`   VARCHAR(80)     NULL COMMENT 'ref_localisations.id',
  `localisation_precision` VARCHAR(240) NOT NULL DEFAULT '',
  `district`          VARCHAR(120)    NOT NULL DEFAULT '',
  `area_sqm`          INT UNSIGNED    NOT NULL,
  `price_total`       BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `price_per_sqm`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `price_euro`        INT UNSIGNED    NOT NULL DEFAULT 0,
  `land_status`       ENUM('titre-foncier','acd','lettre-attribution','certificat-propriete')
                                      NOT NULL DEFAULT 'titre-foncier',
  `land_status_label` VARCHAR(80)     NOT NULL DEFAULT '',
  `utilities`         JSON            NULL,
  `status`            ENUM('disponible','reserve','vendu') NOT NULL DEFAULT 'disponible',
  `description`       TEXT            NULL,
  `images`            JSON            NULL,
  `highlights`        JSON            NULL,
  `visible`           TINYINT(1)      NOT NULL DEFAULT 1,
  `featured`          TINYINT(1)      NOT NULL DEFAULT 0,
  `badge`             VARCHAR(80)     NOT NULL DEFAULT '',
  `badge_id`          VARCHAR(80)     NULL COMMENT 'ref_badges.id',
  `latitude`          DECIMAL(10,7)   NULL,
  `longitude`         DECIMAL(10,7)   NULL,
  `translations`      JSON            NULL COMMENT 'textes EN/ES de la fiche',
  `etat`              VARCHAR(20)     NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee',
  `facebook`          TINYINT(1)      NULL DEFAULT NULL COMMENT 'case Publier sur Facebook (NULL : jamais enregistrée)',
  `sort_order`        INT             NOT NULL DEFAULT 0,
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_terrains_reference` (`reference`),
  KEY `idx_terrains_status` (`status`),
  KEY `idx_terrains_visible` (`visible`),
  KEY `idx_terrains_featured` (`featured`),
  KEY `idx_terrains_land_status` (`land_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- ACTIVITÉS & LOISIRS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activities` (
  `id`          VARCHAR(80)  NOT NULL,
  `title`       VARCHAR(160) NOT NULL,
  `subtitle`    VARCHAR(240) NOT NULL DEFAULT '',
  `description` TEXT         NULL,
  `image`       VARCHAR(1000) NOT NULL DEFAULT '',
  `images`      JSON         NULL,
  `duration`    VARCHAR(80)  NOT NULL DEFAULT '',
  `price`       VARCHAR(80)  NOT NULL DEFAULT '',
  -- Tarification chiffree utilisee par le simulateur de devis.
  -- `price` reste le libelle affiche ; ces deux colonnes portent la valeur exacte.
  `price_amount` INT UNSIGNED NOT NULL DEFAULT 0,
  `price_unit`  VARCHAR(20)  NOT NULL DEFAULT 'forfait',
  `group_price_amount` INT UNSIGNED NOT NULL DEFAULT 0,
  `group_size`        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- Mentions libres du tarif affiché, généré depuis le montant (db/fiches.js).
  `price_prefix` VARCHAR(80)  NOT NULL DEFAULT '',
  `price_suffix` VARCHAR(80)  NOT NULL DEFAULT '',
  `translations` JSON         NULL COMMENT 'textes EN/ES de la fiche',
  `badge`       VARCHAR(80)  NOT NULL DEFAULT '',
  `badge_id`    VARCHAR(80)  NULL COMMENT 'ref_badges.id',
  `visible`     TINYINT(1)   NOT NULL DEFAULT 1,
  `featured`    TINYINT(1)   NOT NULL DEFAULT 0,
  `etat`        VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee',
  `facebook`    TINYINT(1)   NULL DEFAULT NULL COMMENT 'case Publier sur Facebook (NULL : jamais enregistrée)',
  `sort_order`  INT          NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activities_visible` (`visible`),
  KEY `idx_activities_featured` (`featured`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- AVIS CLIENTS
-- `id` est un hachage stable de (author + stay) calculé côté application,
-- ce qui rend le import idempotent bien que le JSON source n'ait pas d'id.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reviews` (
  `id`         VARCHAR(80)  NOT NULL,
  `author`     VARCHAR(160) NOT NULL,
  `city`       VARCHAR(160) NOT NULL DEFAULT '',
  `stay`       VARCHAR(240) NOT NULL DEFAULT '',
  `rating`     TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `date_label` VARCHAR(80)  NOT NULL DEFAULT '',
  `comment`    TEXT         NULL,
  `avatar`     VARCHAR(1000) NOT NULL DEFAULT '',
  `visible`    TINYINT(1)   NOT NULL DEFAULT 1,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reviews_visible` (`visible`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- FOIRE AUX QUESTIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `faq` (
  `id`         VARCHAR(80) NOT NULL,
  `question`   VARCHAR(500) NOT NULL,
  `answer`     TEXT        NULL,
  `visible`    TINYINT(1)  NOT NULL DEFAULT 1,
  `sort_order` INT         NOT NULL DEFAULT 0,
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_faq_visible` (`visible`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- RÉGLAGES DU SITE (clé / valeur)
-- La valeur est stockée en JSON pour accepter texte, nombre ou objet.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` VARCHAR(120) NOT NULL,
  `value`       JSON         NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- DEMANDES CLIENTS (leads)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leads` (
  `id`          CHAR(36)     NOT NULL,
  `type`        VARCHAR(40)  NOT NULL DEFAULT 'demande',
  `name`        VARCHAR(120) NOT NULL DEFAULT '',
  `email`       VARCHAR(180) NOT NULL DEFAULT '',
  `phone`       VARCHAR(40)  NOT NULL DEFAULT '',
  `villa`       VARCHAR(160) NOT NULL DEFAULT '',
  `terrain_ref` VARCHAR(40)  NOT NULL DEFAULT '',
  `terrain_id`  VARCHAR(80)  NOT NULL DEFAULT '',
  `dates`       VARCHAR(160) NOT NULL DEFAULT '',
  `amount`      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `message`     TEXT         NULL,
  `admin_notes` TEXT         NULL,
  `status`      ENUM('nouveau','contacte','confirme','archive') NOT NULL DEFAULT 'nouveau',
  `source_ip`   VARCHAR(45)  NOT NULL DEFAULT '',
  `whatsapp_optin`    TINYINT(1) NULL DEFAULT NULL COMMENT 'Accord offres WhatsApp : NULL non recueilli, 1 oui, 0 non',
  `whatsapp_optin_at` DATETIME   NULL DEFAULT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leads_status` (`status`),
  KEY `idx_leads_created_at` (`created_at`),
  KEY `idx_leads_status_created` (`status`, `created_at`),
  KEY `idx_leads_terrain` (`terrain_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- PUBLICATIONS FACEBOOK IMPORTÉES
-- La clé primaire EST l'identifiant Facebook : la déduplication est donc
-- garantie par la base, pas par le code applicatif.
--
-- FICHE DU BIEN (colonnes `name` à `highlights`) : mêmes noms et mêmes types
-- que la table `villas`, renseignés depuis le studio. Une publication Facebook
-- ne dit ni sa capacité, ni son cadre, ni son tarif : sans ces colonnes, la
-- recherche du site ne pouvait pas la retenir.
-- Seule différence voulue avec `villas` : aucune valeur par défaut qui
-- vaudrait une information. Chaîne vide et NULL signifient « non renseigné »,
-- pour qu'une publication sans fiche ne réponde pas à tort au critère
-- « Bord de lagune » ou « 1 personne ».
-- Les synchronisations Facebook ne réécrivent jamais ces colonnes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `facebook_posts` (
  `id`            VARCHAR(200) NOT NULL COMMENT 'Identifiant Facebook (clé de déduplication)',
  `message`       MEDIUMTEXT   NULL,
  `created_time`  DATETIME     NULL,
  `permalink_url` VARCHAR(1000) NOT NULL DEFAULT '',
  `full_picture`  VARCHAR(1000) NOT NULL DEFAULT '',
  `name`            VARCHAR(160)    NOT NULL DEFAULT '',
  `tagline`         VARCHAR(240)    NOT NULL DEFAULT '',
  `category`        VARCHAR(80)     NOT NULL DEFAULT '',
  `category_label`  VARCHAR(80)     NOT NULL DEFAULT '',
  `environment`     VARCHAR(32)     NOT NULL DEFAULT '',
  `location`        VARCHAR(240)    NOT NULL DEFAULT '',
  `localisation_id` VARCHAR(80)     NULL,
  `localisation_precision` VARCHAR(240) NOT NULL DEFAULT '',
  `price_per_night` BIGINT UNSIGNED NULL,
  `price_euro`      INT UNSIGNED    NULL,
  `weekend_package` BIGINT UNSIGNED NULL,
  `capacity`        SMALLINT UNSIGNED NULL,
  `bedrooms`        SMALLINT UNSIGNED NULL,
  `bathrooms`       SMALLINT UNSIGNED NULL,
  `beds`            VARCHAR(160)    NOT NULL DEFAULT '',
  `status`          VARCHAR(40)     NOT NULL DEFAULT '',
  `badge`           VARCHAR(80)     NOT NULL DEFAULT '',
  `badge_id`        VARCHAR(80)     NULL,
  `featured`        TINYINT(1)      NOT NULL DEFAULT 0,
  `features`        JSON            NULL,
  `equipements`     JSON            NULL,
  `highlights`      JSON            NULL,
  `raw`           JSON         NULL,
  `imported_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fb_posts_created_time` (`created_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- JOURNAL DES PUBLICATIONS SORTANTES (site → Facebook)
-- L'index UNIQUE sur `idempotency_key` est le garde-fou anti-doublon :
-- même si deux instances Passenger traitent la même demande en parallèle,
-- la seconde INSERT échoue et aucune publication en double n'est envoyée.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `facebook_publish_log` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `facebook_id`     VARCHAR(200) NOT NULL DEFAULT '',
  `status`          ENUM('en-cours','publie','echec') NOT NULL DEFAULT 'en-cours',
  `content_kind`    VARCHAR(40)  NOT NULL DEFAULT '',
  `content_id`      VARCHAR(80)  NOT NULL DEFAULT '',
  `has_image`       TINYINT(1)   NOT NULL DEFAULT 0,
  `has_link`        TINYINT(1)   NOT NULL DEFAULT 0,
  `error`           VARCHAR(500) NOT NULL DEFAULT '',
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fb_publish_idempotency` (`idempotency_key`),
  KEY `idx_fb_publish_status` (`status`),
  KEY `idx_fb_publish_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- ÉVÉNEMENTS WEBHOOK REÇUS DE META
-- `id` = SHA-256 de la signature de l'événement → rejeu sans doublon.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `facebook_events` (
  `id`          CHAR(64)     NOT NULL,
  `page_id`     VARCHAR(100) NOT NULL DEFAULT '',
  `field`       VARCHAR(100) NOT NULL DEFAULT '',
  `value`       JSON         NULL,
  `received_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed`   TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fb_events_received_at` (`received_at`),
  KEY `idx_fb_events_field` (`field`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- JOURNAL D'AUDIT
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`         CHAR(36)     NOT NULL,
  `action`     VARCHAR(120) NOT NULL,
  `details`    JSON         NULL,
  `actor`      VARCHAR(120) NOT NULL DEFAULT 'admin',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_created_at` (`created_at`),
  KEY `idx_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- VERROUS APPLICATIFS PARTAGÉS
-- Remplace le verrou en mémoire `facebookSyncPromise`, inopérant dès que
-- Passenger lance plusieurs instances du processus Node.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_locks` (
  `lock_name`  VARCHAR(80)  NOT NULL,
  `owner`      VARCHAR(120) NOT NULL DEFAULT '',
  `expires_at` DATETIME     NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lock_name`),
  KEY `idx_locks_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- GESTION DES DEMANDEURS, AVIS DES VISITEURS ET COMPTABILITÉ (17/09/2026)
-- Définitions identiques à db/migration-gestion-compta.sql.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `demandeurs_restrictions` (
  `id`         CHAR(36)     NOT NULL,
  `type`       VARCHAR(20)  NOT NULL COMMENT 'bloque ou suspendu',
  `telephone`  VARCHAR(40)  NOT NULL DEFAULT '' COMMENT 'chiffres seuls, sans indicatif 225',
  `email`      VARCHAR(180) NOT NULL DEFAULT '',
  `nom`        VARCHAR(120) NOT NULL DEFAULT '',
  `motif`      VARCHAR(500) NOT NULL DEFAULT '',
  `lead_id`    VARCHAR(36)  NOT NULL DEFAULT '',
  `jusqu_au`   DATETIME     NULL DEFAULT NULL COMMENT 'fin de suspension ; NULL pour un blocage',
  `cree_par`   VARCHAR(120) NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_restrictions_telephone` (`telephone`),
  KEY `idx_restrictions_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `avis_jaime` (
  `kind`       VARCHAR(20)  NOT NULL,
  `annonce_id` VARCHAR(80)  NOT NULL,
  `visiteur`   CHAR(64)     NOT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`kind`, `annonce_id`, `visiteur`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `avis_commentaires` (
  `id`          CHAR(36)      NOT NULL,
  `kind`        VARCHAR(20)   NOT NULL,
  `annonce_id`  VARCHAR(80)   NOT NULL,
  `nom`         VARCHAR(60)   NOT NULL,
  `note`        TINYINT UNSIGNED NOT NULL,
  `commentaire` VARCHAR(1000) NOT NULL DEFAULT '',
  `statut`      VARCHAR(20)   NOT NULL DEFAULT 'visible' COMMENT 'visible ou masque',
  `visiteur`    VARCHAR(64)   NOT NULL DEFAULT '',
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_avis_commentaires_annonce` (`kind`, `annonce_id`),
  KEY `idx_avis_commentaires_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `compta_ecritures` (
  `id`            CHAR(36)        NOT NULL,
  `date_ecriture` DATE            NOT NULL,
  `sens`          VARCHAR(10)     NOT NULL COMMENT 'entree ou sortie',
  `categorie`     VARCHAR(40)     NOT NULL,
  `montant`       BIGINT UNSIGNED NOT NULL,
  `libelle`       VARCHAR(240)    NOT NULL,
  `tiers`         VARCHAR(160)    NOT NULL DEFAULT '',
  `mode_paiement` VARCHAR(40)     NOT NULL DEFAULT '',
  `statut`        VARCHAR(40)     NOT NULL DEFAULT 'regle',
  `reference`     VARCHAR(80)     NOT NULL DEFAULT '',
  `bien_kind`     VARCHAR(20)     NOT NULL DEFAULT '',
  `bien_id`       VARCHAR(80)     NOT NULL DEFAULT '',
  `lead_id`       VARCHAR(36)     NULL DEFAULT NULL,
  `employe_id`    VARCHAR(36)     NULL DEFAULT NULL,
  `charge_id`     VARCHAR(36)     NULL DEFAULT NULL,
  `periode`       VARCHAR(7)      NULL DEFAULT NULL COMMENT 'AAAA-MM pour la paie et les charges',
  `justificatif`  VARCHAR(120)    NOT NULL DEFAULT '',
  `notes`         VARCHAR(2000)   NOT NULL DEFAULT '',
  `cree_par`      VARCHAR(120)    NOT NULL DEFAULT '' COMMENT 'utilisateur qui a saisi l''écriture',
  `modifie_par`   VARCHAR(120)    NOT NULL DEFAULT '' COMMENT 'dernier utilisateur qui l''a modifiée',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compta_ecritures_date` (`date_ecriture`),
  KEY `idx_compta_ecritures_categorie` (`categorie`),
  KEY `idx_compta_ecritures_lead` (`lead_id`),
  KEY `idx_compta_ecritures_paie` (`employe_id`, `periode`),
  KEY `idx_compta_ecritures_charge` (`charge_id`, `periode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `compta_employes` (
  `id`              CHAR(36)        NOT NULL,
  `nom`             VARCHAR(120)    NOT NULL,
  `prenom`          VARCHAR(80)     NOT NULL DEFAULT '',
  `poste`           VARCHAR(120)    NOT NULL DEFAULT '',
  `telephone`       VARCHAR(40)     NOT NULL DEFAULT '',
  `email`           VARCHAR(180)    NOT NULL DEFAULT '',
  `whatsapp`        VARCHAR(40)     NOT NULL DEFAULT '',
  `salaire_mensuel` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `date_embauche`   DATE            NULL DEFAULT NULL,
  `actif`           TINYINT(1)      NOT NULL DEFAULT 1,
  `notes`           VARCHAR(2000)   NOT NULL DEFAULT '',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `compta_charges` (
  `id`            CHAR(36)         NOT NULL,
  `libelle`       VARCHAR(240)     NOT NULL,
  `categorie`     VARCHAR(40)      NOT NULL,
  `montant`       BIGINT UNSIGNED  NOT NULL,
  `jour`          TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `tiers`         VARCHAR(160)     NOT NULL DEFAULT '',
  `mode_paiement` VARCHAR(40)      NOT NULL DEFAULT '',
  `bien_kind`     VARCHAR(20)      NOT NULL DEFAULT '',
  `bien_id`       VARCHAR(80)      NOT NULL DEFAULT '',
  `debut`         VARCHAR(7)       NOT NULL COMMENT 'AAAA-MM',
  `fin`           VARCHAR(7)       NULL DEFAULT NULL,
  `actif`         TINYINT(1)       NOT NULL DEFAULT 1,
  `notes`         VARCHAR(2000)    NOT NULL DEFAULT '',
  `created_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `compta_parametres` (
  `type`       VARCHAR(20)  NOT NULL COMMENT 'categories, modes ou statuts',
  `id`         VARCHAR(40)  NOT NULL,
  `libelle`    VARCHAR(80)  NOT NULL DEFAULT '',
  `sens`       VARCHAR(10)  NOT NULL DEFAULT '' COMMENT 'catégories : entree ou sortie',
  `effet`      VARCHAR(10)  NOT NULL DEFAULT '' COMMENT 'statuts : regle, attente ou exclu',
  `ordre`      INT          NOT NULL DEFAULT 0,
  `actif`      TINYINT(1)   NOT NULL DEFAULT 1,
  `supprime`   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'valeur initiale retirée au studio',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`type`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- LOCATION DE VOITURES (17/09/2026)
-- Définitions identiques à db/migration-location-voitures.sql.
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

CREATE TABLE IF NOT EXISTS `location_reglages` (
  `id`         VARCHAR(20)  NOT NULL,
  `donnees`    JSON         NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- NOTIFICATIONS DE L'APP ET CARNET DES CONTACTS (19/09/2026)
-- Mêmes définitions que db/migration-notifications-contacts.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PROPRIÉTAIRES des établissements, véhicules, activités et terrains.
-- `annonces` : [{ "kind": "villa|vehicle|activity|terrain", "id": "…" }]
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `proprietaires` (
  `id`         CHAR(36)      NOT NULL,
  `prenom`     VARCHAR(80)   NOT NULL DEFAULT '',
  `nom`        VARCHAR(120)  NOT NULL,
  `email`      VARCHAR(180)  NOT NULL DEFAULT '',
  `telephone`  VARCHAR(40)   NOT NULL DEFAULT '',
  `whatsapp`   VARCHAR(40)   NOT NULL DEFAULT '',
  `annonces`   JSON          NULL,
  `notes`      VARCHAR(1000) NOT NULL DEFAULT '',
  `actif`      TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- TÉLÉPHONES INSCRITS aux notifications de l'app : identifiant de l'app,
-- jeton Expo (notifications distantes, facultatif) et numéro du profil.
-- `cle_telephone` : 8 derniers chiffres, pour retrouver employés,
-- propriétaires et demandeurs quel que soit le format saisi.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_abonnes` (
  `visiteur`      VARCHAR(64)  NOT NULL,
  `jeton`         VARCHAR(200) NOT NULL DEFAULT '',
  `telephone`     VARCHAR(40)  NOT NULL DEFAULT '',
  `cle_telephone` VARCHAR(12)  NOT NULL DEFAULT '',
  `nom`           VARCHAR(120) NOT NULL DEFAULT '',
  `langue`        CHAR(2)      NOT NULL DEFAULT 'fr',
  `plateforme`    VARCHAR(10)  NOT NULL DEFAULT '',
  `inscrit_le`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `vu_le`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`visiteur`),
  KEY `idx_app_abonnes_telephone` (`cle_telephone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- NOTIFICATIONS ENVOYÉES depuis le studio (Messages) : audience, téléphones
-- visés (relevés par l'app) et bilan (push, e-mails).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `app_messages` (
  `id`            CHAR(36)      NOT NULL,
  `titre`         VARCHAR(80)   NOT NULL,
  `corps`         VARCHAR(1000) NOT NULL,
  `audience`      JSON          NULL,
  `destinataires` JSON          NULL,
  `bilan`         JSON          NULL,
  `cree_par`      VARCHAR(120)  NOT NULL DEFAULT '',
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_app_messages_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
