/**
 * Applications que l'app ouvre depuis ses boutons : Téléphone (tel:),
 * e-mail (mailto:) et WhatsApp (wa.me, applications WhatsApp et WhatsApp Business).
 *
 * Depuis Android 11, une application ne « voit » les autres que si elles sont
 * déclarées dans <queries> (visibilité des paquets). Ce ne sont pas des
 * permissions : rien n'est demandé à l'utilisateur.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const INTENTIONS = [
  { action: 'android.intent.action.DIAL', scheme: 'tel' },
  { action: 'android.intent.action.SENDTO', scheme: 'mailto' },
];
const PAQUETS = ['com.whatsapp', 'com.whatsapp.w4b'];

module.exports = function avecLiensAndroid(config) {
  return withAndroidManifest(config, cfg => {
    const manifeste = cfg.modResults.manifest;
    manifeste.queries = manifeste.queries?.length ? manifeste.queries : [{}];
    const requetes = manifeste.queries[0];

    requetes.intent = requetes.intent || [];
    INTENTIONS.forEach(({ action, scheme }) => {
      const existe = requetes.intent.some(i => i.action?.[0]?.$?.['android:name'] === action && i.data?.[0]?.$?.['android:scheme'] === scheme);
      if (!existe) requetes.intent.push({ action: [{ $: { 'android:name': action } }], data: [{ $: { 'android:scheme': scheme } }] });
    });

    requetes.package = requetes.package || [];
    PAQUETS.forEach(nom => {
      if (!requetes.package.some(p => p.$?.['android:name'] === nom)) requetes.package.push({ $: { 'android:name': nom } });
    });
    return cfg;
  });
};
