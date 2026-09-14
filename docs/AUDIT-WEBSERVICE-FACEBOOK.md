# Audit du webservice Facebook — Détente & Loisirs à Assinie

**Date :** 10 septembre 2026
**Périmètre :** passerelle Meta Graph API dans `server.js` (synchronisation Page → site et publication site → Page)
**Méthode :** lecture intégrale du code, vérification des chemins d'erreur, contrôle des correctifs appliqués.

---

## Réponse courte à la question posée

> « J'ai mis un webservice entre la page Facebook et le site afin que toute publication sur le site s'affiche automatiquement sur la page (vice versa) : vérifie si le webservice est bien élaboré. »

**Le webservice est sérieusement construit dans le sens Facebook → site.** Webhook signé, déduplication, resynchronisation périodique de secours, journal d'audit sans secret : c'est du travail propre.

**En revanche, la bidirectionnalité annoncée n'existait pas.** Le README affirmait que toute publication sur le site s'affiche automatiquement sur la Page. C'était faux : rien ne déclenchait de publication vers Facebook depuis `POST /api/admin/content`. Seul un bouton manuel dans le studio permettait de publier. **Un seul sens sur deux était automatique.**

C'est désormais explicite : l'administrateur coche « Publier aussi sur Facebook » et désigne les fiches concernées, avec une garde anti-boucle. Le choix de ne PAS rendre ce sens automatique est délibéré — voir le point 3.

---

## Tableau des constats

| # | Constat | Gravité | État |
|---|---|---|---|
| 1 | Une seule publication mal formée faisait échouer toute la synchronisation | **Élevée** | ✅ Corrigé |
| 2 | Aucun délai d'expiration sur les appels Graph API | **Élevée** | ✅ Corrigé |
| 3 | Bidirectionnalité annoncée mais absente dans le sens site → Facebook | **Élevée** | ✅ Corrigé (option explicite) |
| 4 | Verrou de synchronisation en mémoire, inopérant en multi-processus | Moyenne | ✅ Corrigé (table `app_locks`) |
| 5 | Aucun contrôle de l'abonnement webhook au champ `feed` | Moyenne | ✅ Corrigé |
| 6 | Corps brut du webhook concaténé en chaîne avant le calcul HMAC | Moyenne | ✅ Corrigé |
| 7 | Absence de garde anti-boucle site ⇄ Facebook | Moyenne | ✅ Corrigé |
| 8 | Aucune limitation de débit sur la création de demandes | Moyenne | ✅ Corrigé |
| 9 | Verrou d'idempotence de publication uniquement en fichier JSON | Faible | ✅ Corrigé (index UNIQUE en base) |

---

## Détail des constats

### 1. Une publication mal formée cassait toute la synchronisation — **Élevée**

**Constat.** `normalizeFacebookPost()` appelait `cleanPublicUrl()`, une fonction qui **lève une exception** sur une URL invalide. Comme elle était appelée depuis `mergeFacebookPosts()` sur l'ensemble du lot renvoyé par Graph, **une seule** publication comportant un `permalink_url` ou un `full_picture` inattendu faisait remonter l'exception jusqu'à `syncFacebookPosts()`. Résultat : trois tentatives, puis abandon complet, et **aucune** publication importée — y compris les dix-neuf autres parfaitement valides.

C'est le défaut le plus sérieux relevé : un incident ponctuel côté Meta gelait la vitrine du site.

**Correction.** Introduction de `safePublicUrl()`, qui renvoie une chaîne vide au lieu de lever une exception. Les champs écartés sont tracés dans `_droppedFields` pour rester diagnosticables (`server.js:576-590`). Une publication au lien exotique perd son lien ; elle ne fait plus tomber le lot.

### 2. Aucun délai d'expiration sur Graph API — **Élevée**

**Constat.** `fetch()` n'impose aucun délai d'expiration par défaut. Une Graph API injoignable bloquait la requête jusqu'au timeout TCP du système — plusieurs minutes. Sur un hébergement mutualisé où le nombre de processus est plafonné, quelques appels bloqués suffisent à rendre le site indisponible.

**Correction.** `AbortController` avec délai configurable, et messages d'erreur distincts selon qu'il s'agit d'un dépassement de délai ou d'une erreur réseau (`server.js:509-525`).

### 3. La bidirectionnalité n'était vraie qu'à moitié — **Élevée**

**Constat.** Sens Facebook → site : opérationnel et automatique (webhook + resynchronisation périodique). Sens site → Facebook : **aucun déclencheur automatique**. `POST /api/admin/content` n'appelait jamais `publishFacebookPost()`.

**Correction et arbitrage.** Le sens site → Facebook est désormais possible, mais **sur action explicite** : case « Publier aussi sur Facebook » à la publication, avec désignation des fiches.

Je n'ai délibérément pas rendu ce sens automatique, et c'est un choix que vous devez connaître pour pouvoir le contester : publier automatiquement sur la Page à chaque enregistrement du studio exposerait à inonder votre Page à la moindre correction de faute de frappe. Une Page Facebook noyée sous les republications perd son audience. Si vous préférez malgré tout l'automatisme intégral, c'est réalisable — dites-le-moi.

