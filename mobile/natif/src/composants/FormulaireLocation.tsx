/**
 * Formulaire de location de voiture (demande du 17/09/2026), affiché par
 * l'écran « Louer une voiture » (depuis la fiche d'un véhicule ou la carte
 * d'accueil). Choix et détails de la location : composants/EtapeVoiture,
 * partagés avec l'onglet Devis. La demande part au site
 * (POST /api/location/demande) : elle arrive dans « Demandes » et dans le
 * planning du studio, où la conciergerie la confirme sur WhatsApp.
 */
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { DetailsVoiture, etatVoiture, heureLisible, ListeVehicules, saisiePourVehicule, useOccupations } from './EtapeVoiture';
import { ouvrirLien, vibrerErreur, vibrerSucces } from './outils';
import { Bouton, Carte, EtatVide } from './ui';
import { API } from '@/donnees/config';
import { demandeDeSaisie, modeChauffeur, saisieVoitureInitiale, type SaisieVoiture } from '@/donnees/location';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { fcfa, lienWhatsApp } from '@/donnees/regles';
import { creerStyles, type Palette } from '@/donnees/theme';

/**
 * `vehiculeImpose` : ouvert depuis la fiche d'un véhicule (pas de changement
 * possible). `onEnvoye` : la demande est enregistrée (total et lien WhatsApp).
 */
export function FormulaireLocation({ vehiculeImpose, onEnvoye }: { vehiculeImpose?: string; onEnvoye: (resultat: { total: string; lien: string }) => void }) {
  const { donnees, coordonnees, enregistrerCoordonnees, ajouterDemande } = useMagasin();
  const { C, t, langue, notifications, jeton } = usePreferences();
  const s = feuille(C);
  const vehicules = donnees?.vehicules ?? [];
  const reglages = donnees?.location;
  // Véhicule imposé retenu même si les annonces ne sont pas encore chargées
  // (lien direct) ; le chauffeur « toujours inclus » est appliqué par l'estimation.
  const [saisie, setSaisie] = useState<SaisieVoiture>(() => ({
    ...saisiePourVehicule(saisieVoitureInitiale(reglages), vehicules.find(v => v.id === vehiculeImpose) || null),
    vehiculeId: vehiculeImpose || '',
  }));
  const maj = (modif: Partial<SaisieVoiture>) => setSaisie(actuelle => ({ ...actuelle, ...modif }));
  const vehicule = vehicules.find(v => v.id === saisie.vehiculeId) || null;
  const occupations = useOccupations(saisie.vehiculeId);
  const [nom, setNom] = useState(coordonnees.nom);
  const [telephone, setTelephone] = useState(coordonnees.tel);
  const [email, setEmail] = useState(coordonnees.email);
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  // Réglages arrivés après l'ouverture : lieu de prise en charge par défaut.
  useEffect(() => {
    const lieu = reglages?.lieux.find(l => l.actif)?.id;
    if (lieu) setSaisie(actuelle => (actuelle.lieuPrise ? actuelle : { ...actuelle, lieuPrise: lieu, lieuRetour: actuelle.lieuRetour || lieu }));
  }, [reglages]);

  if (!donnees || !reglages) return null;

  if (!vehicule) {
    return !vehicules.length ? (
      <EtatVide icone="car-sport-outline" titre={t('louer.aucun')}
        action={<Bouton texte="WhatsApp" icone="logo-whatsapp" variante="wa" onPress={() => ouvrirLien(lienWhatsApp('Bonjour, je souhaite louer une voiture.'), t)} />} />
    ) : (
      <View>
        <Text style={s.h2}>{t('louer.choisir')}</Text>
        <ListeVehicules vehicules={vehicules} choisi="" onChoisir={v => setSaisie(actuelle => saisiePourVehicule(actuelle, v))} />
      </View>
    );
  }

  const { devis, gene, attestationRequise } = etatVoiture(vehicule, reglages, saisie, occupations);
  const conditions = reglages.conditions[langue] || reglages.conditions.fr;

  const envoyer = async () => {
    setErreur('');
    if (!devis.ok || gene) { vibrerErreur(); return; }
    if (nom.trim().length < 2 || telephone.replace(/\D/g, '').length < 8) { vibrerErreur(); setErreur(t('louer.requis')); return; }
    if (attestationRequise && !saisie.attestation) { vibrerErreur(); setErreur(t('louer.attestationRequise')); return; }
    setEnvoi(true);
    // Suivi par notification quand elles sont déjà activées sur ce téléphone.
    const appareil = notifications === 'actif' && jeton ? jeton : undefined;
    const recap = [
      'Bonjour Henri & Philippe, je viens d’envoyer une demande de location depuis l’application :',
      `• ${vehicule.name}`,
      `• ${heureLisible(devis.debut || '', 'fr')} → ${heureLisible(devis.fin || '', 'fr')} (${devis.jours} jour${devis.jours > 1 ? 's' : ''})`,
      `• ${devis.chauffeur ? 'Avec chauffeur' : 'Sans chauffeur'}`,
      `• Total estimé : ${fcfa(devis.total)}`,
      `• ${nom.trim()}`,
    ].join('\n');
    const lien = lienWhatsApp(recap);
    try {
      const reponse = await Promise.race([
        fetch(`${API}/api/location/demande`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            vehicule: vehicule.id, ...demandeDeSaisie(saisie), nom: nom.trim(), telephone: telephone.trim(), email: email.trim(), message: message.trim(),
            conditionsConducteur: saisie.attestation, source: 'app', langue, ...(appareil ? { appareil } : {}),
          }),
        }),
        new Promise<never>((_, rejet) => setTimeout(() => rejet(new Error('délai')), 12000)),
      ]);
      const corps = (await reponse.json().catch(() => ({}))) as { ok?: boolean; error?: string; lead?: { id?: string; status?: string } };
      if (!reponse.ok) { setEnvoi(false); vibrerErreur(); setErreur(corps.error || t('louer.erreur')); return; }
      enregistrerCoordonnees({ nom, tel: telephone, email });
      ajouterDemande({
        le: new Date().toISOString(),
        objet: `${t('ligne.vehicule')} · ${vehicule.name}`,
        dates: `${saisie.debutJour} ${saisie.debutHeure} → ${saisie.finJour} ${saisie.finHeure}`,
        voyageurs: modeChauffeur(devis.chauffeur ? 'avec' : 'sans', langue),
        total: fcfa(devis.total), enregistree: true, lien,
        id: corps.lead?.id, statut: corps.lead?.status || 'nouveau', suivi: Boolean(appareil),
      });
      vibrerSucces();
      setEnvoi(false);
      onEnvoye({ total: fcfa(devis.total), lien });
    } catch {
      setEnvoi(false);
      vibrerErreur();
      setErreur(t('louer.erreur'));
    }
  };

  return (
    <View>
      <DetailsVoiture vehicule={vehicule} reglages={reglages} saisie={saisie} maj={maj} occupations={occupations}
        onChanger={vehiculeImpose ? undefined : () => maj({ vehiculeId: '' })} />

      <Text style={s.h3}>{t('louer.coordonnees')}</Text>
      <Champ C={C} libelle={t('louer.nom')} valeur={nom} onChange={setNom} autoComplete="name" />
      <Champ C={C} libelle={t('louer.telephone')} valeur={telephone} onChange={setTelephone} clavier="phone-pad" autoComplete="tel" />
      <Champ C={C} libelle={t('louer.email')} valeur={email} onChange={setEmail} clavier="email-address" autoComplete="email" />
      <Champ C={C} libelle={t('louer.message')} valeur={message} onChange={setMessage} placeholder={t('louer.messageAide')} multiligne />

      {conditions ? <Carte titre={t('louer.conditions')} style={{ marginTop: 12 }}><Text style={s.texte}>{conditions}</Text></Carte> : null}
      {erreur ? <Text style={[s.erreur, { marginTop: 12 }]} accessibilityLiveRegion="polite">{erreur}</Text> : null}
      <Bouton texte={t('louer.envoyer')} icone="send" plein charge={envoi} desactive={!devis.ok || Boolean(gene)} onPress={envoyer} style={{ marginTop: 16 }} />
      <Text style={[s.note, { textAlign: 'center', marginTop: 10 }]}>{t('louer.rienEnLigne')}</Text>
    </View>
  );
}

