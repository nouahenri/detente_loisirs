# Corrections ciblées : admin, parallaxe et hero

## Changements locaux

- `server.js` : MySQL configuré reste prioritaire pour publier. Le miroir JSON est actualisé après le COMMIT seulement. Une erreur SQL conserve le contenu publié ; un échec du miroir après COMMIT est signalé comme avertissement. Les dossiers clients sont modifiables même s'ils existent uniquement en base ; une erreur SQL n'est plus absorbée. Les sondes de reconnexion simultanées sont regroupées.
- `scripts/migrate.js` et `scripts/seed-from-json.js` : chargement de `.env` avant le pool, sans écraser les variables de cPanel.
- `scripts/migrate.js` : ajout des seules colonnes manquantes `villas.environment`, `activities.price_amount`, `price_unit`, `group_price_amount`, `group_size`. Aucune réinitialisation des colonnes existantes ni import automatique de données.
- `js/app.js` et `css/refonte.css` : image du bandeau hors du dimensionnement du cadre, réserve de hauteur de 28 %, mouvement lié au défilement, fonctionnement indépendant du chargement de l'API et respect de la réduction des animations. Largeur du cadre bornée sur mobile.
- `css/refonte.css` : opacités du voile du hero d'accueil réduites. Les bannières intérieures conservent leur voile.
- `index.html` : version des deux ressources changées pour actualiser le cache de l'accueil.

## Validation

`node --test tests/corrections.test.js`

Les tests utilisent les fonctions du projet avec des doublures de stockage : aucun accès à MySQL, aucune écriture dans les données métier. Ils couvrent les modes JSON/MySQL, les erreurs SQL, le COMMIT suivi d'une erreur disque, les dossiers uniquement en base, la reconnexion, les ajouts de colonnes idempotents, les requêtes paramétrées, le rollback global et le parallaxe.

Contrôle navigateur réalisé à 1280 px et 390 px : déplacement mesuré, couverture complète du cadre par l'image, texte du bandeau dans la largeur mobile et hero lisible. Aucune erreur JavaScript relevée dans l'aperçu.

## Finalisation sur LWS

Déploiement terminé le 11 septembre 2026 à 19:46 UTC. Le paquet envoyé manuellement a été vérifié par SHA-256 : `ba254614798c56824d87c57ad7db4dbc89684912c829f35a7070f1f57cdd2e05`. Les six fichiers ont été modifiés par remplacement de blocs uniques, après validation de leur syntaxe et réussite des 11 tests sur les candidats du serveur.

Les originaux et le manifeste des empreintes avant/après sont conservés dans `/home/c2828676c/.codex-backups/assinie-2026-09-11T19-46-07-113Z`. Le redémarrage Passenger a été demandé via `tmp/restart.txt` à 19:46:30 UTC. Le ZIP a été déplacé hors de la racine publique, dans `/home/c2828676c/.codex-deploy/assinie-20260911/`. Aucun seed ni migration SQL n'a été exécuté ; les identifiants et `.env` restent inchangés.

### Vérifications après déploiement

- L'administration rechargée fonctionne. La publication du catalogue existant affiche « Publié · enregistré en base ».
- La relecture directe MySQL confirme `settings.updatedAt = 2026-09-11T19:48:51.430Z`. Villas, terrains, activités, avis, FAQ, publications Facebook et réglages sont identiques à la sauvegarde de référence, hors dates de publication. Ce contrôle valide la publication sans introduire de donnée métier fictive ; il ne constitue pas un test exhaustif de tous les formulaires.
- L'accueil charge bien `css/refonte.css?v=20260912b` et `js/app.js?v=20260912b`. Le style calculé du hero confirme les nouvelles opacités 0,52 / 0,42 / 0,14 / 0,02 et le voile inférieur 0,30.
- Parallaxe en production : pour un déplacement du cadre de 310,55 px à 43,05 px, la translation de l'image évolue de −102,48 px à −67,58 px. Le mouvement différentiel est actif. Le cadre mesure 525,37 px et l'image 672,46 px ; la réserve couvre le cadre. L'image est chargée et aucune erreur JavaScript n'est remontée dans le contrôle navigateur.
- Les contrôles à 390 px et 1280 px mentionnés plus haut ont été réalisés sur l'aperçu local avant déploiement. Le contrôle distant a porté sur le format bureau. Les captures Chrome distantes ont connu des délais d'attente ; les mesures DOM ont néanmoins abouti.

