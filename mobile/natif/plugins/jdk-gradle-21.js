/**
 * Impose Java 21 au démon Gradle (critères « Daemon JVM » de Gradle).
 *
 * Android Studio lance Gradle avec son propre JDK (JetBrains Runtime 25). Sous
 * Java 24+, l'outil prefab d'AGP écrit « WARNING: A restricted method in
 * java.lang.System has been called » et AGP prend ce message pour une erreur :
 * la synchronisation échoue. Java 21 (celui de scripts/construire-android.cmd)
 * n'émet pas cet avertissement.
 *
 * Le fichier est écrit à chaque `npx expo prebuild`, qui recrée android/.
 * Gradle trouve le JDK 21 installé (dont ~/.gradle/jdks) ; sinon Android Studio
 * propose de le télécharger.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const CONTENU = [
  // Fichier .properties : ASCII uniquement.
  '# Written by plugins/jdk-gradle-21.js: Gradle and Android Studio run on Java 21.',
  'toolchainVersion=21',
  '',
].join('\n');

module.exports = function avecJdkGradle21(config) {
  return withDangerousMod(config, ['android', async cfg => {
    const dossier = path.join(cfg.modRequest.platformProjectRoot, 'gradle');
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, 'gradle-daemon-jvm.properties'), CONTENU);
    return cfg;
  }]);
};
