/**
 * GABARITS D'E-MAILS — Henri & Philippe / Détente & Loisirs à Assinie.
 *
 * Règles de rédaction :
 *   · Français, ton sobre et factuel. Aucun emoji, aucune formule racoleuse.
 *   · Couleurs de la marque : bleu nuit #151837, or #e8b904.
 *   · Chaque message existe en HTML ET en texte brut. Le texte brut n'est pas
 *     un pis-aller : un message sans version texte est noté négativement par
 *     les filtres anti-spam, et certains clients (mobiles bridés, lecteurs
 *     d'écran) n'affichent que celle-là.
 *   · Mise en page en tableaux avec styles en ligne : les clients de
 *     messagerie (Outlook, Gmail) ignorent une grande partie du CSS moderne.
 *   · Une seule image distante : le logo de l'en-tête (demande du propriétaire,
 *     13/09/2026), par URL absolue et non en pièce jointe CID — la file
 *     d'attente ne conserve que le HTML, une pièce jointe serait perdue au
 *     renvoi. Son `alt` et le nom écrit à côté gardent l'en-tête lisible quand
 *     la messagerie bloque les images.
 */

const BRAND = {
  name: 'Henri & Philippe',
  activite: 'Détente et loisirs à Assinie',
  baseline: 'Villas et terrains à Assinie, Côte d’Ivoire',
  logoUrl: 'https://henri-philippe.com/assets/images/logo.png',
  ink: '#151837',
  gold: '#e8b904',
  paper: '#ffffff',
  soft: '#f4f5f9',
  muted: '#5b6070',
  line: '#e2e4ec'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

/** Transforme un texte brut saisi dans le studio en paragraphes HTML sûrs. */
function textToHtml(value) {
  return String(value ?? '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Retire les balises d'un HTML pour produire une version texte lisible. */
function htmlToText(value) {
  return String(value ?? '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Gabarit commun. `footerLines` reçoit les mentions légales et, pour les
 * envois de newsletter, le lien de désabonnement.
 * En-tête : logo sur pastille blanche (fond transparent, « H » bleu nuit,
 * invisible sur le bleu de l'en-tête), puis nom, activité et baseline.
 */
function layout({ preheader = '', heading, bodyHtml, cta = null, footerLines = [] }) {
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
         <tr><td style="border-radius:4px;background:${BRAND.ink};">
           <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 26px;font:600 14px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;letter-spacing:.02em;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>
       <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><span style="color:${BRAND.ink};word-break:break-all;">${escapeHtml(cta.url)}</span></p>`
    : '';

  const footerHtml = footerLines.length
    ? footerLines.map(line => `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted};">${line}</p>`).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.soft};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.soft};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${BRAND.paper};border:1px solid ${BRAND.line};">
      <tr>
        <td style="background:${BRAND.ink};padding:20px 32px;border-bottom:3px solid ${BRAND.gold};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:0 16px 0 0;vertical-align:middle;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td style="background:#ffffff;border-radius:6px;padding:4px;">
                    <img src="${BRAND.logoUrl}" width="64" height="64" alt="${BRAND.name}" style="display:block;width:64px;height:64px;border:0;outline:none;text-decoration:none;">
                  </td>
                </tr></table>
              </td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font:700 18px/1.2 Georgia,'Times New Roman',serif;color:#ffffff;letter-spacing:.04em;">${BRAND.name}</p>
                <p style="margin:6px 0 0;font:600 13px/1.4 Arial,Helvetica,sans-serif;color:${BRAND.gold};">${BRAND.activite}</p>
                <p style="margin:3px 0 0;font:400 12px/1.4 Arial,Helvetica,sans-serif;color:rgba(255,255,255,.72);">${BRAND.baseline}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 18px;font:600 22px/1.3 Georgia,'Times New Roman',serif;color:${BRAND.ink};">${escapeHtml(heading)}</h1>
          ${bodyHtml}
          ${ctaHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px 26px;border-top:1px solid ${BRAND.line};background:#fbfbfd;">
          ${footerHtml}
          <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:${BRAND.muted};">
            ${BRAND.name} — Assinie-Mafia, Côte d’Ivoire<br>
            <a href="mailto:contact@henri-philippe.com" style="color:${BRAND.ink};">contact@henri-philippe.com</a> · +225 07 67 69 63 18
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

const SIGNATURE_TEXT =
  `--\n${BRAND.name}\n${BRAND.activite}\n${BRAND.baseline}\ncontact@henri-philippe.com · +225 07 67 69 63 18`;

// ---------------------------------------------------------------------------
// 1. Confirmation d'inscription (double opt-in)
// ---------------------------------------------------------------------------
function newsletterConfirmation({ name = '', confirmUrl }) {
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const bodyHtml = [
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${escapeHtml(greeting)}</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">Vous avez demandé à recevoir nos actualités : disponibilités des villas, nouveaux terrains à Assinie et informations pratiques.</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">Pour finaliser votre inscription, confirmez votre adresse en cliquant sur le bouton ci-dessous.</p>`
  ].join('');

  return {
    subject: 'Confirmez votre inscription à nos actualités',
    html: layout({
      preheader: 'Une dernière étape pour recevoir les actualités Henri & Philippe.',
      heading: 'Confirmez votre inscription',
      bodyHtml,
      cta: { label: 'Confirmer mon inscription', url: confirmUrl },
      footerLines: [
        'Ce lien est personnel et à usage unique.',
        'Si vous n’êtes pas à l’origine de cette demande, ignorez simplement ce message : sans confirmation de votre part, aucune adresse n’est ajoutée à notre liste.'
      ]
    }),
    text: `${greeting}

Vous avez demandé à recevoir nos actualités : disponibilités des villas, nouveaux
terrains à Assinie et informations pratiques.

Pour finaliser votre inscription, confirmez votre adresse en ouvrant ce lien :
${confirmUrl}

Ce lien est personnel et à usage unique.
Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : sans
confirmation de votre part, aucune adresse n'est ajoutée à notre liste.

${SIGNATURE_TEXT}`
  };
}

// ---------------------------------------------------------------------------
// 2. Inscription confirmée
// ---------------------------------------------------------------------------
function newsletterWelcome({ name = '', unsubscribeUrl, siteUrl = '' }) {
  const greeting = name ? `Bonjour ${name},` : 'Bonjour,';
  const bodyHtml = [
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${escapeHtml(greeting)}</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">Votre inscription est confirmée. Vous recevrez nos actualités : nouvelles villas, terrains disponibles et informations utiles avant votre séjour.</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">Pour toute demande de réservation ou d’information sur une parcelle, répondez simplement à ce message.</p>`
  ].join('');

  return {
    subject: 'Votre inscription est confirmée',
    html: layout({
      preheader: 'Inscription confirmée.',
      heading: 'Inscription confirmée',
      bodyHtml,
      cta: siteUrl ? { label: 'Voir les résidences', url: `${siteUrl}/residences.html` } : null,
      footerLines: [
        `Vous pouvez vous désinscrire à tout moment : <a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND.ink};">se désabonner</a>.`
      ]
    }),
    text: `${greeting}

Votre inscription est confirmée. Vous recevrez nos actualités : nouvelles villas,
terrains disponibles et informations utiles avant votre séjour.

Pour toute demande de réservation ou d'information sur une parcelle, répondez
simplement à ce message.

Se désabonner : ${unsubscribeUrl}

${SIGNATURE_TEXT}`
  };
}

// ---------------------------------------------------------------------------
// 3. Campagne
// ---------------------------------------------------------------------------
function newsletterCampaign({ subject, bodyHtml = '', bodyText = '', unsubscribeUrl }) {
  const inner = bodyHtml && bodyHtml.trim() ? bodyHtml : textToHtml(bodyText);
  const plain = bodyText && bodyText.trim() ? bodyText : htmlToText(bodyHtml);

  return {
    subject,
    html: layout({
      preheader: plain.slice(0, 140),
      heading: subject,
      bodyHtml: inner,
      footerLines: [
        `Vous recevez ce message parce que vous avez confirmé votre inscription à nos actualités.`,
        `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${BRAND.ink};">Se désabonner en un clic</a>`
      ]
    }),
    text: `${plain}

--
Vous recevez ce message parce que vous avez confirmé votre inscription à nos
actualités.
Se désabonner : ${unsubscribeUrl}

${SIGNATURE_TEXT}`
  };
}

// ---------------------------------------------------------------------------
// 4. Notification interne : nouvelle demande client
// ---------------------------------------------------------------------------
function leadNotification({ lead, siteUrl = '' }) {
  const rows = [
    ['Type de demande', lead.type],
    ['Nom', lead.name],
    ['Téléphone', lead.phone],
    ['E-mail', lead.email],
    ['Résidence', lead.villa],
    ['Terrain', lead.terrainRef || lead.terrainId],
    ['Dates', lead.dates],
    ['Montant indiqué', lead.amount ? `${new Intl.NumberFormat('fr-FR').format(Number(lead.amount))} FCFA` : ''],
    ['Reçue le', new Date(lead.createdAt || Date.now()).toLocaleString('fr-FR')]
  ].filter(row => String(row[1] ?? '').trim());

  const tableHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
    ${rows.map(([label, value]) => `<tr>
      <td style="padding:9px 12px 9px 0;border-bottom:1px solid ${BRAND.line};font:600 12px/1.4 Arial,Helvetica,sans-serif;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font:400 14px/1.5 Arial,Helvetica,sans-serif;color:${BRAND.ink};">${escapeHtml(value)}</td>
    </tr>`).join('')}
  </table>`;

  const messageHtml = String(lead.message || '').trim()
    ? `<p style="margin:0 0 8px;font:600 12px/1.4 Arial,Helvetica,sans-serif;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.06em;">Message</p>
       <div style="padding:14px 16px;border-left:3px solid ${BRAND.gold};background:${BRAND.soft};font-size:14px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(lead.message).replace(/\n/g, '<br>')}</div>`
    : '';

  return {
    subject: `Nouvelle demande — ${lead.name || lead.email || 'visiteur'}${lead.villa ? ` · ${lead.villa}` : ''}`,
    html: layout({
      preheader: `Nouvelle demande reçue sur le site (${lead.type || 'demande'}).`,
      heading: 'Nouvelle demande reçue',
      bodyHtml: tableHtml + messageHtml,
      cta: siteUrl ? { label: 'Ouvrir le studio', url: `${siteUrl}/admin.html` } : null,
      footerLines: ['Message automatique émis par le site henri-philippe.com. La demande est déjà enregistrée dans le studio, même si cet e-mail n’était pas parti.']
    }),
    text: `Nouvelle demande reçue sur le site.

${rows.map(([label, value]) => `${label} : ${value}`).join('\n')}
${String(lead.message || '').trim() ? `\nMessage :\n${lead.message}\n` : ''}
La demande est déjà enregistrée dans le studio, même si cet e-mail n'était pas parti.

${SIGNATURE_TEXT}`
  };
}

// ---------------------------------------------------------------------------
// 4 bis. Accusé de réception au client : demande du simulateur de devis
// ---------------------------------------------------------------------------
// « Prise en charge » et non « confirmation de réservation » : la disponibilité
// n'est vérifiée qu'ensuite par la conciergerie, et le montant reste estimatif.
function leadConfirmation({ lead, siteUrl = '' }) {
  const activites = lead.type === 'devis-activites';
  const greeting = lead.name ? `Bonjour ${lead.name},` : 'Bonjour,';
  const montant = lead.amount ? `${new Intl.NumberFormat('fr-FR').format(Number(lead.amount))} FCFA` : '';
  const rows = [
    ['Formule', activites ? 'Activités uniquement (sans hébergement)' : 'Séjour en résidence'],
    [activites ? '' : 'Résidence', activites ? '' : lead.villa],
    ['Dates', String(lead.dates || '').replace('→', 'au')],
    ['Détail', lead.message],
    ['Estimation', montant],
    ['Téléphone WhatsApp', lead.phone]
  ].filter(row => row[0] && String(row[1] ?? '').trim());

  const tableHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
    ${rows.map(([label, value]) => `<tr>
      <td style="padding:9px 12px 9px 0;border-bottom:1px solid ${BRAND.line};font:600 12px/1.4 Arial,Helvetica,sans-serif;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${BRAND.line};font:400 14px/1.5 Arial,Helvetica,sans-serif;color:${BRAND.ink};">${escapeHtml(value)}</td>
    </tr>`).join('')}
  </table>`;

  const p = contenu => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${contenu}</p>`;
  const intro = `Nous avons bien reçu votre demande de ${activites ? 'réservation d’activités' : 'réservation'} et elle est prise en charge par notre conciergerie.`;
  const suite = 'Nous vérifions les disponibilités et revenons vers vous sur WhatsApp ou par téléphone pour confirmer votre réservation. Le montant ci-dessous est une estimation : il vous sera confirmé à ce moment-là.';
  const acompte = 'Un acompte de 30 % est demandé à la confirmation ; le solde est réglé à la remise des clés sur place à Assinie.';

  return {
    subject: 'Votre demande de réservation est prise en charge',
    html: layout({
      preheader: 'Nous avons bien reçu votre demande de réservation à Assinie.',
      heading: 'Demande de réservation prise en charge',
      bodyHtml: [p(escapeHtml(greeting)), p(escapeHtml(intro)), p(escapeHtml(suite)), tableHtml, p(escapeHtml(acompte))].join(''),
      cta: siteUrl ? { label: 'Revoir nos résidences', url: `${siteUrl}/residences.html` } : null,
      footerLines: ['Vous recevez ce message parce que vous avez envoyé une demande depuis le simulateur de devis du site henri-philippe.com. Pour toute question, répondez simplement à cet e-mail.']
    }),
    text: `${greeting}

${intro}

${suite}

${rows.map(([label, value]) => `${label} : ${value}`).join('\n')}

${acompte}

Vous recevez ce message parce que vous avez envoyé une demande depuis le
simulateur de devis du site henri-philippe.com. Pour toute question, répondez
simplement à cet e-mail.

${SIGNATURE_TEXT}`
  };
}

// ---------------------------------------------------------------------------
// 4 bis. Mot de passe du studio (17/09/2026)
// ---------------------------------------------------------------------------
function passwordReset({ username = '', resetUrl, expiresMinutes = 60 }) {
  const p = contenu => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${contenu}</p>`;
  const intro = `Une demande de nouveau mot de passe a été faite pour le compte « ${username} » du studio henri-philippe.com.`;
  const consigne = `Pour choisir un nouveau mot de passe, ouvrez le lien ci-dessous. Il est valable ${expiresMinutes} minutes et ne sert qu’une fois.`;
  const securite = 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste inchangé.';
  return {
    subject: 'Choisir un nouveau mot de passe — studio henri-philippe.com',
    html: layout({
      preheader: 'Lien pour choisir un nouveau mot de passe du studio.',
      heading: 'Nouveau mot de passe',
      bodyHtml: [p('Bonjour,'), p(escapeHtml(intro)), p(escapeHtml(consigne))].join(''),
      cta: { label: 'Choisir un nouveau mot de passe', url: resetUrl },
      footerLines: [securite]
    }),
    text: `Bonjour,

${intro}

${consigne}

${resetUrl}

${securite}

${SIGNATURE_TEXT}`
  };
}

function passwordChanged({ username = '', when = new Date(), withoutCurrent = false, byReset = false }) {
  const moment = new Date(when).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });
  const comment = byReset ? 'à l’aide d’un lien envoyé par e-mail' : withoutCurrent ? 'depuis une session ouverte, sans saisir l’ancien mot de passe' : 'depuis le studio';
  const phrase = `Le mot de passe du compte « ${username} » a été modifié le ${moment} ${comment}. Toutes les sessions ouvertes ont été fermées.`;
  const alerte = 'Si vous n’êtes pas à l’origine de ce changement, prévenez immédiatement le propriétaire du studio pour faire bloquer le compte.';
  const p = contenu => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">${contenu}</p>`;
  return {
    subject: 'Votre mot de passe du studio a été modifié',
    html: layout({ preheader: 'Mot de passe du studio modifié.', heading: 'Mot de passe modifié', bodyHtml: [p('Bonjour,'), p(escapeHtml(phrase)), p(escapeHtml(alerte))].join(''), footerLines: ['Message de sécurité automatique.'] }),
    text: `Bonjour,

${phrase}

${alerte}

${SIGNATURE_TEXT}`
  };
}

// ---------------------------------------------------------------------------
// 5. Message de test SMTP
// ---------------------------------------------------------------------------
function smtpTest({ requestedBy = '' }) {
  return {
    subject: 'Test de configuration SMTP — henri-philippe.com',
    html: layout({
      preheader: 'Test d’envoi depuis le studio.',
      heading: 'Test d’envoi réussi',
      bodyHtml: `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BRAND.ink};">Ce message confirme que le serveur du site parvient à envoyer des e-mails via le SMTP configuré.</p>
                 <p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.ink};">Demandé depuis le studio${requestedBy ? ` par ${escapeHtml(requestedBy)}` : ''} le ${new Date().toLocaleString('fr-FR')}.</p>`,
      footerLines: ['Aucune action n’est requise de votre part.']
    }),
    text: `Ce message confirme que le serveur du site parvient à envoyer des e-mails via
le SMTP configuré.

Demandé depuis le studio${requestedBy ? ` par ${requestedBy}` : ''} le ${new Date().toLocaleString('fr-FR')}.

${SIGNATURE_TEXT}`
  };
}

module.exports = {
  passwordReset, passwordChanged,
  BRAND, escapeHtml, textToHtml, htmlToText, layout,
  newsletterConfirmation, newsletterWelcome, newsletterCampaign, leadNotification, leadConfirmation, smtpTest
};
