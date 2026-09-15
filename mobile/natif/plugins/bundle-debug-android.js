/**
 * Intègre le code JavaScript de l'app dans l'APK de débogage.
 *
 * Par défaut, React Native ne met PAS le code dans la variante « debug » : l'app
 * le télécharge au lancement depuis Metro (`npx expo start`) sur le PC. Un APK
 * construit avec Android Studio (Run, Build APK) et installé sans Metro restait
 * donc bloqué sur l'écran de démarrage natif : le code ne démarrait jamais et
 * l'écran attendait la première vue de l'app.
 *
 * Avec `debuggableVariants = []`, le code est intégré à toutes les variantes.
 * React Native utilise toujours Metro s'il tourne (rechargement à chaud), et
 * sinon le code intégré. Réécrit dans android/app/build.gradle à chaque prebuild.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const LIGNE = '    debuggableVariants = [] // plugins/bundle-debug-android.js : code intégré aussi en debug';

module.exports = function avecCodeIntegreEnDebug(config) {
  return withAppBuildGradle(config, cfg => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('plugins/bundle-debug-android.js')) {
      gradle = gradle.replace(/^react \{\s*$/m, bloc => `${bloc}\n${LIGNE}`);
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
