# Contrat d'équipe — Refonte Détente & Loisirs à Assinie
Document de référence partagé. **Lire en entier avant toute modification.**

## Contexte
Site vitrine + réservation, 6 pages statiques + back-office (`admin.html`) + serveur Node natif (`server.js`, zéro dépendance actuellement).
Hébergement cible : **cPanel avec "Setup Node.js App" disponible** (Passenger) + **MySQL cPanel**.
Contenu piloté par `data/site-content.json`, servi par `GET /api/content`.

## Règles absolues (non négociables)
1. **Zéro régression.** Toute page, tout bouton, tout lien qui marche aujourd'hui doit marcher après.
2. **Zéro cassure d'URL.** Les noms de fichiers HTML existants ne changent pas.
3. **Pas de framework, pas de build obligatoire.** Le site doit rester ouvrable en statique.
4. **Pas de "slop IA"** : pas d'emoji décoratifs, pas de dégradés gratuits, pas de glassmorphism empilé,
   pas de texte marketing générique. Sobriété, contraste, hiérarchie. Le site vend du haut de gamme réel.
5. **Français de Côte d'Ivoire.** Devise FCFA (XOF) en principal, EUR en secondaire. Téléphone +225 07 67 69 63 18.
6. **Ne modifiez QUE les fichiers de votre périmètre** (voir tableau). Si vous avez besoin d'un changement
   hors périmètre, écrivez-le dans `docs/DEMANDES-CROISEES.md` (append, ne jamais écraser).

## Périmètres de fichiers (propriété exclusive en écriture)

| Agent | Fichiers en écriture |
|---|---|
| **BACKEND/DB** | `server.js`, `db/**`, `scripts/migrate-*.js`, `package.json`, `.env.example`, `.htaccess`, `app.js` (entrée Passenger), `admin.html`, `js/admin.js`, `css/admin.css`, `docs/DEPLOIEMENT-CPANEL.md`, `docs/AUDIT-WEBSERVICE-FACEBOOK.md` |
| **DESIGNER** | `css/refonte.css` (nouveau, chargé en dernier), `scripts/optimize-images.js`, `assets/images/opt/**`, `data/image-manifest.json`, `docs/DESIGN-SYSTEM.md` |
| **FRONTEND** | `index.html`, `residences.html`, `terrains.html` (nouveau), `loisirs.html`, `devis.html`, `faq.html`, `contact.html`, `js/app.js`, `js/premium.js`, `js/data.js`, `css/terrains.css` (nouveau) |
| **TESTEUR/PM** | `docs/RAPPORT-RECETTE.md` uniquement (lecture seule ailleurs) |

`css/style.css`, `css/premium.css`, `css/design-polish.css` : **gelés**. Personne n'y touche.
Toutes les corrections CSS globales passent par `css/refonte.css` (designer), chargé après les trois autres.

## Ordre de chargement CSS (à respecter dans chaque page publique)
```html
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/premium.css">
<link rel="stylesheet" href="css/design-polish.css">
<link rel="stylesheet" href="css/terrains.css">   <!-- pages terrains uniquement -->
<link rel="stylesheet" href="css/refonte.css">    <!-- TOUJOURS EN DERNIER -->
```

## Bugs mobile confirmés (mesurés à 375 px sur Chrome)
- `document.body.scrollWidth = 430` pour `clientWidth = 375` → **débordement horizontal de 55 px** sur l'accueil.
  Coupables mesurés : `.search-field` (droite = 430 px), `.section-link-all` (droite = 428 px).
- Aucun point de rupture sous 768 px dans `style.css` → tout casse entre 320 et 480 px
  (`.search-form-grid` reste sur 2 colonnes, `.categories-quick-bar` reste sur 2 colonnes).
- `.hero-media-layer` déborde de -5 px à 380 px.
- Titre hero : `clamp(2.65rem, 13vw, 4.15rem)` + `max-width: 9ch` → mot « vie » orphelin sur sa ligne, doré
  sur fond clair = contraste insuffisant (échec WCAG AA).
- Superposition en bas d'écran : badge favoris « Mon séjour » (gauche) + bulle WhatsApp (droite) + points du
  slider hero → trois éléments flottants qui se marchent dessus.
