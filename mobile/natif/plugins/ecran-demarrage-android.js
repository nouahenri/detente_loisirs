/**
 * Écran de démarrage Android toujours blanc.
 *
 * Certains téléphones (mode sombre « forcé » pour toutes les applications :
 * Xiaomi, Oppo, Realme, Huawei…) assombrissent les écrans blancs, dont l'écran
 * de démarrage : il apparaissait noir. L'application gère elle-même son mode
 * sombre, on interdit donc cet assombrissement automatique.
 *
 * À déclarer AVANT expo-splash-screen dans app.json : les modifications
 * s'exécutent en ordre inverse, et celle d'expo-splash-screen réécrit le thème
 * Theme.App.SplashScreen.
 */
const { withAndroidStyles } = require('expo/config-plugins');

const THEMES = ['AppTheme', 'Theme.App.SplashScreen'];

module.exports = function avecEcranDemarrageBlanc(config) {
  return withAndroidStyles(config, cfg => {
    const styles = cfg.modResults.resources.style || [];
    styles.filter(style => THEMES.includes(style.$.name)).forEach(style => {
      style.item = (style.item || []).filter(item => item.$.name !== 'android:forceDarkAllowed');
      style.item.push({ _: 'false', $: { name: 'android:forceDarkAllowed', 'tools:targetApi': '29' } });
    });
    return cfg;
  });
};
