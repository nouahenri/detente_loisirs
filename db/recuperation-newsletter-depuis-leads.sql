-- =====================================================================
--  RÉCUPÉRATION DES INSCRIPTIONS NEWSLETTER ÉGARÉES DANS `leads`
--
--  CONTEXTE
--  La version du site déployée jusqu'ici envoyait les inscriptions du
--  bandeau newsletter vers /api/leads (avec type = 'newsletter') au lieu
--  de /api/newsletter. Les adresses sont donc dans la table `leads` et la
--  table `newsletter_subscribers` est restée vide.
--
--  À EXÉCUTER dans phpMyAdmin, base « c2828676c_henri&philippe ».
--  Les requêtes 1 et 2 ne font que LIRE : commencez par elles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Combien d'adresses sont concernées ?
-- ---------------------------------------------------------------------
SELECT COUNT(*) AS inscriptions_egarees
FROM `leads`
WHERE `type` = 'newsletter' AND `email` <> '';

-- ---------------------------------------------------------------------
-- 2. Lesquelles ? (vérifiez avant de recopier quoi que ce soit)
-- ---------------------------------------------------------------------
SELECT `email`, `name`, `created_at`
FROM `leads`
WHERE `type` = 'newsletter' AND `email` <> ''
ORDER BY `created_at` DESC;

-- ---------------------------------------------------------------------
-- 3. RECOPIE vers newsletter_subscribers.
--
--  · Statut « en-attente » : ces personnes n'ont JAMAIS confirmé leur
--    adresse (le double opt-in n'a jamais tourné pour elles). Les passer
--    directement en « confirme » reviendrait à leur envoyer des campagnes
--    sans consentement vérifiable — ne le faites pas.
--  · INSERT IGNORE + index unique sur l'e-mail : la requête peut être
--    relancée, elle ne crée aucun doublon et n'écrase aucun abonné déjà
--    présent.
--  · Les jetons restent NULL : le serveur en génère un à la première
--    relance de confirmation.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO `newsletter_subscribers`
  (`id`, `email`, `name`, `status`, `confirm_token_hash`,
   `unsubscribe_token_hash`, `source`, `confirmed_at`, `unsubscribed_at`,
   `ip`, `created_at`, `updated_at`)
SELECT
  UUID(),
  LOWER(TRIM(`email`)),
  COALESCE(`name`, ''),
  'en-attente',
  NULL,
  NULL,
  'recuperation-leads',
  NULL,
  NULL,
  '',
  `created_at`,
  NOW()
FROM `leads`
WHERE `type` = 'newsletter'
  AND `email` <> ''
  AND `email` LIKE '%_@_%._%'
GROUP BY LOWER(TRIM(`email`));

-- ---------------------------------------------------------------------
-- 4. Contrôle après recopie
-- ---------------------------------------------------------------------
SELECT `status`, COUNT(*) AS total
FROM `newsletter_subscribers`
GROUP BY `status`;