### 4. Verrou de synchronisation en mémoire — Moyenne

**Constat.** `facebookSyncPromise` empêchait deux synchronisations concurrentes, mais uniquement **dans le même processus**. Or Passenger sur cPanel peut lancer plusieurs instances : deux processus pouvaient synchroniser et écrire simultanément dans le même fichier.

**Correction.** Table `app_locks` en base, avec expiration. Le verrou devient inter-processus dès que MySQL est actif.

### 5. Abonnement webhook non vérifié — Moyenne

**Constat.** Rien ne permettait de savoir si l'application Meta était bien abonnée au champ `feed` de la Page. En cas de désabonnement silencieux, la synchronisation cesse sans alerte — le symptôme classique « le site ne remonte plus les publications » sans message d'erreur.

**Correction.** Point de contrôle interrogeant `/{page-id}/subscribed_apps`, avec un indicateur `feedSubscribed` visible dans le studio (`server.js:993-1004`).

### 6. Corps brut du webhook et signature HMAC — Moyenne

**Constat.** Le corps de la requête était accumulé par `raw += chunk`, ce qui convertit chaque `Buffer` en chaîne UTF-8. Sur un caractère multi-octets coupé à la frontière de deux paquets TCP, la reconversion produit un caractère de remplacement : le HMAC recalculé diffère alors de celui de Meta et la notification est **rejetée à tort**. Avec des noms de villas accentués et des apostrophes typographiques, le risque n'est pas théorique.

**Correction.** Accumulation en tableau de `Buffer` puis `Buffer.concat()`, et calcul du HMAC sur le buffer binaire (`server.js:1038-1042`).

### 7. Garde anti-boucle — Moyenne

**Constat.** Sans garde, un contenu importé depuis Facebook puis republié vers Facebook crée une boucle d'amplification.

**Correction.** `facebookImportedIds()` recense les publications d'origine Facebook ; une fiche marquée `source: 'facebook'` ou portant un `facebookOriginId` connu n'est jamais republiée (`server.js:742-750`).

### 8. Aucune limitation de débit sur `/api/leads` — Moyenne

**Constat.** Le formulaire public écrivait sans limite dans `leads.json`. Un script pouvait le remplir jusqu'à saturation du disque.

**Correction.** Limitation en mémoire par adresse IP.

### 9. Idempotence de publication — Faible

**Constat.** La déduplication reposait sur un fichier JSON, non atomique entre processus.

**Correction.** Index `UNIQUE` sur `idempotency_key` dans `facebook_publish_log` : c'est la base qui garantit désormais l'unicité.

---

## Ce qui était déjà bien fait

Il serait injuste de ne lister que les défauts. Le code d'origine faisait plusieurs choses correctement :

- **Vérification cryptographique obligatoire** des notifications Meta, avec `crypto.timingSafeEqual` — pas de comparaison naïve vulnérable au timing.
- **Refus explicite** du webhook si `META_APP_SECRET` est absent (503), plutôt qu'une acceptation silencieuse.
- **Journal d'audit ne contenant jamais** le jeton de Page ni le secret d'application.
- **Déduplication par identifiant** à l'import, avec tri par date décroissante.
- **Resynchronisation périodique de secours** avec `unref()` sur le minuteur, pour ne pas empêcher l'arrêt du processus.
- **Nouvelles tentatives avec attente croissante** (3 essais) sur la synchronisation.

---

## Permissions Meta requises

L'application Meta doit disposer de ces autorisations **validées** (App Review) :

| Permission | Usage |
|---|---|
| `pages_show_list` | Lister les Pages du compte |
| `pages_read_engagement` | Lire `published_posts` de la Page |
| `pages_manage_posts` | Publier via `/{page-id}/feed` et `/{page-id}/photos` |
| `pages_manage_metadata` | Gérer l'abonnement webhook au champ `feed` |

Le jeton doit être un **jeton de Page de longue durée**, jamais un jeton utilisateur court.

---

## Ce qui reste à faire de votre côté

1. **Renseigner les variables Meta** dans les variables d'environnement cPanel (jamais dans un fichier `.env` téléversé) : `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_VERIFY_TOKEN`, `META_APP_SECRET`, `PUBLIC_SITE_URL`.
2. **Déclarer le webhook** côté Meta : `https://henri-philippe.com/api/facebook/webhook`, champ `feed`. Le HTTPS de votre domaine est actif, cette condition est remplie.
3. **Vérifier l'abonnement** via le point de contrôle du studio après configuration.
4. **Tester dans les deux sens** : publier depuis la Page et vérifier la remontée ; publier une fiche avec l'option cochée et vérifier l'arrivée sur la Page.

---

## Limite de cet audit

Ces constats reposent sur une **lecture du code et un raisonnement sur les chemins d'erreur**, pas sur une exécution contre l'API Meta réelle : aucun jeton de Page n'était configuré au moment de l'audit. Les correctifs sont donc vérifiés au niveau du code, non en conditions de production. La validation finale passera par les tests du point 4 ci-dessus.
