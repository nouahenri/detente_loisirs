-- =====================================================================
--  FICHE DU BIEN SUR LES PUBLICATIONS FACEBOOK
--
--  Ajoute à `facebook_posts` les colonnes descriptives de la table `villas`
--  (mêmes noms, mêmes types), pour que les publications soient retenues par
--  la recherche du site et que leur fiche se renseigne depuis le studio.
--
--  À EXÉCUTER AVANT de déployer la version du site qui les lit.
--  Le site sait fonctionner sans elles (il retombe sur l'ancienne lecture),
--  mais la fiche ne pourra pas être enregistrée en base tant qu'elles
--  n'existent pas.
--
--  phpMyAdmin → base « c2828676c_henri&philippe » → onglet SQL.
--
--  Sans risque : ADD COLUMN n'efface ni ne modifie aucune donnée. Toutes les
--  publications existantes reçoivent une fiche vide (« non renseigné »).
--  Relancé par erreur, le script échoue sur « Duplicate column name » sans
--  rien toucher.
-- =====================================================================

ALTER TABLE `facebook_posts`
  ADD COLUMN `name`            VARCHAR(160)      NOT NULL DEFAULT '' AFTER `full_picture`,
  ADD COLUMN `tagline`         VARCHAR(240)      NOT NULL DEFAULT '' AFTER `name`,
  ADD COLUMN `category`        VARCHAR(80)       NOT NULL DEFAULT '' AFTER `tagline`,
  ADD COLUMN `category_label`  VARCHAR(80)       NOT NULL DEFAULT '' AFTER `category`,
  ADD COLUMN `environment`     VARCHAR(32)       NOT NULL DEFAULT '' AFTER `category_label`,
  ADD COLUMN `location`        VARCHAR(240)      NOT NULL DEFAULT '' AFTER `environment`,
  ADD COLUMN `price_per_night` BIGINT UNSIGNED   NULL AFTER `location`,
  ADD COLUMN `price_euro`      INT UNSIGNED      NULL AFTER `price_per_night`,
  ADD COLUMN `weekend_package` BIGINT UNSIGNED   NULL AFTER `price_euro`,
  ADD COLUMN `capacity`        SMALLINT UNSIGNED NULL AFTER `weekend_package`,
  ADD COLUMN `bedrooms`        SMALLINT UNSIGNED NULL AFTER `capacity`,
  ADD COLUMN `bathrooms`       SMALLINT UNSIGNED NULL AFTER `bedrooms`,
  ADD COLUMN `beds`            VARCHAR(160)      NOT NULL DEFAULT '' AFTER `bathrooms`,
  ADD COLUMN `status`          VARCHAR(40)       NOT NULL DEFAULT '' AFTER `beds`,
  ADD COLUMN `badge`           VARCHAR(80)       NOT NULL DEFAULT '' AFTER `status`,
  ADD COLUMN `featured`        TINYINT(1)        NOT NULL DEFAULT 0 AFTER `badge`,
  ADD COLUMN `features`        JSON              NULL AFTER `featured`,
  ADD COLUMN `highlights`      JSON              NULL AFTER `features`;

-- Contrôle : les 18 colonnes doivent apparaître entre `full_picture` et `raw`.
SHOW COLUMNS FROM `facebook_posts`;
