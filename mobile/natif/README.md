# Détente & Loisirs — application native (Android / iOS)

Application React Native (Expo SDK 57) de henri-philippe.com. Elle lit la même
API publique que le site et envoie les demandes au même endpoint : tout ce qui
est publié dans le studio apparaît dans l'app.

| Donnée | Source |
| --- | --- |
| Résidences, terrains, activités, publications Facebook, avis, FAQ, référentiels | `GET https://henri-philippe.com/api/content` |
| Images optimisées (WebP) | `GET /data/image-manifest.json` |
| Demandes de devis | `POST /api/leads` (même contenu que le simulateur du site, + jeton de notification si le client veut être prévenu) |
| Inscription aux notifications | `POST` / `DELETE /api/app/appareils` (voir `db/notifications-app.js` du site) |
| Statut des demandes (Mes demandes) | `POST /api/app/suivi` `{ ids }` → `{ statuts: { id: statut } }` (30 identifiants max, rien d'autre n'est renvoyé) |

Les règles (recherche multicritère, terrain vendu masqué, calcul du devis,
messages WhatsApp, traductions des fiches) sont des copies conformes de
`js/app.js`, `js/premium.js` et `js/i18n.js` : voir `src/donnees/regles.ts`.
**Toute évolution de ces règles sur le site doit être reportée ici.**

## Fonctions

