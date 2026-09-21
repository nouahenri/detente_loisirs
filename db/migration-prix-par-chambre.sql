-- =====================================================================
--  VILLAS ET RÉSIDENCES FACTURÉES PAR CHAMBRE (21/09/2026)
--
--  Le tarif saisi dans le studio vaut soit pour la villa entière (par
--  nuit, comme avant), soit pour UNE chambre (par chambre et par nuit) :
--  le site et l'app affichent alors « / chambre / nuit » et le devis
--  demande le nombre de chambres (1 à « Chambres » de la fiche).
--
--  À EXÉCUTER AVANT de déployer la version du site qui l'utilise.
--  phpMyAdmin → base « c2828676c_henri&philippe » → Importer.
--  Sans risque : une colonne ajoutée (ADD COLUMN IF NOT EXISTS), valeur
--  « villa » pour toutes les fiches existantes, aucune donnée modifiée.
--  Relancé par erreur, le script ne change rien.
-- =====================================================================

ALTER TABLE `villas`
  ADD COLUMN IF NOT EXISTS `price_unit` VARCHAR(16) NOT NULL DEFAULT 'villa' COMMENT 'villa : prix de la villa entière ; chambre : prix par chambre' AFTER `price_per_night`;
