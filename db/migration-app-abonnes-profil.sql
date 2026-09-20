-- =====================================================================
--  PROFIL DES UTILISATEURS DE L'APPLICATION (demande du 20/09/2026)
--
--  « La liste des utilisateurs s'étant enregistré pour recevoir au
--  préalable des demandes de devis doit être vue et administrée dans le
--  studio. » Jusqu'ici seules les personnes ayant ACTIVÉ les notifications
--  étaient enregistrées, et sans leur e-mail : deux colonnes manquaient.
--
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--
--  Sans risque : deux colonnes ajoutées (ADD COLUMN IF NOT EXISTS), aucune
--  donnée existante modifiée ni supprimée. Relancé par erreur, le script
--  ne change rien. `notifications` vaut 1 pour les inscrits d'avant, qui
--  s'étaient justement inscrits pour recevoir les alertes.
-- =====================================================================

ALTER TABLE `app_abonnes`
  ADD COLUMN IF NOT EXISTS `email`         VARCHAR(180) NOT NULL DEFAULT '' AFTER `nom`,
  ADD COLUMN IF NOT EXISTS `notifications` TINYINT(1)   NOT NULL DEFAULT 1  AFTER `email`;

-- Contrôle : la liste des utilisateurs de l'app, la plus récente d'abord.
SELECT `visiteur`, `nom`, `telephone`, `email`, `notifications`,
       IF(`jeton` = '', 'non', 'oui') AS `joignable_push`, `plateforme`, `inscrit_le`, `vu_le`
  FROM `app_abonnes`
 ORDER BY `vu_le` DESC
 LIMIT 50;
