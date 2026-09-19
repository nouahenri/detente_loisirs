-- =====================================================================
--  PROPRIÉTAIRE DU BIEN DANS LA FICHE DE L'ANNONCE (19/09/2026)
--
--  La plateforme est intermédiaire entre les clients et les propriétaires
--  des biens : nom, prénom, téléphone et WhatsApp du propriétaire se
--  saisissent dans la fiche de la villa, du terrain ou de l'activité
--  (studio seulement, jamais montrés sur le site ni dans l'app).
--  Les voitures gardent déjà leur fiche complète (colonne `donnees`).
--
--  À EXÉCUTER AVANT de déployer la version du site qui les utilise.
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--  Sans risque : une colonne ajoutée par table (ADD COLUMN IF NOT EXISTS),
--  aucune donnée modifiée. Relancé par erreur, le script ne change rien.
-- =====================================================================

ALTER TABLE `villas`
  ADD COLUMN IF NOT EXISTS `proprietaire` JSON NULL COMMENT 'propriétaire du bien (nom, prénom, téléphone, WhatsApp) : studio seulement' AFTER `facebook`;

ALTER TABLE `terrains`
  ADD COLUMN IF NOT EXISTS `proprietaire` JSON NULL COMMENT 'propriétaire du bien (nom, prénom, téléphone, WhatsApp) : studio seulement' AFTER `facebook`;

ALTER TABLE `activities`
  ADD COLUMN IF NOT EXISTS `proprietaire` JSON NULL COMMENT 'propriétaire du bien (nom, prénom, téléphone, WhatsApp) : studio seulement' AFTER `facebook`;