- Écran de démarrage animé (logo centré) qui s'efface sur l'accueil dès que les annonces enregistrées sont lues (1,8 s minimum).
- Onglets natifs : Accueil, Explorer, Devis, Favoris, Contact ; barre supérieure avec bouton retour et icône Profil.
- Accueil : formulaire de recherche du site (localisation, emplacement, type, budget, voyageurs) + dates d'arrivée et de départ (reprises dans le devis ; elles ne filtrent pas, le site n'a pas de disponibilités).
- Explorer : recherche texte, rubriques, filtres en menus déroulants propres à chaque rubrique (résidences/actus : critères de logement ; terrains : localisation, statut foncier ; activités : aucun, comme sur le site), tri, carte des terrains géolocalisés (fonds Plan / Satellite / Relief sans clé d'API, un calque et une couleur par statut foncier : titre foncier bleu, ACD or, autres gris foncé ; « Voir sur la carte » d'une fiche l'ouvre centrée sur le terrain).
- Photos plein écran : pincer ou double-tap pour agrandir.
- Fiches détaillées, galerie plein écran, partage vers la fiche du site (`residences.html#id`, `terrains.html#id`, `loisirs.html#id`).
- Devis : séjour en 4 étapes (résidence → dates & voyageurs → activités → coordonnées), activités uniquement en 3 (activités → dates & voyageurs → coordonnées) ; « Mes demandes » (Profil) affiche chaque demande avec son statut du studio (Envoyée → Prise en charge → Confirmée), actualisé à l'ouverture et en tirant l'écran.
- Profil : tuile « Mes coordonnées » repliable (enregistrées sur le téléphone, jamais sur le site), langue et apparence en menus déroulants, interrupteur des notifications.
- Français / anglais / espagnol (langue du téléphone par défaut), mode clair (fond blanc) ou sombre (bleu nuit).
- Notifications : nouvelles annonces, suivi d'une demande (« Contacté », « Confirmé » dans le studio).
  Sans compte Expo/Firebase, elles fonctionnent en **veille locale** : une tâche de fond
  (`expo-background-task`, au mieux toutes les heures, selon le système) interroge
  `/api/content` et `/api/app/suivi` et affiche une notification locale.
- Hors ligne : dernières annonces enregistrées sur le téléphone.

## Structure

```
src/app/_layout.tsx             pile de navigation native (fiches, feuilles, profil, carte…)
src/app/(onglets)/              onglets : index (accueil), explorer, devis, favoris, contact
src/app/annonce/[type]/[id].tsx vue détaillée d'une annonce
src/app/profil.tsx              profil : coordonnées, réglages, activité, données
src/app/demandes.tsx            Mes demandes : statut de chaque devis envoyé
src/composants/SplashAnime.tsx  écran de démarrage animé (relaie l'écran natif blanc)
src/donnees/veille.ts           veille de fond : nouvelles annonces et statuts des demandes
src/app/filtres.tsx, tri.tsx    feuilles natives
src/app/carte.tsx               carte des terrains (Leaflet + OpenStreetMap, sans clé)
src/donnees/                    configuration, i18n, thèmes, règles métier, état partagé, notifications
src/composants/                 lignes de liste, galerie, champs, carte, boutons
scripts/relais-dev.js           relais de mise au point (navigateur)
scripts/construire-android.cmd  construction de l'APK de test
scripts/icone-notification.js   icône Android des notifications (silhouette du logo)
```

Le dossier `mobile/` n'est jamais servi par le site (`FORBIDDEN_PREFIXES` de `server.js`).

## Tester

- **Sur un téléphone Android** : installer `Detente-Loisirs-natif.apk` (généré par `npm run apk`).
- **Dans le navigateur (mise au point)** : `npm run relais` puis `npm run web`.
  Le relais lit l'API en ligne et **simule** l'envoi des demandes (rien n'arrive dans le studio).
  Les feuilles natives s'y affichent comme des pages ; pas de notifications dans le navigateur.
- **Vérification TypeScript** : `npm run verifier`.

## Activer les notifications (à faire une fois, par le propriétaire)

Le code est prêt côté app et côté site ; il manque les comptes, qui ne peuvent
être créés que par le propriétaire. Tant que ce n'est pas fait, l'app utilise la
veille locale (ci-dessus) : les notifications arrivent avec du retard et pas du
tout si le système suspend l'app. Les notifications instantanées demandent :

1. Créer un compte gratuit sur https://expo.dev.
2. Dans `mobile/natif` : `npx eas-cli login` puis `npx eas-cli init` (ajoute `extra.eas.projectId` dans `app.json`).
3. **Android** : créer un projet Firebase (https://console.firebase.google.com), y ajouter
   l'application Android `com.henriphilippe.detenteloisirs`, télécharger `google-services.json`
   dans `mobile/natif/`, puis ajouter dans `app.json` → `android` :
   `"googleServicesFile": "./google-services.json"`. Envoyer la clé de compte de service
   Firebase (FCM V1) à Expo : `npx eas-cli credentials` → Android → Push Notifications.
4. **iOS** (sur le Mac) : `npx eas-cli credentials` → iOS → Push Notifications (Expo crée la clé
   APNs avec le compte Apple Developer).
5. Reconstruire les applications.

Le serveur n'a rien à configurer. Si « Enhanced push security » est activé sur
le projet Expo, ajouter la variable `EXPO_ACCESS_TOKEN` dans « Setup Node.js App ».
Les téléphones inscrits sont listés dans `data/app-appareils.json` du site.

## Construire

### Android (ce PC)

```
npm run apk
```

Le script `scripts/construire-android.cmd` utilise le JDK 21 de Gradle et le SDK
`%LOCALAPPDATA%\Android\Sdk` (NDK 27 et CMake installés automatiquement au
premier build, ~27 min ; ensuite quelques minutes). Il ne produit que
l'architecture arm64 (téléphones). Ne pas passer par un lecteur `subst` : Node
et Gradle y mélangent les chemins et la génération de code échoue. L'APK est
signé avec la clé de débogage : il sert aux tests. Pour Google Play, produire un
AAB signé avec la clé de l'application (`./gradlew bundleRelease`) ou utiliser
`npx eas-cli build -p android`.

Les dossiers `android/` et `ios/` sont **générés** (`npx expo prebuild`) : les
réglages durables se font dans `app.json`, puis on régénère.

**Android Studio** : ouvrir le dossier `android/`. Le plugin `plugins/jdk-gradle-21.js`
écrit `android/gradle/gradle-daemon-jvm.properties` (`toolchainVersion=21`) : Gradle
tourne sur Java 21 même si Android Studio embarque Java 25. Sous Java 24+, l'outil
prefab affiche « WARNING: A restricted method in java.lang.System has been called »
et la synchronisation échoue.

**Permissions Android** (déclarées dans `app.json`, écrites dans `AndroidManifest.xml`) :

| Permission | Pourquoi |
| --- | --- |
| `INTERNET` | annonces, photos, carte, envoi des demandes |
| `ACCESS_NETWORK_STATE` | savoir si le téléphone est hors ligne |
| `POST_NOTIFICATIONS` | notifications (Android 13+, demandée à l'activation dans le Profil) |
| `RECEIVE_BOOT_COMPLETED` | relancer la veille des notifications après un redémarrage |
| `WAKE_LOCK` | laisser la veille de fond se terminer |
| `VIBRATE` | retours haptiques et notifications |

Retirées (`blockedPermissions`) : `READ/WRITE_EXTERNAL_STORAGE` (aucun fichier lu ni
écrit) et `SYSTEM_ALERT_WINDOW` (affichage par-dessus les autres apps ; seule la
variante debug le garde, pour le menu de développement). Aucune localisation, caméra
ni contact. Les bibliothèques ajoutent aussi `FOREGROUND_SERVICE` (tâches de fond),
`c2dm.RECEIVE` (notifications Firebase) et les pastilles d'icône.
`plugins/liens-android.js` déclare Téléphone, e-mail et WhatsApp (`<queries>`, Android 11+).

**Firebase** : `google-services.json` (à la racine de `mobile/natif`, jamais versionné)
est déclaré dans `app.json` → `android.googleServicesFile`.

**APK de débogage** : `plugins/bundle-debug-android.js` intègre le code de l'app
aussi dans la variante debug (`debuggableVariants = []`). Sans cela, un APK construit
par Android Studio et lancé sans Metro restait bloqué sur l'écran de démarrage. Si
Metro tourne (`npx expo start`), l'app l'utilise pour le rechargement à chaud.

**Architecture** : `plugins/architecture-android.js` limite la compilation native à
`arm64-v8a` (téléphones récents), trois à quatre fois plus rapide que les quatre
architectures par défaut. Ponctuellement : `-PreactNativeArchitectures=armeabi-v7a,arm64-v8a`.

**Écran de démarrage Android** : `assets/images/logo-splash.png` est le logo **détouré**
(`logo.png` a un fond blanc opaque). Android 12+ inscrit l'icône dans un cercle de
192 dp : le logo y fait 164 dp (`android.imageWidth`) pour ne pas être coupé.
`plugins/ecran-demarrage-android.js` interdit le mode sombre forcé de certains
téléphones, qui noircissait l'écran. Ce plugin doit rester déclaré avant `expo-splash-screen`.

### iOS (en copiant le dossier sur le Mac)

1. Copier `mobile/natif` **sans** `node_modules/`, `android/`, `ios/` et `*.apk`
   (les modules installés sous Windows ne fonctionnent pas sur macOS).
2. Sur le Mac : Node.js 20 ou plus récent, Xcode à jour (et CocoaPods si Xcode le demande).
3. Dans le dossier copié :

```
npm install
npx expo prebuild --platform ios
open ios/*.xcworkspace
```

4. Dans Xcode : cible « DétenteLoisirs » → Signing & Capabilities → choisir l'équipe
   Apple Developer ; menu Product → Archive, puis « Distribute App » vers App Store Connect.
   Pour essayer sur un iPhone branché : `npx expo run:ios --device --configuration Release`.

Identifiant : `com.henriphilippe.detenteloisirs` (le même que l'ancien projet
Capacitor, pour que l'app le remplace sur les stores). Version 2.1.0, build 3.
