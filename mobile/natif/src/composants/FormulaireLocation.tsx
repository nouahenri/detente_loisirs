/**
 * Formulaire de location de voiture (demande du 17/09/2026), affiché par
 * l'écran « Louer une voiture » (depuis une fiche) et par l'onglet Devis
 * (formule « Location de voiture ») : véhicule, dates et heures
 * (heure d'Abidjan), lieux de prise en charge, chauffeur, options, estimation
 * en direct, dates déjà prises, coordonnées. La demande part au site
 * (POST /api/location/demande) : elle arrive dans « Demandes » et dans le
 * planning du studio, où la conciergerie la confirme sur WhatsApp.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ChampChoix, type OptionChoix } from './ChampChoix';
import { ChampDate } from './ChampDate';
import { ImageSite } from './ImageSite';
import { ouvrirLien, vibrerErreur, vibrerSelection, vibrerSucces } from './outils';
import { Bouton, Carte, EtatVide, Icone } from './ui';
import { API } from '@/donnees/config';
import { dateJour } from '@/donnees/i18n';
import {
  categorieVehicule, conflitLocation, creneaux, devisLocation, DUREE_MAX_JOURS, modeChauffeur, prixAPartirDe, type CodeErreurLocation,
} from '@/donnees/location';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { dateISO, fcfa, fiche, lienWhatsApp } from '@/donnees/regles';
import { creerStyles, type Palette } from '@/donnees/theme';
import type { Vehicule } from '@/donnees/types';

type Occupation = { debut: string; fin: string };

const plusJours = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const heureLisible = (iso: string, langue: string) => {
  try {
    return new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[langue] || 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso));
  } catch { return iso; }
};

/**
 * `vehiculeImpose` : ouvert depuis la fiche d'un véhicule (pas de changement
 * possible). `onEnvoye` : la demande est enregistrée (total et lien WhatsApp).
 */
