/**
 * Compile le code natif pour arm64-v8a uniquement (téléphones Android récents).
 *
 * Par défaut, React Native compile quatre architectures (armeabi-v7a, arm64-v8a,
 * x86, x86_64) : un premier build prend alors trois à quatre fois plus de
 * temps. Les émulateurs x86 et les très vieux téléphones 32 bits ne sont plus
 * visés. Pour un besoin ponctuel :
 *   ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
 *
 * Le réglage est réécrit dans android/gradle.properties à chaque `npx expo prebuild`.
 */
const { withGradleProperties } = require('expo/config-plugins');

const ARCHITECTURES = 'arm64-v8a';

module.exports = function avecArchitectureArm64(config) {
  return withGradleProperties(config, cfg => {
    const proprietes = cfg.modResults.filter(p => !(p.type === 'property' && p.key === 'reactNativeArchitectures'));
    proprietes.push({ type: 'property', key: 'reactNativeArchitectures', value: ARCHITECTURES });
    cfg.modResults = proprietes;
    return cfg;
  });
};
