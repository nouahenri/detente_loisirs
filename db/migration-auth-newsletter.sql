-- =====================================================================
--  Détente & Loisirs / Henri & Philippe — MIGRATION
--  Comptes utilisateurs, sessions, newsletter et file d'attente e-mail.
--
--  À APPLIQUER SUR LA BASE DE PRODUCTION DÉJÀ CRÉÉE :
--    phpMyAdmin → base « c2828676c_henri&philippe » → onglet « Importer »
--    → choisir ce fichier → « Exécuter ».
--
--  Toutes les instructions utilisent CREATE TABLE IF NOT EXISTS : le script
--  peut être rejoué sans risque, il ne détruit et ne modifie aucune donnée
--  existante (villas, terrains, activités, avis, FAQ, réglages, demandes).
--
--  Moteur InnoDB · utf8mb4_unicode_ci · MySQL 5.7+ / MariaDB 10.3+.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. UTILISATEURS DU STUDIO
--
-- `password_hash` ne contient JAMAIS le mot de passe : il stocke le
-- condensé scrypt au format « scrypt$N$r$p$keylen$<hexadécimal> ».
-- Les paramètres sont inscrits dans la valeur elle-même pour pouvoir les
-- durcir plus tard sans invalider les mots de passe déjà enregistrés.
-- `password_salt` est un sel aléatoire de 16 octets, propre à chaque
-- utilisateur (32 caractères hexadécimaux).
--
-- `failed_attempts` + `locked_until` implémentent le verrouillage
-- progressif : au-delà de 5 échecs consécutifs, le compte est bloqué
-- pour une durée qui croît à chaque nouvel échec.
--
-- Rôles autorisés (contrôlés par l'application, pas par un ENUM SQL,
-- pour qu'un ajout de rôle ne demande pas d'ALTER TABLE) :
--   · proprietaire — accès total, y compris la gestion des utilisateurs
--   · editeur      — villas, terrains, activités, contenus, Facebook
--   · commercial   — demandes clients et newsletter uniquement
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`              CHAR(36)     NOT NULL,
  `username`        VARCHAR(60)  NOT NULL,
  `email`           VARCHAR(180) NOT NULL DEFAULT '',
  `password_hash`   VARCHAR(255) NOT NULL,
  `password_salt`   VARCHAR(64)  NOT NULL,
  `role`            VARCHAR(20)  NOT NULL DEFAULT 'editeur',
  `active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login_at`   DATETIME     NULL DEFAULT NULL,
  `failed_attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until`    DATETIME     NULL DEFAULT NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. SESSIONS
--
-- Le jeton de session n'est JAMAIS stocké en clair : seule son empreinte
-- SHA-256 (64 caractères hexadécimaux) est enregistrée. Une fuite de la
-- base ne permet donc pas de rejouer une session ouverte.
--
-- `expires_at` est prolongé à chaque requête authentifiée (session
-- glissante de 8 heures). La suppression de la ligne = déconnexion réelle
-- côté serveur, indépendante du cookie resté dans le navigateur.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `token_hash`   CHAR(64)     NOT NULL,
  `user_id`      CHAR(36)     NOT NULL,
  `expires_at`   DATETIME     NOT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip`           VARCHAR(64)  NOT NULL DEFAULT '',
  `user_agent`   VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`token_hash`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. ABONNÉS À LA NEWSLETTER (double opt-in)
