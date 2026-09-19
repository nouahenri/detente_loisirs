-- =====================================================================
--  NOTIFICATIONS DE L'APP ET CARNET DES CONTACTS (demande du 19/09/2026)
--
--  À EXÉCUTER AVANT de déployer la version du site qui les utilise.
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--
--  Sans risque : trois tables nouvelles (CREATE TABLE IF NOT EXISTS) et
--  trois colonnes ajoutées aux fiches employés (ADD COLUMN IF NOT EXISTS).
--  Aucune donnée existante n'est modifiée ni supprimée. Relancé par erreur,
--  le script ne change rien.
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

-- ---------------------------------------------------------------------
-- FICHES EMPLOYÉS (comptabilité) complétées : prénom, e-mail, WhatsApp.
-- ---------------------------------------------------------------------
ALTER TABLE `compta_employes`
  ADD COLUMN IF NOT EXISTS `prenom`   VARCHAR(80)  NOT NULL DEFAULT '' AFTER `nom`,
  ADD COLUMN IF NOT EXISTS `email`    VARCHAR(180) NOT NULL DEFAULT '' AFTER `telephone`,
  ADD COLUMN IF NOT EXISTS `whatsapp` VARCHAR(40)  NOT NULL DEFAULT '' AFTER `email`;
