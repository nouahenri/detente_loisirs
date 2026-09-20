# Faire marcher les notifications push

État au 20/09/2026 : **tout est prêt côté site et studio**, mais l'application
ne demande jamais de jeton de notification, parce qu'elle n'a pas encore
d'identifiant de projet Expo. C'est la seule chose qui manque.

Dans `src/donnees/notifications.ts`, l'enregistrement est conditionné à
`extra.eas.projectId` (fichier `app.json`) : sans cet identifiant, l'app garde
ses rappels **locaux** et n'envoie rien au site — d'où les « 0 appareil
joignable » dans Studio → Communication.

## Les cinq étapes, dans l'ordre

1. **Compte Expo** (gratuit) sur https://expo.dev, puis, dans `mobile/natif` :

   ```bash
   npx eas login
   npx eas init
   ```

   `eas init` crée le projet et écrit `extra.eas.projectId` dans `app.json`.
   C'est cette valeur qui débloque tout le reste.

2. **Clé d'envoi Android (FCM V1)**. Dans la console Firebase du projet qui a
   produit `google-services.json` : Paramètres → Comptes de service → générer
   une clé privée JSON, puis :

   ```bash
   npx eas credentials
   ```

   → Android → *Push Notifications: Manage your FCM V1 service account key* →
   téléverser le fichier JSON.
   Pour iOS, `eas credentials` crée la clé APNs tout seul (compte Apple
   Developer requis).

3. **Construire l'application** — les push ne fonctionnent pas dans Expo Go :

   ```bash
   npx eas build --platform android --profile preview
   ```

   Installer l'APK produit sur les téléphones (ou passer par le Play Store).

4. **Sur chaque téléphone** : ouvrir l'app, accepter les notifications, et
   renseigner son numéro dans le profil. Le jeton part alors vers le site
   (`POST /api/app/appareils`) et le compte apparaît dans
   Studio → Communication, avec son audience (demandeur, employé, propriétaire).

5. **Envoyer** depuis Studio → Communication → Notifications de l'app.
   L'encadré bleu indique combien d'appareils sont réellement joignables.

## Ce qui est déjà en place

- `POST /api/app/appareils` enregistre le jeton, `DELETE` le retire ;
- le numéro du profil relie l'appareil à un demandeur, un employé (fiche de
  paie en comptabilité) ou un propriétaire (fiche d'annonce) ;
- l'envoi passe par `https://exp.host/--/api/v2/push/send`, par lots de 100,
  et les jetons périmés sont oubliés automatiquement ;
- au clic, l'app ouvre l'écran choisi dans le studio (boîte de réception,
  Explorer, Devis ou Profil) ;
- `EXPO_ACCESS_TOKEN` (variable d'environnement du serveur) est **facultatif** :
  utile seulement pour protéger l'envoi côté Expo.

## Diagnostic rapide

| Symptôme | Cause probable |
|---|---|
| « 0 appareil joignable » dans le studio | étape 1 non faite (pas de `projectId`) |
| Jeton obtenu mais rien ne s'affiche sur Android | étape 2 non faite (clé FCM absente) |
| Rien dans Expo Go | normal : il faut une version construite (étape 3) |
| L'appareil reçoit mais n'est rattaché à personne | numéro absent du profil (étape 4) |
