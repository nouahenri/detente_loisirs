/**
 * Choix et détails d'une location de voiture, partagés par l'onglet Devis
 * (étape « Voiture » et formule « Voiture seule », 19/09/2026) et l'écran
 * « Louer une voiture » : véhicule, dates et heures (heure d'Abidjan), lieux,
 * chauffeur, options, estimation en direct et dates déjà prises.
 * Composants contrôlés : la saisie vit chez l'appelant (SaisieVoiture).
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ChampChoix, type OptionChoix } from './ChampChoix';
import { ChampDate } from './ChampDate';
import { ImageSite } from './ImageSite';
import { vibrerSelection } from './outils';
import { Carte, Icone } from './ui';
import { API } from '@/donnees/config';
import { dateJour, type Langue, type Traduire } from '@/donnees/i18n';
import {
  ADRESSE_MAX, attestationExigee, categorieVehicule, conflitLocation, creneaux, demandeDeSaisie, devisLocation, DUREE_MAX_JOURS, modeChauffeur, nomLieu, plusJours, prixAPartirDe,
  type CodeErreurLocation, type SaisieVoiture,
} from '@/donnees/location';
import { usePreferences } from '@/donnees/preferences';
import { dateISO, fcfa, fiche } from '@/donnees/regles';
import { creerStyles, type Palette } from '@/donnees/theme';
import type { ReglagesLocation, Vehicule } from '@/donnees/types';

export type Occupation = { debut: string; fin: string };

/** Dates déjà prises d'un véhicule (sans nom ni motif) ; null pendant la lecture. */
export function useOccupations(vehiculeId: string) {
  const [occupations, setOccupations] = useState<Occupation[] | null>(null);
  useEffect(() => {
    if (!vehiculeId) { setOccupations(null); return undefined; }
    let actif = true;
    setOccupations(null);
    fetch(`${API}/api/location/disponibilites?vehicule=${encodeURIComponent(vehiculeId)}`, { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(corps => { if (actif) setOccupations(Array.isArray(corps.occupations) ? corps.occupations : []); })
      .catch(() => { if (actif) setOccupations([]); });
    return () => { actif = false; };
  }, [vehiculeId]);
  return occupations;
}

/** Estimation, créneau déjà pris et attestation exigée pour une saisie. */
export function etatVoiture(vehicule: Vehicule | null, reglages: ReglagesLocation | undefined, saisie: SaisieVoiture, occupations: Occupation[] | null) {
  const devis = devisLocation(vehicule, reglages, demandeDeSaisie(saisie));
  const gene = conflitLocation(occupations || [], devis.debut, devis.fin);
  return { devis, gene, attestationRequise: attestationExigee(vehicule, devis.chauffeur) };
}

export function messageErreurLocation(code: CodeErreurLocation, t: Traduire, vehicule: Vehicule | null, reglages: ReglagesLocation | undefined) {
  return ({
    vehicule: t('louer.erreurVehicule'), dates: t('louer.erreurDates'), ordre: t('louer.erreurOrdre'),
    delai: t('louer.erreurDelai', { n: reglages?.delaiMinHeures ?? 12 }), duree: t('louer.erreurDuree', { n: DUREE_MAX_JOURS }),
    minimum: t('louer.erreurMinimum', { n: vehicule?.minDays || 1 }),
    horaires: t('louer.erreurHoraires', { a: reglages?.heureOuverture ?? '07:00', b: reglages?.heureFermeture ?? '20:00' }),
    lieu: t('louer.erreurLieu'), adresse: t('louer.erreurAdresse'), tarif: t('louer.erreurTarif'),
  })[code];
}

export const heureLisible = (iso: string, langue: Langue | string) => {
  try {
    return new Intl.DateTimeFormat({ fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[langue] || 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso));
  } catch { return iso; }
};

/** Liste des véhicules ; `sansVoiture` ajoute le choix « Sans voiture » en tête. */
export function ListeVehicules({ vehicules, choisi, sansVoiture, onChoisir }: {
  vehicules: Vehicule[]; choisi: string; sansVoiture?: boolean; onChoisir: (v: Vehicule | null) => void;
}) {
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  return (
    <View>
      {sansVoiture ? (
        <Pressable onPress={() => { vibrerSelection(); onChoisir(null); }} style={({ pressed }) => [s.choixVehicule, !choisi && s.choixActif, pressed && { opacity: 0.85 }]} accessibilityRole="radio" accessibilityState={{ checked: !choisi }}>
          <View style={[s.vignette, { height: 56 }]}><Icone nom="walk-outline" taille={26} couleur={C.texte3} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.nomVehicule}>{t('devis.sansVoiture')}</Text>
            <Text style={s.detail}>{t('devis.sansVoitureDetail')}</Text>
          </View>
          <Radio C={C} actif={!choisi} />
        </Pressable>
      ) : null}
      {vehicules.map(v => (
        <Pressable key={v.id} onPress={() => { vibrerSelection(); onChoisir(v); }} style={({ pressed }) => [s.choixVehicule, choisi === v.id && s.choixActif, pressed && { opacity: 0.85 }]}
          accessibilityRole="radio" accessibilityState={{ checked: choisi === v.id }} accessibilityLabel={v.name}>
          <View style={s.vignette}>{v.images[0] ? <ImageSite source={v.images[0]} style={{ width: '100%', height: '100%' }} alt={v.name} /> : <Icone nom="car-sport-outline" taille={28} couleur={C.texte3} />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.surtitre}>{categorieVehicule(v.category, langue)}</Text>
            <Text style={s.nomVehicule} numberOfLines={2}>{v.name}</Text>
            <Text style={s.detail}>{modeChauffeur(v.driverMode, langue)}</Text>
            <Text style={s.prix}>{prixAPartirDe(v) ? `${t('ligne.des', { x: fcfa(prixAPartirDe(v)) })} ${t('louer.parJour')}` : t('ligne.surDemande')}</Text>
          </View>
          <Radio C={C} actif={choisi === v.id} />
        </Pressable>
      ))}
    </View>
  );
}

/** Saisie initiale d'un véhicule qu'on vient de choisir : chauffeur imposé coché. */
export const saisiePourVehicule = (saisie: SaisieVoiture, v: Vehicule | null): SaisieVoiture =>
  ({ ...saisie, vehiculeId: v?.id || '', chauffeur: v?.driverMode === 'avec', attestation: false });

/**
 * Détails de la location du véhicule choisi. `sejour` : dates du séjour, que
 * la voiture reprend tant qu'elles ne sont pas changées à la main.
 */
export function DetailsVoiture({ vehicule, reglages, saisie, maj, occupations, sejour, onChanger }: {
  vehicule: Vehicule; reglages: ReglagesLocation; saisie: SaisieVoiture; maj: (modif: Partial<SaisieVoiture>) => void;
  occupations: Occupation[] | null; sejour?: { arrivee: string; depart: string } | null; onChanger?: () => void;
}) {
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const { devis, gene, attestationRequise } = etatVoiture(vehicule, reglages, saisie, occupations);
  const lieux: OptionChoix[] = reglages.lieux.filter(l => l.actif).map(l => [l.id, `${nomLieu(l, langue)} · ${l.frais ? `+${fcfa(l.frais)}` : t('louer.sansFrais')}`, l.precision ? 'create-outline' : 'location-outline']);
  // Lieu « à préciser » (domicile, bureau, autre) : champ d'adresse sous le choix.
  const lieuPrise = reglages.lieux.find(l => l.id === saisie.lieuPrise);
  const lieuRetour = reglages.lieux.find(l => l.id === saisie.lieuRetour);
  const aideAdresse = (id: string) => t(id === 'domicile' ? 'louer.adresseDomicile' : id === 'bureau' ? 'louer.adresseBureau' : 'louer.adresseAutre');
  const optionsHeures: OptionChoix[] = creneaux(reglages).map(h => [h, h, 'time-outline']);

  return (
    <View>
      <Pressable onPress={onChanger ? () => { vibrerSelection(); onChanger(); } : undefined} disabled={!onChanger} style={s.resume} accessibilityRole={onChanger ? 'button' : undefined} accessibilityLabel={onChanger ? t('louer.changerVehicule') : undefined}>
        <View style={s.vignette}>{vehicule.images[0] ? <ImageSite source={vehicule.images[0]} style={{ width: '100%', height: '100%' }} alt={vehicule.name} /> : <Icone nom="car-sport-outline" taille={28} couleur={C.texte3} />}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.surtitre}>{categorieVehicule(vehicule.category, langue)}</Text>
          <Text style={s.nomVehicule} numberOfLines={2}>{vehicule.name}</Text>
          <Text style={s.detail}>{fiche(vehicule, 'tagline', langue) || modeChauffeur(vehicule.driverMode, langue)}</Text>
        </View>
        {onChanger ? <Icone nom="swap-horizontal" taille={20} couleur={C.orTexte} /> : null}
      </Pressable>

      {sejour ? (
        <View style={[s.info, { marginTop: 12 }]}>
          <Icone nom="calendar-outline" taille={18} couleur={C.orTexte} />
          <Text style={[s.infoTexte, { fontWeight: '500' }]}>{saisie.datesLibres ? `${dateJour(saisie.debutJour, langue)} → ${dateJour(saisie.finJour, langue)}` : t('louer.datesSejour')}</Text>
          {saisie.datesLibres ? (
            <Pressable onPress={() => { vibrerSelection(); maj({ datesLibres: false, debutJour: sejour.arrivee, finJour: sejour.depart }); }} hitSlop={8} accessibilityRole="button">
              <Text style={s.lien}>{t('louer.reprendreDates')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={s.h3}>{t('louer.prise')}</Text>
      <View style={s.ligne}>
        <ChampDate libelle={t('louer.prise')} valeur={saisie.debutJour} minimum={dateISO(new Date())}
          onChange={jour => maj({ debutJour: jour, datesLibres: true, ...(saisie.finJour <= jour ? { finJour: plusJours(jour, 1) } : {}) })} />
        <View style={{ flex: 1 }}><ChampChoix libelle={t('louer.heure')} icone="time-outline" valeur={saisie.debutHeure} options={optionsHeures} onChange={debutHeure => maj({ debutHeure })} /></View>
      </View>
      <Text style={s.h3}>{t('louer.retour')}</Text>
      <View style={s.ligne}>
        <ChampDate libelle={t('louer.retour')} valeur={saisie.finJour} minimum={saisie.debutJour} onChange={finJour => maj({ finJour, datesLibres: true })} />
        <View style={{ flex: 1 }}><ChampChoix libelle={t('louer.heure')} icone="time-outline" valeur={saisie.finHeure} options={optionsHeures} onChange={finHeure => maj({ finHeure })} /></View>
      </View>
      <Text style={s.note}>{t('louer.heureAbidjan')} · {dateJour(saisie.debutJour, langue)} → {dateJour(saisie.finJour, langue)}</Text>

      {lieux.length ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          <ChampChoix libelle={t('louer.lieuPrise')} icone="location-outline" valeur={saisie.lieuPrise} options={lieux} onChange={lieuPrise => maj({ lieuPrise })} />
          {lieuPrise?.precision ? (
            <ChampAdresse C={C} libelle={`${t('louer.aPreciser')} · ${t('louer.lieuPrise')}`} aide={aideAdresse(lieuPrise.id)} valeur={saisie.adressePrise} onChange={adressePrise => maj({ adressePrise })} />
          ) : null}
          <ChampChoix libelle={t('louer.lieuRetour')} icone="flag-outline" valeur={saisie.lieuRetour} options={lieux} onChange={lieuRetour => maj({ lieuRetour })} />
          {lieuRetour?.precision ? (
            <ChampAdresse C={C} libelle={`${t('louer.aPreciser')} · ${t('louer.lieuRetour')}`} aide={aideAdresse(lieuRetour.id)} valeur={saisie.adresseRetour} onChange={adresseRetour => maj({ adresseRetour })} />
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        {vehicule.driverMode === 'choix' ? (
          <CaseACocher C={C} coche={saisie.chauffeur} onPress={() => maj({ chauffeur: !saisie.chauffeur })}
            texte={`${t('louer.chauffeurChoix')}${vehicule.driverPricePerDay ? ` (+${fcfa(vehicule.driverPricePerDay)} ${t('louer.parJour')})` : ''}`} />
        ) : (
          <View style={s.info}><Icone nom={vehicule.driverMode === 'avec' ? 'person-outline' : 'key-outline'} taille={18} couleur={C.orTexte} /><Text style={s.infoTexte}>{t(vehicule.driverMode === 'avec' ? 'louer.chauffeurImpose' : 'louer.chauffeurExclu')}</Text></View>
        )}
      </View>

      {reglages.options.some(o => o.actif) ? (
        <>
          <Text style={s.h3}>{t('louer.options')}</Text>
          {reglages.options.filter(o => o.actif).map(o => (
            <CaseACocher key={o.id} C={C} coche={saisie.options.includes(o.id)} onPress={() => maj({ options: saisie.options.includes(o.id) ? saisie.options.filter(x => x !== o.id) : [...saisie.options, o.id] })}
              texte={`${o.nom} · ${fcfa(o.prix)} ${o.unite === 'jour' ? t('louer.parJour') : t('louer.parLocation')}`} />
          ))}
        </>
      ) : null}

      <Carte titre={devis.ok ? `${t('louer.estimation')} · ${t(devis.jours > 1 ? 'louer.jours' : 'louer.jour', { n: devis.jours })}` : t('louer.estimation')} style={{ marginTop: 16 }}>
        {!devis.ok ? <Text style={s.erreur}>{messageErreurLocation(devis.erreurs[0], t, vehicule, reglages)}</Text> : (
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

      {attestationRequise ? (
        <View style={{ marginTop: 10 }}>
          <CaseACocher C={C} coche={saisie.attestation} onPress={() => maj({ attestation: !saisie.attestation })} texte={t('louer.attestation', { age: vehicule.minAge || 21, n: vehicule.licenseYears || 0 })} />
        </View>
      ) : null}
    </View>
  );
}

function ChampAdresse({ C, libelle, aide, valeur, onChange }: { C: Palette; libelle: string; aide: string; valeur: string; onChange: (v: string) => void }) {
  const s = feuille(C);
  const [focus, setFocus] = useState(false);
  return (
    <View>
      <Text style={s.champLibelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={aide}
        placeholderTextColor={C.texte3}
        maxLength={ADRESSE_MAX}
        autoComplete="street-address"
        autoCapitalize="sentences"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.champ, focus && { borderColor: C.sombre ? C.or : '#151837' }]}
      />
    </View>
  );
}

function Radio({ C, actif }: { C: Palette; actif: boolean }) {
  const s = feuille(C);
  return <View style={[s.radio, actif && s.radioActif]}>{actif ? <View style={s.radioPoint} /> : null}</View>;
}

export function CaseACocher({ C, coche, texte, onPress }: { C: Palette; coche: boolean; texte: string; onPress: () => void }) {
  const s = feuille(C);
  return (
    <Pressable onPress={() => { vibrerSelection(); onPress(); }} style={s.case} accessibilityRole="checkbox" accessibilityState={{ checked: coche }}>
      <View style={[s.caseBoite, coche && s.caseActive]}>{coche ? <Icone nom="checkmark" taille={16} couleur="#fff" /> : null}</View>
      <Text style={[s.caseTexte, coche && { color: C.texte }]}>{texte}</Text>
    </Pressable>
  );
}

const feuille = creerStyles(C => ({
  h3: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: C.texte2, marginTop: 18, marginBottom: 8 },
  choixVehicule: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 10, borderRadius: 18, backgroundColor: C.carte, borderWidth: 2, borderColor: 'transparent', boxShadow: C.ombre },
  choixActif: { borderColor: C.sombre ? C.or : '#151837' },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, backgroundColor: C.carte, boxShadow: C.ombre },
  vignette: { width: 88, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: C.vignette, alignItems: 'center', justifyContent: 'center' },
  surtitre: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: C.orTexte },
  nomVehicule: { fontSize: 16, fontWeight: '800', color: C.texte },
  detail: { fontSize: 12.5, color: C.texte2, marginTop: 2 },
  prix: { fontSize: 13.5, fontWeight: '800', color: C.marque, marginTop: 4 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.texte3, alignItems: 'center', justifyContent: 'center' },
  radioActif: { borderColor: C.sombre ? C.or : '#151837' },
  radioPoint: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.sombre ? C.or : '#151837' },
  ligne: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  note: { fontSize: 12.5, color: C.texte3, marginTop: 6, lineHeight: 18 },
  noteForte: { fontSize: 13, fontWeight: '700', color: C.texte2 },
  lien: { fontSize: 13, fontWeight: '800', color: C.orTexte },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.surface },
  infoTexte: { flex: 1, fontSize: 14, fontWeight: '600', color: C.texte },
  ligneDevis: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  ligneLibelle: { flex: 1, fontSize: 13.5, color: C.texte2 },
  ligneMontant: { fontSize: 13.5, fontWeight: '700', color: C.texte },
  total: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.bord },
  totalLibelle: { fontSize: 15.5, fontWeight: '800', color: C.texte },
  totalMontant: { fontSize: 17, fontWeight: '800', color: C.marque },
  erreur: { fontSize: 14, fontWeight: '700', color: C.danger, marginTop: 4 },
  case: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  caseBoite: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.bord, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  caseActive: { backgroundColor: C.primaire, borderColor: C.primaire },
  caseTexte: { flex: 1, fontSize: 14.5, lineHeight: 21, color: C.texte2 },
  champLibelle: { fontSize: 12.5, fontWeight: '700', color: C.texte2, marginBottom: 6, marginLeft: 4 },
  champ: { minHeight: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.carte, fontSize: 16, color: C.texte },
}));