- `.trip-drawer` fermé reste dans le flux (translaté hors écran) au lieu d'être `visibility:hidden`.

## Nouveau service : VENTE DE TERRAIN
Nouvelle rubrique de premier niveau, présente dans le menu, l'admin et la base.

### Position dans la navigation (toutes les pages)
`Accueil · Nos Résidences · Terrains · Activités & Loisirs · Calculer un Devis · FAQ · Contact`

### Schéma d'un terrain (identique en JSON, en MySQL et dans l'admin)
| Champ | Type | Notes |
|---|---|---|
| `id` | slug | généré depuis `title` si absent |
| `reference` | texte 40 | ex. `TER-ASS-001`, affiché sur la carte |
| `title` | texte 160 | requis |
| `location` | texte 240 | ex. « Assinie-Mafia, Km 12 » |
| `district` | texte 120 | quartier / lotissement |
| `areaSqm` | entier > 0 | superficie en m² |
| `priceTotal` | entier FCFA | prix de vente total |
| `pricePerSqm` | entier FCFA | **calculé** = round(priceTotal / areaSqm), jamais saisi |
| `priceEuro` | entier | **calculé** = round(priceTotal / 655.957) |
| `landStatus` | énum | `titre-foncier` \| `acd` \| `lettre-attribution` \| `certificat-propriete` |
| `landStatusLabel` | texte 80 | libellé affiché, dérivé de `landStatus` |
| `utilities` | tableau | sous-ensemble de `eau`, `electricite`, `voie-bitumee`, `assainissement`, `cloture`, `borne` |
| `status` | énum | `disponible` \| `reserve` \| `vendu` |
| `description` | texte 8000 | |
| `images` | tableau ≤ 12 | chemins relatifs ou URLs |
| `highlights` | tableau ≤ 20 | atouts courts |
| `visible` | booléen | défaut `true` |
| `featured` | booléen | défaut `false` |
| `badge` | texte 80 | ex. « Nouveau », « Dernier lot » |
| `latitude`, `longitude` | décimal, nullable | repère GPS |

### Règles métier
- `pricePerSqm` et `priceEuro` sont **toujours recalculés côté serveur**, jamais acceptés du client.
- Un terrain `status = 'vendu'` reste affiché mais grisé, avec le badge « Vendu » ; il n'est plus contactable.
- Un terrain `visible = false` n'est jamais renvoyé par `GET /api/content` (comme les villas).
- Clé JSON du tableau : `terrains` (au même niveau que `villas` et `activities`).

## Contrat d'images optimisées
Le designer produit, pour chaque image source de `assets/images/` :
- `assets/images/opt/<base>-480.webp`, `-960.webp`, `-1600.webp`
- et `data/image-manifest.json` : `{ "assets/images/x.jpg": { "webp": {"480": "...", "960": "...", "1600": "..."}, "width": N, "height": N } }`
L'original JPG/PNG **reste en place** comme repli dans `<picture>`. Aucune suppression de fichier source.

## Contrat d'API (stable, ne pas casser)
- `GET  /api/content` → `{ villas, terrains, activities, reviews, faq, settings, facebookPosts, updatedAt }`
- `POST /api/leads` → création d'une demande (public)
- `GET  /api/admin/dashboard` · `POST /api/admin/content` · `POST /api/admin/content/validate`
- `POST /api/admin/media` · `GET /api/admin/leads` · `PATCH /api/admin/leads/:id`
- `GET  /api/admin/export` · `POST|GET /api/admin/backups` · `GET /api/admin/audit`
- `GET  /api/admin/facebook/posts` · `POST /api/admin/facebook/publish` · `POST /api/admin/facebook/sync-to-site`
- `GET|POST /api/facebook/webhook`
Toute route ajoutée est autorisée ; **aucune route existante ne change de forme.**

## Vérification obligatoire avant de rendre
Le serveur tourne déjà sur http://localhost:3456 (`node server.js`).
Chaque agent vérifie son travail dans le navigateur avant de conclure. Ne jamais annoncer « fait » sans avoir regardé.
