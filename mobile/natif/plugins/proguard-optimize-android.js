/**
 * Choisit la variante « optimize » du fichier ProGuard par défaut.
 *
 * Le gabarit Android d'Expo écrit :
 *   proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
 * Google recommande `proguard-android-optimize.txt`, qui laisse R8 faire ses
 * optimisations ; Android Studio le signale d'ailleurs en avertissement.
 *
 * Aujourd'hui cette ligne ne sert à rien : la minification est désactivée
 * (`android.enableMinifyInReleaseBuilds` n'est pas défini, donc faux) et R8 ne
 * lit aucun fichier ProGuard. Le jour où elle sera activée — via
 * expo-build-properties, `enableMinifyInReleaseBuilds` — c'est la bonne
 * variante qui sera en place, sans avoir à y penser.
 *
 * android/ est régénéré à chaque prebuild : cette correction ne peut pas vivre
 * dans le fichier lui-même, d'où ce plugin (même principe que
 * plugins/bundle-debug-android.js).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const ORIGINE = /^([ \t]*)proguardFiles getDefaultProguardFile\("proguard-android\.txt"\), "proguard-rules\.pro"$/m;

/**
 * Remplace la ligne si le gabarit est bien celui attendu ; sinon rend le texte
 * inchangé. Exportée à part pour être vérifiable sans l'outillage d'Expo.
 */
function optimiserProguard(gradle) {
  if (gradle.includes('proguard-android-optimize.txt')) return gradle;
  return gradle.replace(ORIGINE, (_, marge) =>
    `${marge}// plugins/proguard-optimize-android.js : variante « optimize », recommandée par Google\n`
    + `${marge}proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"`);
}

module.exports = function avecProguardOptimise(config) {
  return withAppBuildGradle(config, cfg => {
    cfg.modResults.contents = optimiserProguard(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.optimiserProguard = optimiserProguard;