--
-- `status` :
--   · en-attente — inscription enregistrée, confirmation non cliquée
--   · confirme   — l'abonné a cliqué le lien reçu par e-mail
--   · desabonne  — désinscription (le lien figure dans chaque envoi)
--
-- Les deux jetons sont stockés HACHÉS (SHA-256). Le lien envoyé par
-- e-mail contient la valeur en clair, que le serveur re-hache pour
-- retrouver la ligne. Une fuite de la base ne permet donc ni de
-- confirmer ni de désabonner une adresse à la place de son titulaire.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `newsletter_subscribers` (
  `id`                     CHAR(36)     NOT NULL,
  `email`                  VARCHAR(180) NOT NULL,
  `name`                   VARCHAR(120) NOT NULL DEFAULT '',
  `phone`                  VARCHAR(40)  NOT NULL DEFAULT '',
  `status`                 VARCHAR(20)  NOT NULL DEFAULT 'en-attente',
  `confirm_token_hash`     CHAR(64)     NULL DEFAULT NULL,
  `unsubscribe_token_hash` CHAR(64)     NULL DEFAULT NULL,
  `source`                 VARCHAR(60)  NOT NULL DEFAULT 'site',
  `confirmed_at`           DATETIME     NULL DEFAULT NULL,
  `unsubscribed_at`        DATETIME     NULL DEFAULT NULL,
  `ip`                     VARCHAR(64)  NOT NULL DEFAULT '',
  `created_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_newsletter_email` (`email`),
  KEY `idx_newsletter_status` (`status`),
  KEY `idx_newsletter_confirm` (`confirm_token_hash`),
  KEY `idx_newsletter_unsub` (`unsubscribe_token_hash`),
  KEY `idx_newsletter_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. CAMPAGNES
--
-- `status` : brouillon | en-cours | envoye | partiel | erreur
-- `sent_count` est le nombre de destinataires réellement acceptés par le
-- serveur SMTP (les messages mis en file d'attente ne sont comptés qu'au
-- moment de leur envoi effectif).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `newsletter_campaigns` (
  `id`         CHAR(36)     NOT NULL,
  `subject`    VARCHAR(240) NOT NULL,
  `body_html`  MEDIUMTEXT   NULL,
  `body_text`  MEDIUMTEXT   NULL,
  `status`     VARCHAR(20)  NOT NULL DEFAULT 'brouillon',
  `sent_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `sent_at`    DATETIME     NULL DEFAULT NULL,
  `created_by` VARCHAR(60)  NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaigns_status` (`status`),
  KEY `idx_campaigns_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. FILE D'ATTENTE DES E-MAILS
--
-- Exigence : le site doit rester debout SANS SMTP. Tout message qui ne
-- peut pas partir (SMTP non configuré, serveur injoignable, module
-- nodemailer absent) est déposé ici avec le statut « en-attente », et
-- signalé dans le studio. Aucune inscription, aucune demande client
-- n'est jamais perdue à cause d'un e-mail.
--
-- `status` : en-attente | envoye | echec
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mail_queue` (
  `id`           CHAR(36)     NOT NULL,
  `kind`         VARCHAR(40)  NOT NULL DEFAULT 'generique',
  `recipient`    VARCHAR(240) NOT NULL,
  `subject`      VARCHAR(240) NOT NULL DEFAULT '',
  `body_html`    MEDIUMTEXT   NULL,
  `body_text`    MEDIUMTEXT   NULL,
  `headers`      TEXT         NULL,
  `status`       VARCHAR(20)  NOT NULL DEFAULT 'en-attente',
  `attempts`     INT UNSIGNED NOT NULL DEFAULT 0,
  `last_error`   VARCHAR(500) NOT NULL DEFAULT '',
  `last_try_at`  DATETIME     NULL DEFAULT NULL,
  `sent_at`      DATETIME     NULL DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mail_queue_status` (`status`),
  KEY `idx_mail_queue_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- MOT DE PASSE OUBLIÉ ET RÔLES ADMINISTRABLES (17/09/2026)
-- Définitions identiques à db/migration-gestion-compta.sql.
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

-- =====================================================================
--  Vérification rapide après import (à copier dans l'onglet « SQL ») :
--
--  SELECT COUNT(*) AS utilisateurs FROM users;
--  SELECT COUNT(*) AS abonnes FROM newsletter_subscribers;
--  SHOW TABLES;   -- doit lister notamment users, sessions, password_resets et roles
--
--  Le premier compte se crée EN LIGNE DE COMMANDE, jamais en SQL :
--    node scripts/creer-utilisateur.js --username henri --role proprietaire
--  (le mot de passe est demandé en saisie masquée et haché avant écriture).
-- =====================================================================
