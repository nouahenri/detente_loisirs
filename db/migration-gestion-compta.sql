-- =====================================================================
--  GESTION DES ANNONCES, DEMANDEURS, AVIS, COMPTABILITÉ, MOTS DE PASSE
--  ET RÔLES (demandes du 17/09/2026)
--
--  À EXÉCUTER AVANT de déployer la version du site qui les utilise.
--  phpMyAdmin → base « c2828676c_henri&philippe » → onglet SQL.
--
--  Sans risque pour les données : les tables sont créées si elles
--  n'existent pas (CREATE TABLE IF NOT EXISTS) et les colonnes ajoutées
--  reçoivent une valeur neutre (annonces « active », case Facebook
--  « jamais enregistrée »). Seul le réglage retiré du studio
--  `facebookAutoPublish` est effacé des réglages : la publication sur
--  Facebook dépend désormais de la case de chaque annonce.
--
--  Relancé par erreur : les tables et la suppression du réglage passent
--  sans rien changer, puis les ALTER TABLE échouent sur « Duplicate column
--  name » sans rien toucher (ils sont placés en dernier pour cette raison).
-- =====================================================================

-- ---------------------------------------------------------------------
-- DEMANDEURS BLOQUÉS OU SUSPENDUS (fiche de la demande, zone contact)
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

-- ---------------------------------------------------------------------
-- « J'AIME » ET COMMENTAIRES DES VISITEURS SUR LES ANNONCES
-- `visiteur` : empreinte SHA-256 d'un jeton du navigateur, jamais l'IP.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- COMPTABILITÉ : écritures (entrées / sorties), employés, charges
-- récurrentes et paramètres administrables (catégories, modes, statuts).
-- Montants en FCFA entiers.
-- ---------------------------------------------------------------------
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
  `poste`           VARCHAR(120)    NOT NULL DEFAULT '',
  `telephone`       VARCHAR(40)     NOT NULL DEFAULT '',
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
-- MOT DE PASSE OUBLIÉ : liens à usage unique, valables une heure.
-- Seule l'empreinte SHA-256 du jeton est stockée, jamais le jeton.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_resets` (
  `token_hash` CHAR(64)  NOT NULL,
  `user_id`    CHAR(36)  NOT NULL,
  `expires_at` DATETIME  NOT NULL,
  `created_at` DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_hash`),
  KEY `idx_password_resets_user` (`user_id`),
  KEY `idx_password_resets_expires` (`expires_at`),
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- RÔLES ET PERMISSIONS (Utilisateurs → Rôles et permissions)
-- Vide au départ : les rôles prédéfinis (Propriétaire, Éditeur,
-- Commercial) viennent du code ; une ligne n'est écrite que lorsqu'un
-- rôle est modifié ou créé au studio.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `code`        VARCHAR(20)  NOT NULL,
  `libelle`     VARCHAR(60)  NOT NULL,
  `description` VARCHAR(240) NOT NULL DEFAULT '',
  `permissions` JSON         NULL,
  `ordre`       INT          NOT NULL DEFAULT 99,
  `supprime`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- RÉGLAGE RETIRÉ : publication automatique de toutes les annonces
-- ---------------------------------------------------------------------
DELETE FROM `settings` WHERE `setting_key` = 'facebookAutoPublish';

-- ---------------------------------------------------------------------
-- ANNONCES : état (en ligne, suspendue, archivée) et case Facebook
-- ---------------------------------------------------------------------
ALTER TABLE `villas`
  ADD COLUMN `etat`     VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee' AFTER `translations`,
  ADD COLUMN `facebook` TINYINT(1)  NULL DEFAULT NULL COMMENT 'case Publier sur Facebook (NULL : jamais enregistrée)' AFTER `etat`;

ALTER TABLE `terrains`
  ADD COLUMN `etat`     VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee' AFTER `translations`,
  ADD COLUMN `facebook` TINYINT(1)  NULL DEFAULT NULL COMMENT 'case Publier sur Facebook (NULL : jamais enregistrée)' AFTER `etat`;

ALTER TABLE `activities`
  ADD COLUMN `etat`     VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active, suspendue, archivee' AFTER `featured`,
  ADD COLUMN `facebook` TINYINT(1)  NULL DEFAULT NULL COMMENT 'case Publier sur Facebook (NULL : jamais enregistrée)' AFTER `etat`;

-- Contrôle : 9 nouvelles tables, et `etat` / `facebook` sur les 3 catalogues.
SHOW TABLES;
SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('etat', 'facebook') AND TABLE_NAME IN ('villas', 'terrains', 'activities');
