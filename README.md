# 🌴 Détente & Loisirs à Assinie - Site Web Multipages

Site web vitrine et de réservation pour la location de villas d'exception et résidences de vacances à Assinie (Côte d'Ivoire), directement inspiré de la page Facebook officielle **[Détente et loisirs à Assinie](https://web.facebook.com/profile.php?id=100075922063365)**.

---

## 🌟 Architecture Multipages (6 Pages Autonomes)

Le site est structuré en **6 pages dédiées et interconnectées**, avec scission entre FAQ et Contact :

1. **[Accueil (index.html)](file:///C:/Users/NOUAMA/Desktop/Siteweb_Detente_Loisirs/index.html)** :
   - Grand Hero d'évasion tropicale avec photo de villa de luxe et recherche rapide
   - Sélection des villas coups de cœur / vedettes
   - Teaser des activités & loisirs exclusifs d'Assinie
   - Section Expérience, bandeau de statistiques et témoignages
   - Bandeau Newsletter ocre doré et footer officiel

2. **[Nos Résidences & Villas (residences.html)](file:///C:/Users/NOUAMA/Desktop/Siteweb_Detente_Loisirs/residences.html)** :
   - Catalogue complet des 6 propriétés avec filtres interactifs (*Bord de Lagune*, *Bord d'Océan*, *Piscine Privée*)
   - Fiches détaillées avec modal pop-up et galerie photos commutable
   - Équipements complets (climatisation, groupe électrogène, ponton d'amarrage, Smart TV, etc.)

3. **[Activités & Loisirs (loisirs.html)](file:///C:/Users/NOUAMA/Desktop/Siteweb_Detente_Loisirs/loisirs.html)** :
   - **Nouvelle présentation en tuiles séparées** : textes retirés des photos et placés dans une tuile inférieure distincte
   - **Boutons d'action dédiés** : *Réserver via WhatsApp* (message pré-rempli) et *Calculer un Devis*
   - Guide des 3 incontournables d'Assinie (La Passe, Îles Éhotilés, Zoo Dipi)

4. **[Calculer un Devis (devis.html)](file:///C:/Users/NOUAMA/Desktop/Siteweb_Detente_Loisirs/devis.html)** :
   - Simulateur de devis interactif en temps réel (villa, dates, invités, options chef, bateau, jet ski)
   - Calcul automatique en FCFA et Euros avec réservation instantanée sur WhatsApp au **+225 07 67 69 63 18**

5. **[Foire Aux Questions (faq.html)](file:///C:/Users/NOUAMA/Desktop/Siteweb_Detente_Loisirs/faq.html)** :
   - Page dédiée avec accordéon dynamique par thématiques (Réservations, Services, Accès, Événements)
   - Assistance WhatsApp directe

6. **[Contact & Localisation (contact.html)](file:///C:/Users/NOUAMA/Desktop/Siteweb_Detente_Loisirs/contact.html)** :
   - Coordonnées complètes, téléphone, WhatsApp direct et lien Facebook officiel
   - Carte visuelle d'accès et repères GPS depuis Abidjan (1h15 de route)

## 🎨 Nouveau Design & Charte Graphique (Inspiré "Elevate Estates" + Couleurs du Logo)

Le design de l'ensemble du site a été entièrement modernisé d'après la maquette immobilière de prestige et les couleurs officielles de **Henri & Philippe** :

- **Palette officielle harmonisée** :
  - **Bleu Nuit** (`#151837`, avec variantes `#0e1026` et `#232859`) pour les boutons principaux, les bandeaux et les accents de prestige.
  - **Or officiel** (`#e8b904`, survol `#cca203`) pour les actions, badges, traits éditoriaux et mises en valeur.
  - **Blanc Pur & Grège Clair** (`#ffffff`, `#f8f7f4`) pour les cartes de propriétés, la barre de recherche flottante et les arrière-plans épurés.
- **Typographie de Luxe** :
  - Titres et accroches en **Playfair Display** (sérif haute joaillerie / immobilier d'exception).
  - Textes courants, badges et menus en **Plus Jakarta Sans** (sans-sérif moderne et lisible).
- **Composants Clés Implémentés** :
  - **Header blanc minimaliste sticky** avec logo officiel et bouton bleu nuit *Réserver*.
  - **Grand Hero crépusculaire** avec accroche statutaire, mot-clé doré et 2 boutons d'action.
  - **Barre de recherche multi-critères flottante** (Zone, Type, Budget, Voyageurs) avec bouton bleu nuit et filtre avancé.
  - **Barre des 4 garanties** en bleu nuit avec icônes dorées (Propriétés vérifiées, Conciergerie dédiée, Meilleur tarif garanti, Support 7j/7).
  - **Grille de propriétés à 4 colonnes** avec badge *Disponible* ou *Coup de Cœur*, bouton favori cœur interactif, équipements détaillés et tarif nuitée.
  - **Bandeau de statistiques bleu nuit** (15,000+ nuitées, 9,500+ clients, 100% piscines/lagune, 10+ années).
  - **Section Expérience & Savoir-faire 2 colonnes** avec grande photo, bouton de visite virtuelle et badge *10+ Années d'Excellence*.
  - **Barre rapide des types de biens** (Villas lagune, océan, piscines, suites, bateaux, loisirs nautiques).
  - **Section Témoignages en split-layout** (bloc bleu nuit avec guillemet doré géant + salon somptueux).
  - **Bandeau Newsletter or officiel** avec icône enveloppe blanche et bouton bleu nuit.
  - **Footer structuré bleu nuit** à 4 colonnes avec coordonnées complètes et WhatsApp direct.

---

## 🖼️ Nouveau Logo

- Le logo officiel transmis est stocké dans : `assets/images/logo.png`.
- Il est affiché avec élégance dans le header et le footer de chacune des 5 pages, tout en préservant le nom de marque **"Détente & Loisirs à Assinie"**.

---

## 🚀 Comment Lancer et Tester le Site

### Option 1 : Serveur local actif (Recommandé)
Le serveur local Node.js est déjà lancé et actif sur votre machine à l'adresse :
👉 **[http://localhost:3456](http://localhost:3456)**

Pour le relancer manuellement à tout moment :
```bash
node server.js
```

## Studio d’administration

Le back-office est disponible sur `http://localhost:3456/admin.html`.

- Clé de démonstration locale : `assinie-demo`
- En production, définir obligatoirement `ADMIN_SECRET` avec une clé forte.
- Les changements sont enregistrés dans `data/site-content.json` après avoir cliqué sur **Publier les changements**.
- Les inscriptions et demandes reçues sont centralisées dans `data/leads.json`.

Le studio permet de gérer les villas, activités, prix, capacités, statuts, visibilité, mises en avant, images principales, galeries (jusqu’à 12 médias), textes, demandes clients et publications Facebook.

## Passerelle Facebook bidirectionnelle

Le serveur inclut :

- la publication texte/lien via `POST /{page-id}/feed` et texte/image via `POST /{page-id}/photos` ;
- la récupération dédupliquée des publications de la Page vers le site, avec resynchronisation périodique de secours ;
- un webhook Meta à déclarer sur `https://votre-domaine.com/api/facebook/webhook` et à abonner au champ `feed` ;
- la vérification cryptographique obligatoire des notifications avec `META_APP_SECRET` ;
- un état de connexion, les dernières erreurs et les dates de synchronisation visibles dans le studio ;
- un journal d’audit ne contenant jamais le jeton ni le secret Meta.

Copier les noms de variables de `.env.example` dans l’environnement de votre hébergeur. Ne jamais placer le jeton de Page dans un fichier JavaScript public. L’application Meta doit disposer au minimum des autorisations validées nécessaires à la lecture et à la publication de Page, notamment `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` et `pages_manage_metadata` pour l’abonnement webhook.

### Option 2 : Ouverture directe des fichiers HTML
Double-cliquez directement sur l'un des fichiers HTML dans votre dossier Bureau :
- `index.html` (Accueil)
- `residences.html` (Catalogue & Filtres)
- `loisirs.html` (Activités avec tuiles séparées et boutons d'action)
- `devis.html` (Simulateur de Devis interactif)
- `faq.html` (Foire Aux Questions dédiée)
- `contact.html` (Contact & Localisation dédiée)

---

## 📸 Galerie d'Images Hyper-Réalistes Locales (`assets/images/`)

- `residence-villa-luxe.jpg` : Villa contemporaine avec piscine et ponton privatif sur la lagune Aby
- `residence-ocean-assinie.jpg` : Villa balnéaire de prestige pieds dans l'eau côté océan Atlantique
- `plage-assinie-passe.jpg` : Banc de sable et pirogue à La Passe mythique d'Assinie
- `restaurant-gastronomie-lagune.jpg` : Déjeuner gastronomique avec capitaine braisé, alloco et attiéké
- `bateau-excursion-lagune.jpg` : Navigation en speedboat privé sur la lagune Aby
- `jetski-lagune-assinie.jpg` : Session sportive en Jet Ski sur la lagune
- `quad-plage-assinie.jpg` : Randonnée en quads sur le sable mouillé en bord de mer à Assinie
- `crocodiles-parc-dipi.jpg` : Grands crocodiles du Nil du sanctuaire zoologique Dipi
- `logo.png` : Logo officiel Henri & Philippe