### Constats distants confirmés

- L'application Node 22.22.3 tourne en production dans `/home/c2828676c/public_html/henri-philippe.com`, avec `app.js` comme point d'entrée.
- Les identifiants sont chargés depuis le `.env` serveur ; le test `db/pool.ping()` retourne `{ ok: true }` vers la base attendue. Aucun mot de passe n'a été affiché ni modifié.
- Les cinq colonnes suspectées sont déjà présentes : `villas.environment`, `activities.price_amount`, `price_unit`, `group_price_amount`, `group_size`. Aucune migration de ces colonnes n'a été effectuée.
- L'admin était connecté avec le compte propriétaire. Un point de reprise a été créé et une copie du catalogue lu depuis MySQL a été enregistrée dans le répertoire privé `/home/c2828676c/.codex-backups/verification-admin-20260911/content-before.json`.
- Une publication du catalogue actuel, sans modification de valeurs, a réussi : « Publié · enregistré en base ». La relecture SQL confirme le passage de `updatedAt` de `2026-09-11T13:32:54.984Z` à `2026-09-11T19:05:19.111Z`.
- La comparaison avant/après confirme que villas, terrains, activités, avis, FAQ, publications Facebook et réglages sont identiques, hors date de publication. L'écriture fonctionne donc au moment de ce contrôle ; la cause d'un éventuel échec antérieur n'est pas établie par ce test.
- Avant ce déploiement, la version serveur incluait déjà la reprise de sonde et la tentative SQL basée sur la configuration. L'actualisation du miroir après COMMIT et le nouveau parallaxe sont désormais déployés.

### Repères pour Claude Code et une intervention ultérieure

1. Se connecter à cPanel et vérifier que l'application Node utilise `app.js`, le bon dossier et les variables `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. Le lien phpMyAdmin n'est pas une chaîne de connexion MySQL.
2. Confirmer la base cible et sauvegarder la base ainsi que les fichiers applicatifs avant déploiement.
3. Déployer les fichiers modifiés. Dans l'environnement Node de l'application, exécuter `npm run migrate` si des colonnes manquent. Ce script utilise désormais `.env` si nécessaire. Ne pas lancer `npm run seed` sur la production sans comparaison préalable : il peut remplacer des valeurs existantes.
4. Redémarrer l'application et contrôler `storage` dans `GET /api/admin/dashboard` : `databaseConfigured: true`, `databaseReady: true`, `databaseError: null`.
5. Sur une fiche choisie, cliquer sur « Enregistrer », puis « Publier les changements ». Vérifier la réponse `storage: "mysql"`, la valeur dans la base et sa conservation après rechargement. Le premier bouton prépare toujours la fiche ; le second publie.
6. Si des modifications anciennes ne sont présentes qu'en JSON, comparer les deux sources avant une reprise ciblée. Aucun transfert automatique n'a été effectué.

## Ajustement desktop après retour visuel

Déployé sur `css/refonte.css` et `index.html` (version CSS `20260912c`). À partir de 1024 px : suppression de la largeur maximale héritée sur les paragraphes du bandeau, même alignement droit des trois lignes, marge du slogan 0,5 rem et padding supérieur 0,45 rem. Ombres renforcées ; sous-titre doré plus clair et gras. L’image passe à 155 % de la hauteur du cadre si les animations sont autorisées, contre 128 % auparavant. Les règles mobiles et le mode de réduction des animations restent inchangés.

Vérification DOM distante : les trois bords droits coïncident à moins de 0,01 px ; les nouvelles ombres sont appliquées ; hauteur du cadre 653,80 px et image 1013,39 px. L’extension n’a pas appliqué le viewport mobile demandé : aucun nouveau contrôle mobile effectif n’est revendiqué. Sauvegarde serveur : `/home/c2828676c/.codex-backups/parallaxe-desktop-1789157065696`. Cette intervention porte uniquement sur le style du bandeau et la version CSS ; aucun changement au serveur applicatif ou aux données.