export function FormulaireLocation({ vehiculeImpose, onEnvoye }: { vehiculeImpose?: string; onEnvoye: (resultat: { total: string; lien: string }) => void }) {
  const id = vehiculeImpose;
  const { donnees, coordonnees, enregistrerCoordonnees, ajouterDemande } = useMagasin();
  const { C, t, langue, notifications, jeton } = usePreferences();
  const s = feuille(C);
  const vehicules = useMemo(() => donnees?.vehicules ?? [], [donnees]);
  const reglages = donnees?.location;
  const [vehiculeId, setVehiculeId] = useState(id || '');
  const vehicule: Vehicule | null = vehicules.find(v => v.id === vehiculeId) || null;

  // Premier jour possible après le délai de réservation, à 9 h (heure d'Abidjan).
  const premierJour = useMemo(() => {
    const d = new Date(Date.now() + (reglages?.delaiMinHeures ?? 12) * 3600000);
    return plusJours(d.toISOString().slice(0, 10), 1);
  }, [reglages?.delaiMinHeures]);
  const heures = useMemo(() => (reglages ? creneaux(reglages) : ['09:00']), [reglages]);
  const heureDefaut = heures.includes('09:00') ? '09:00' : heures[0];
  const lieuDefaut = reglages?.lieux.find(l => l.actif)?.id || '';

  const [debutJour, setDebutJour] = useState(premierJour);
  const [debutHeure, setDebutHeure] = useState(heureDefaut);
  const [finJour, setFinJour] = useState(plusJours(premierJour, 3));
  const [finHeure, setFinHeure] = useState(heureDefaut);
  const [lieuPrise, setLieuPrise] = useState(lieuDefaut);
  const [lieuRetour, setLieuRetour] = useState(lieuDefaut);
  const [chauffeur, setChauffeur] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [nom, setNom] = useState(coordonnees.nom);
  const [telephone, setTelephone] = useState(coordonnees.tel);
  const [email, setEmail] = useState(coordonnees.email);
  const [message, setMessage] = useState('');
  const [attestation, setAttestation] = useState(false);
  const [occupations, setOccupations] = useState<Occupation[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Dates déjà prises du véhicule choisi (sans nom ni motif).
  useEffect(() => {
    if (!vehiculeId) return undefined;
    let actif = true;
    setOccupations(null);
    fetch(`${API}/api/location/disponibilites?vehicule=${encodeURIComponent(vehiculeId)}`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(corps => { if (actif) setOccupations(Array.isArray(corps.occupations) ? corps.occupations : []); })
      .catch(() => { if (actif) setOccupations([]); });
    return () => { actif = false; };
  }, [vehiculeId]);

  const demande = { debut: `${debutJour}T${debutHeure}`, fin: `${finJour}T${finHeure}`, lieuPrise, lieuRetour, chauffeur, options };
  const devis = devisLocation(vehicule, reglages, demande);
  const gene = conflitLocation(occupations || [], devis.debut, devis.fin);
  const attestationRequise = Boolean(vehicule && !devis.chauffeur && (vehicule.minAge || vehicule.licenseYears));

  const messageErreur = (code: CodeErreurLocation) => ({
    vehicule: t('louer.erreurVehicule'), dates: t('louer.erreurDates'), ordre: t('louer.erreurOrdre'),
    delai: t('louer.erreurDelai', { n: reglages?.delaiMinHeures ?? 12 }), duree: t('louer.erreurDuree', { n: DUREE_MAX_JOURS }),
    minimum: t('louer.erreurMinimum', { n: vehicule?.minDays || 1 }),
    horaires: t('louer.erreurHoraires', { a: reglages?.heureOuverture ?? '07:00', b: reglages?.heureFermeture ?? '20:00' }),
    lieu: t('louer.erreurLieu'), tarif: t('louer.erreurTarif'),
  })[code];

  if (!donnees || !reglages) return null;

  // --- Étape 0 : choisir le véhicule ---------------------------------------
  if (!vehicule) {
    return (
      <View>
        {!vehicules.length ? (
          <EtatVide icone="car-sport-outline" titre={t('louer.aucun')}
            action={<Bouton texte="WhatsApp" icone="logo-whatsapp" variante="wa" onPress={() => ouvrirLien(lienWhatsApp('Bonjour, je souhaite louer une voiture.'), t)} />} />
        ) : (
          <>
            <Text style={s.h2}>{t('louer.choisir')}</Text>
            {vehicules.map(v => (
              <Pressable key={v.id} onPress={() => { vibrerSelection(); setVehiculeId(v.id); setChauffeur(v.driverMode === 'avec'); }} style={({ pressed }) => [s.choixVehicule, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={v.name}>
                <View style={s.vignette}>{v.images[0] ? <ImageSite source={v.images[0]} style={{ width: '100%', height: '100%' }} alt={v.name} /> : <Icone nom="car-sport-outline" taille={28} couleur={C.texte3} />}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.surtitre}>{categorieVehicule(v.category, langue)}</Text>
                  <Text style={s.nomVehicule} numberOfLines={2}>{v.name}</Text>
                  <Text style={s.detail}>{modeChauffeur(v.driverMode, langue)}</Text>
                  <Text style={s.prix}>{prixAPartirDe(v) ? `${t('ligne.des', { x: fcfa(prixAPartirDe(v)) })} ${t('louer.parJour')}` : t('ligne.surDemande')}</Text>
                </View>
                <Icone nom="chevron-forward" taille={20} couleur={C.texte3} />
              </Pressable>
            ))}
          </>
        )}
      </View>
    );
  }

  const lieux: OptionChoix[] = reglages.lieux.filter(l => l.actif).map(l => [l.id, `${l.nom} · ${l.frais ? `+${fcfa(l.frais)}` : t('louer.sansFrais')}`, 'location-outline']);
  const optionsHeures: OptionChoix[] = heures.map(h => [h, h, 'time-outline']);
  const conditions = reglages.conditions[langue] || reglages.conditions.fr;

  const envoyer = async () => {
    setErreur('');
    if (!devis.ok || gene) { vibrerErreur(); return; }
    if (nom.trim().length < 2 || telephone.replace(/\D/g, '').length < 8) { vibrerErreur(); setErreur(t('louer.requis')); return; }
    if (attestationRequise && !attestation) { vibrerErreur(); setErreur(t('louer.attestationRequise')); return; }
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
            vehicule: vehicule.id, ...demande, nom: nom.trim(), telephone: telephone.trim(), email: email.trim(), message: message.trim(),
            conditionsConducteur: attestation, source: 'app', langue, ...(appareil ? { appareil } : {}),
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
        dates: `${debutJour} ${debutHeure} → ${finJour} ${finHeure}`,
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
        <Pressable onPress={() => { if (!id) { vibrerSelection(); setVehiculeId(''); } }} disabled={Boolean(id)} style={s.resume} accessibilityRole={id ? undefined : 'button'}>
          <View style={s.vignette}>{vehicule.images[0] ? <ImageSite source={vehicule.images[0]} style={{ width: '100%', height: '100%' }} alt={vehicule.name} /> : <Icone nom="car-sport-outline" taille={28} couleur={C.texte3} />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.surtitre}>{categorieVehicule(vehicule.category, langue)}</Text>
            <Text style={s.nomVehicule} numberOfLines={2}>{vehicule.name}</Text>
            <Text style={s.detail}>{fiche(vehicule, 'tagline', langue) || modeChauffeur(vehicule.driverMode, langue)}</Text>
          </View>
          {!id ? <Icone nom="swap-horizontal" taille={20} couleur={C.orTexte} /> : null}
        </Pressable>

        <Text style={s.h3}>{t('louer.prise')}</Text>
        <View style={s.ligne}>
          <ChampDate libelle={t('louer.prise')} valeur={debutJour} minimum={dateISO(new Date())} onChange={jour => { setDebutJour(jour); if (finJour <= jour) setFinJour(plusJours(jour, 1)); }} />
          <View style={{ flex: 1 }}><ChampChoix libelle={t('louer.heure')} icone="time-outline" valeur={debutHeure} options={optionsHeures} onChange={setDebutHeure} /></View>
        </View>
        <Text style={s.h3}>{t('louer.retour')}</Text>
        <View style={s.ligne}>
          <ChampDate libelle={t('louer.retour')} valeur={finJour} minimum={debutJour} onChange={setFinJour} />
          <View style={{ flex: 1 }}><ChampChoix libelle={t('louer.heure')} icone="time-outline" valeur={finHeure} options={optionsHeures} onChange={setFinHeure} /></View>
        </View>
        <Text style={s.note}>{t('louer.heureAbidjan')} · {dateJour(debutJour, langue)} → {dateJour(finJour, langue)}</Text>

        {lieux.length ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <ChampChoix libelle={t('louer.lieuPrise')} icone="location-outline" valeur={lieuPrise} options={lieux} onChange={setLieuPrise} />
            <ChampChoix libelle={t('louer.lieuRetour')} icone="flag-outline" valeur={lieuRetour} options={lieux} onChange={setLieuRetour} />
          </View>
        ) : null}

        <View style={{ marginTop: 14 }}>
          {vehicule.driverMode === 'choix' ? (
            <CaseACocher C={C} coche={chauffeur} onPress={() => setChauffeur(c => !c)}
              texte={`${t('louer.chauffeurChoix')}${vehicule.driverPricePerDay ? ` (+${fcfa(vehicule.driverPricePerDay)} ${t('louer.parJour')})` : ''}`} />
          ) : (
            <View style={s.info}><Icone nom={vehicule.driverMode === 'avec' ? 'person-outline' : 'key-outline'} taille={18} couleur={C.orTexte} /><Text style={s.infoTexte}>{t(vehicule.driverMode === 'avec' ? 'louer.chauffeurImpose' : 'louer.chauffeurExclu')}</Text></View>
          )}
        </View>

        {reglages.options.some(o => o.actif) ? (
          <>
            <Text style={s.h3}>{t('louer.options')}</Text>
            {reglages.options.filter(o => o.actif).map(o => (
              <CaseACocher key={o.id} C={C} coche={options.includes(o.id)} onPress={() => setOptions(liste => (liste.includes(o.id) ? liste.filter(x => x !== o.id) : [...liste, o.id]))}
                texte={`${o.nom} · ${fcfa(o.prix)} ${o.unite === 'jour' ? t('louer.parJour') : t('louer.parLocation')}`} />
            ))}
          </>
        ) : null}

        <Carte titre={devis.ok ? `${t('louer.estimation')} · ${t(devis.jours > 1 ? 'louer.jours' : 'louer.jour', { n: devis.jours })}` : t('louer.estimation')} style={{ marginTop: 16 }}>
          {!devis.ok ? <Text style={s.erreur}>{messageErreur(devis.erreurs[0])}</Text> : (
            <>
              {devis.lignes.map((l, i) => (
                <View key={i} style={s.ligneDevis}>
                  <Text style={s.ligneLibelle}>{
                    l.cle === 'vehicule' ? `${t('louer.ligneVehicule', { n: l.quantite, x: fcfa(l.prixUnitaire) })} · ${t(l.palier === 'mois' ? 'louer.palierMois' : l.palier === 'semaine' ? 'louer.palierSemaine' : 'louer.palierJour')}`
                      : l.cle === 'chauffeur' ? t('louer.ligneChauffeur', { n: l.quantite, x: fcfa(l.prixUnitaire) })
                        : l.cle === 'livraison' ? `${l.sens === 'prise' ? t('louer.livraison') : t('louer.reprise')} · ${l.nom}`
                          : `${l.nom}${l.unite === 'jour' ? ` · ${l.quantite} × ${fcfa(l.prixUnitaire)}` : ''}`
                  }</Text>
                  <Text style={s.ligneMontant}>{fcfa(l.montant)}</Text>
                </View>
              ))}
              <View style={[s.ligneDevis, s.total]}><Text style={s.totalLibelle}>{t('louer.total')}</Text><Text style={s.totalMontant}>{fcfa(devis.total)}</Text></View>
              {devis.caution ? <View style={s.ligneDevis}><Text style={s.ligneLibelle}>{t('louer.cautionRemise')}</Text><Text style={s.ligneMontant}>{fcfa(devis.caution)}</Text></View> : null}
              <Text style={s.note}>{devis.kmInclus ? t('fiche.kmInclus', { n: vehicule.kmIncludedPerDay, x: fcfa(vehicule.extraKmPrice) }) : `${t('fiche.km')} : ${t('fiche.kmIllimite')}`}</Text>
              {gene ? <Text style={s.erreur}>{t('louer.occupe')}</Text> : null}
            </>
          )}
        </Carte>

        {occupations ? (
          <View style={{ marginTop: 10 }}>
            {occupations.length ? (
              <>
                <Text style={s.noteForte}>{t('louer.dejaReserve')}</Text>
                {occupations.slice(0, 6).map(o => <Text key={o.debut} style={s.note}>• {heureLisible(o.debut, langue)} → {heureLisible(o.fin, langue)}</Text>)}
              </>
            ) : <Text style={s.note}>{t('louer.toutLibre')}</Text>}
          </View>
        ) : null}

        <Text style={s.h3}>{t('louer.coordonnees')}</Text>
        <Champ C={C} libelle={t('louer.nom')} valeur={nom} onChange={setNom} autoComplete="name" />
        <Champ C={C} libelle={t('louer.telephone')} valeur={telephone} onChange={setTelephone} clavier="phone-pad" autoComplete="tel" />
        <Champ C={C} libelle={t('louer.email')} valeur={email} onChange={setEmail} clavier="email-address" autoComplete="email" />
        <Champ C={C} libelle={t('louer.message')} valeur={message} onChange={setMessage} placeholder={t('louer.messageAide')} multiligne />
        {attestationRequise ? (
          <CaseACocher C={C} coche={attestation} onPress={() => setAttestation(a => !a)} texte={t('louer.attestation', { age: vehicule.minAge || 21, n: vehicule.licenseYears || 0 })} />
        ) : null}

        {conditions ? <Carte titre={t('louer.conditions')} style={{ marginTop: 12 }}><Text style={s.texte}>{conditions}</Text></Carte> : null}
        {erreur ? <Text style={[s.erreur, { marginTop: 12 }]} accessibilityLiveRegion="polite">{erreur}</Text> : null}
        <Bouton texte={t('louer.envoyer')} icone="send" plein charge={envoi} desactive={!devis.ok || Boolean(gene)} onPress={envoyer} style={{ marginTop: 16 }} />
        <Text style={[s.note, { textAlign: 'center', marginTop: 10 }]}>{t('louer.rienEnLigne')}</Text>
    </View>
  );
}

function CaseACocher({ C, coche, texte, onPress }: { C: Palette; coche: boolean; texte: string; onPress: () => void }) {
  const s = feuille(C);
  return (
    <Pressable onPress={() => { vibrerSelection(); onPress(); }} style={s.case} accessibilityRole="checkbox" accessibilityState={{ checked: coche }}>
      <View style={[s.caseBoite, coche && s.caseActive]}>{coche ? <Icone nom="checkmark" taille={16} couleur="#fff" /> : null}</View>
      <Text style={[s.caseTexte, coche && { color: C.texte }]}>{texte}</Text>
    </Pressable>
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
  choixVehicule: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 10, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre },
  vignette: { width: 88, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: C.vignette, alignItems: 'center', justifyContent: 'center' },
  surtitre: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: C.orTexte },
  nomVehicule: { fontSize: 16, fontWeight: '800', color: C.texte },
  detail: { fontSize: 12.5, color: C.texte2, marginTop: 2 },
  prix: { fontSize: 13.5, fontWeight: '800', color: C.marque, marginTop: 4 },
  ligne: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  note: { fontSize: 12.5, color: C.texte3, marginTop: 6, lineHeight: 18 },
  noteForte: { fontSize: 13, fontWeight: '700', color: C.texte2 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.surface },
  infoTexte: { flex: 1, fontSize: 14, fontWeight: '600', color: C.texte },
  ligneDevis: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  ligneLibelle: { flex: 1, fontSize: 13.5, color: C.texte2 },
  ligneMontant: { fontSize: 13.5, fontWeight: '700', color: C.texte },
  total: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.bord },
  totalLibelle: { fontSize: 15.5, fontWeight: '800', color: C.texte },
  totalMontant: { fontSize: 17, fontWeight: '800', color: C.marque },
  erreur: { fontSize: 14, fontWeight: '700', color: C.danger, marginTop: 4 },
  texte: { fontSize: 14, lineHeight: 21, color: C.texte2 },
  case: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  caseBoite: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.bord, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  caseActive: { backgroundColor: C.primaire, borderColor: C.primaire },
  caseTexte: { flex: 1, fontSize: 14.5, lineHeight: 21, color: C.texte2 },
  champLibelle: { fontSize: 12.5, fontWeight: '700', color: C.texte2, marginBottom: 6, marginLeft: 4 },
  champ: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.carte, fontSize: 16, color: C.texte },
}));
