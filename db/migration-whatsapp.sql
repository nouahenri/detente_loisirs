-- =====================================================================
--  ACCORD POUR LES OFFRES WHATSAPP (menu « Messages » du studio)
--
--  À EXÉCUTER AVANT de déployer le code qui écrit ces colonnes.
--  phpMyAdmin → base « c2828676c_henri&philippe » → onglet SQL.
--
--  Sans risque : ADD COLUMN n'efface ni ne modifie aucune demande.
--  NULL = accord non recueilli (demandes antérieures à la case du
--  simulateur) ; 1 = accord donné ; 0 = case laissée décochée.
-- =====================================================================

ALTER TABLE `leads`
  ADD COLUMN `whatsapp_optin` TINYINT(1) NULL DEFAULT NULL AFTER `source_ip`,
  ADD COLUMN `whatsapp_optin_at` DATETIME NULL DEFAULT NULL AFTER `whatsapp_optin`;

-- Contrôle : les deux colonnes doivent apparaître après `source_ip`.
SHOW COLUMNS FROM `leads`;
