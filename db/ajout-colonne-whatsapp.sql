-- =====================================================================
--  AJOUT DU NUMÉRO WHATSAPP AUX ABONNÉS NEWSLETTER
--
--  À EXÉCUTER AVANT de déployer la nouvelle version du site.
--  Sans cette colonne, chaque inscription portant un numéro serait
--  refusée par MySQL (l'abonné serait alors sauvé dans le fichier de
--  secours, et le studio afficherait « Stockage dégradé »).
--
--  phpMyAdmin → base « c2828676c_henri&philippe » → onglet SQL.
--
--  Sans risque : ADD COLUMN n'affecte aucune donnée existante, et les
--  abonnés déjà enregistrés reçoivent simplement une valeur vide.
-- =====================================================================

ALTER TABLE `newsletter_subscribers`
  ADD COLUMN `phone` VARCHAR(40) NOT NULL DEFAULT '' AFTER `name`;

-- Contrôle : la colonne doit apparaître en 4e position.
SHOW COLUMNS FROM `newsletter_subscribers`;