function Champ({ C, libelle, valeur, onChange, placeholder, clavier, autoComplete, multiligne }: {
  C: Palette; libelle: string; valeur: string; onChange: (v: string) => void; placeholder?: string;
  clavier?: 'phone-pad' | 'email-address'; autoComplete?: 'name' | 'tel' | 'email'; multiligne?: boolean;
}) {
  const s = feuille(C);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.champLibelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.texte3}
        keyboardType={clavier}
        autoComplete={autoComplete}
        autoCapitalize={clavier ? 'none' : 'sentences'}
        multiline={multiligne}
        textAlignVertical={multiligne ? 'top' : 'center'}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.champ, multiligne && { minHeight: 80, paddingTop: 12 }, focus && { borderColor: C.sombre ? C.or : '#151837' }]}
      />
    </View>
  );
}

const feuille = creerStyles(C => ({
  h2: { fontSize: 20, fontWeight: '800', color: C.texte, marginBottom: 12 },
  h3: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: C.texte2, marginTop: 18, marginBottom: 8 },
  note: { fontSize: 12.5, color: C.texte3, marginTop: 6, lineHeight: 18 },
  erreur: { fontSize: 14, fontWeight: '700', color: C.danger, marginTop: 4 },
  texte: { fontSize: 14, lineHeight: 21, color: C.texte2 },
  champLibelle: { fontSize: 12.5, fontWeight: '700', color: C.texte2, marginBottom: 6, marginLeft: 4 },
  champ: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.carte, fontSize: 16, color: C.texte },
}));
