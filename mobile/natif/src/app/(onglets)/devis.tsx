/**
 * Demande de devis. Même calcul, même message WhatsApp et même demande
 * enregistrée (POST /api/leads) que le simulateur du site.
 *   · Séjour en résidence : Projet (résidence) → Dates & voyageurs → Activités → Voiture → Coordonnées ;
 *   · Activités uniquement : Projet (activités) → Dates & voyageurs → Voiture → Coordonnées ;
 *   · Voiture seule : Projet → Voiture → Coordonnées.
 * L'étape « Voiture » (19/09/2026) est facultative (« Sans voiture » par défaut)
 * et n'existe que si des véhicules sont publiés. La voiture reprend les dates
 * du séjour, modifiables. Une seule demande part au site, voiture comprise.
 */
import { useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChampDate } from '@/composants/ChampDate';
import { ImageSite } from '@/composants/ImageSite';
import { ouvrirLien, vibrerErreur, vibrerImpact, vibrerSelection } from '@/composants/outils';
import { Squelettes } from '@/composants/Squelettes';
import { EnTete } from '@/composants/EnTete';
import { DetailsVoiture, etatVoiture, ListeVehicules, messageErreurLocation, saisiePourVehicule, useOccupations } from '@/composants/EtapeVoiture';
import { Bouton, Carte, EtatVide, Icone, Puce, type NomIcone } from '@/composants/ui';
import { API } from '@/donnees/config';
import { modeChauffeur, type SaisieVoiture } from '@/donnees/location';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import {
  calculDevis, champEnDefaut, dateISO, estIndisponible, euro, fcfa, fiche, FILTRES_VILLA, nombre, prixActivite, villasFiltrees, voitureDuDevis, VOYAGEURS,
} from '@/donnees/regles';
import { creerStyles, type Palette } from '@/donnees/theme';

type Etape = 'projet' | 'dates' | 'activites' | 'voiture' | 'coordonnees';
type ErreurDevis = 'nom' | 'tel' | 'activite' | 'voiture' | 'estimation' | 'occupe' | 'attestation' | 'serveur';

function parcoursDe(mode: 'sejour' | 'activites' | 'voiture', avecVehicules: boolean): Etape[] {
  if (mode === 'voiture') return ['projet', 'voiture', 'coordonnees'];
  const voiture: Etape[] = avecVehicules ? ['voiture'] : [];
  return mode === 'sejour' ? ['projet', 'dates', 'activites', ...voiture, 'coordonnees'] : ['projet', 'dates', ...voiture, 'coordonnees'];
}

export default function Devis() {
  const router = useRouter();
  const { donnees, devis, majDevis, memoriserCoordonnees, ajouterDemande, actualiser } = useMagasin();
  const { C, t, langue, notifications, assurerNotifications } = usePreferences();
  const s = feuille(C);
  const defil = useRef<ScrollView>(null);
  const [sens, setSens] = useState(1);
  const [erreur, setErreur] = useState<ErreurDevis | null>(null);
  const [erreurServeur, setErreurServeur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // Tirer vers le bas pour recharger villas, activités et tarifs (étapes 1 et 3).
  const [tire, setTire] = useState(false);
  // Dates déjà prises du véhicule choisi (étape « Voiture »).
  const occupations = useOccupations(devis.voiture.vehiculeId);

  if (!donnees || !devis.pret) {
    return (
      <View style={s.ecran}>
        <EnTete titre={t('devis.titre')} sousTitre={t('devis.sousTitre')} />
        <View style={{ padding: 16 }}><Squelettes nombre={3} /></View>
      </View>
    );
  }

  const c = calculDevis(donnees, devis, { t, langue });
  const avecVehicules = donnees.vehicules.length > 0;
  const parcours = parcoursDe(devis.mode === 'voiture' && !avecVehicules ? 'activites' : devis.mode, avecVehicules);
  const nbEtapes = parcours.length;
  const etape = Math.max(1, Math.min(nbEtapes, devis.etape));
  const cleEtape = parcours[etape - 1];
  const aujourdhui = dateISO(new Date());
  const titresEtapes: Record<Etape, string> = { projet: t('devis.etape1'), dates: t('devis.etape2'), activites: t('devis.etape3'), voiture: t('devis.etapeVoiture'), coordonnees: t('devis.etape4') };
  const { vehicule, saisie: saisieVoiture } = voitureDuDevis(donnees, devis);
  const etatDeLaVoiture = vehicule ? etatVoiture(vehicule, donnees.location, saisieVoiture, occupations) : null;
  // Modifications de la voiture : appliquées à la saisie effective (dates du séjour reprises).
  const majVoiture = (modif: Partial<SaisieVoiture>) => {
    if (erreur && ['voiture', 'estimation', 'occupe', 'attestation', 'serveur'].includes(erreur)) setErreur(null);
    majDevis(d => ({ voiture: { ...voitureDuDevis(donnees, d).saisie, ...modif } }));
  };
  /** Voiture incomplète : véhicule manquant (voiture seule), estimation impossible, dates prises, attestation. */
  const voitureEnDefaut = (): ErreurDevis | null => {
    if (!vehicule) return devis.mode === 'voiture' ? 'voiture' : null;
    if (!etatDeLaVoiture) return null;
    if (!etatDeLaVoiture.devis.ok) return 'estimation';
    if (etatDeLaVoiture.gene) return 'occupe';
    if (etatDeLaVoiture.attestationRequise && !saisieVoiture.attestation) return 'attestation';
    return null;
  };
  const suiviPossible = notifications !== 'indisponible' && notifications !== 'nonConfigure';

  const changerEtape = (delta: number) => {
    // Activités uniquement : au moins une activité avant d'aller plus loin.
    if (delta > 0 && cleEtape === 'projet' && devis.mode === 'activites' && !devis.activites.length) {
      setErreur('activite');
      vibrerErreur();
      return;
    }
    // Étape « Voiture » : une voiture choisie doit pouvoir être estimée et réservée.
    const defautVoiture = delta > 0 && cleEtape === 'voiture' ? voitureEnDefaut() : null;
    if (defautVoiture) {
      setErreur(defautVoiture);
      vibrerErreur();
      setTimeout(() => defil.current?.scrollToEnd({ animated: true }), 50);
      return;
    }
    vibrerSelection();
    setSens(delta);
    setErreur(null);
    majDevis({ etape: Math.max(1, Math.min(nbEtapes, etape + delta)) });
    defil.current?.scrollTo({ y: 0, animated: false });
  };

  // Liste des activités publiées, à cocher (étape 1 sans hébergement, étape 3 avec).
  const listeActivites = donnees.activites.length ? donnees.activites.map(a => {
    const prix = prixActivite(a);
    const suffixe = prix.parJour ? ` ${t('tarif.jour')}` : prix.parPersonne ? ` ${t('tarif.personne')}` : '';
    const groupe = prix.forfaitGroupe ? ` · ${nombre(prix.forfaitGroupe.montant)} FCFA ${t('tarif.groupe')} ${prix.forfaitGroupe.taille}` : '';
    const coche = devis.activites.includes(a.id);
    const duree = fiche(a, 'duration', langue);
    return (
      <Option
        key={a.id}
        C={C}
        image={a.image}
        titre={fiche(a, 'title', langue)}
        detail={<>{duree ? `${duree} · ` : ''}<Text style={s.montant}>{prix.montant > 0 ? `+ ${nombre(prix.montant)} FCFA${suffixe}${groupe}` : t('devis.surDevis')}</Text></>}
        actif={coche}
        forme="case"
        onPress={() => { if (erreur === 'activite') setErreur(null); majDevis(d => ({ activites: coche ? d.activites.filter(x => x !== a.id) : [...d.activites, a.id] })); }}
      />
    );
  }) : <EtatVide icone="boat-outline" titre={t('devis.aucuneActivite')} />;

  const envoyer = async () => {
    setErreurServeur('');
    const defautVoiture = voitureEnDefaut();
    if (defautVoiture && parcours.includes('voiture')) {
      // Retour à l'étape « Voiture » pour corriger.
      setErreur(defautVoiture);
      vibrerErreur();
      majDevis({ etape: parcours.indexOf('voiture') + 1 });
      return;
    }
    const defaut = champEnDefaut(devis);
    if (defaut) {
      setErreur(defaut);
      vibrerErreur();
      return;
    }
    setEnvoi(true);
    // Suivi par notification : l'autorisation n'est demandée qu'à ce moment-là.
    const suivi = suiviPossible && devis.suiviNotif ? await assurerNotifications() : { actif: false, jeton: null };
    const demande = calculDevis(donnees, devis, { appareil: suivi.jeton, langue });
    let enregistree = false;
    let idDemande: string | undefined;
    let statut: string | undefined;
    try {
      const reponse = await Promise.race([
        fetch(`${API}/api/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(demande.lead) }),
        new Promise<never>((_, rejet) => setTimeout(() => rejet(new Error('délai')), 9000)),
      ]);
      enregistree = reponse.ok;
      // Identifiant de la demande : permet d'afficher son statut dans « Mes demandes ».
      const corps = (await reponse.json().catch(() => null)) as { error?: string; lead?: { id?: string; status?: string } } | null;
      // Voiture refusée par le site (dates prises entre-temps, attestation…) : on corrige avant d'envoyer.
      if ((reponse.status === 409 || reponse.status === 422) && corps?.error) {
        setEnvoi(false);
        vibrerErreur();
        setErreur('serveur');
        setErreurServeur(corps.error);
        setTimeout(() => defil.current?.scrollToEnd({ animated: true }), 50);
        return;
      }
      idDemande = corps?.lead?.id;
      statut = corps?.lead?.status;
    } catch { /* hors ligne : le message WhatsApp contient toute la demande */ }
    setEnvoi(false);
    memoriserCoordonnees();
    ajouterDemande({
      le: new Date().toISOString(),
      objet: [demande.voitureSeule ? '' : demande.sansResidence ? t('devis.activitesSeules') : demande.villa?.name || '', demande.voiture ? demande.voiture.vehicule.name : '']
        .filter(Boolean).join(' + '),
      dates: demande.voitureSeule ? demande.lead.dates : `${devis.arrivee} → ${devis.depart}`,
      voyageurs: demande.voitureSeule && demande.voiture ? modeChauffeur(demande.voiture.estimation.chauffeur ? 'avec' : 'sans', langue) : t('devis.personnes', { n: devis.voyageurs }),
      total: fcfa(demande.total),
      enregistree,
      lien: demande.lien,
      id: idDemande,
      statut: statut || (enregistree ? 'nouveau' : undefined),
      suivi: suivi.actif,
    });
    router.push({ pathname: '/envoye', params: { enregistree: enregistree ? '1' : '0', total: fcfa(demande.total), lien: demande.lien } });
    ouvrirLien(demande.lien, t);
    majDevis({ etape: 1 });
  };

  let contenu: ReactNode = null;
  if (cleEtape === 'projet') {
    const liste = villasFiltrees(donnees.villas, devis.filtre);
    const filtres = FILTRES_VILLA.filter(f => donnees.villas.some(f.test));
    contenu = (
      <>
        <Text style={s.h2}>{t('devis.quoi')}</Text>
        <Text style={s.aide}>{t('devis.aideEstimation')}</Text>
        <View style={s.modes}>
          <Choix C={C} icone="home-outline" titre={t('devis.sejour')} detail={t('devis.sejourDetail')} actif={devis.mode === 'sejour'} desactive={!donnees.villas.length} onPress={() => { setErreur(null); majDevis({ mode: 'sejour' }); }} />
          <Choix C={C} icone="boat-outline" titre={t('devis.activitesSeules')} detail={t('devis.sansHebergement')} actif={devis.mode === 'activites'} onPress={() => { setErreur(null); majDevis({ mode: 'activites' }); }} />
        </View>
        {avecVehicules ? (
          <View style={[s.modes, { marginTop: 10 }]}>
            <Choix C={C} icone="car-sport-outline" titre={t('devis.voitureSeule')} detail={t('devis.voitureSeuleDetail')} actif={devis.mode === 'voiture'} onPress={() => { setErreur(null); majDevis({ mode: 'voiture' }); }} />
          </View>
        ) : null}
        {devis.mode === 'voiture' ? (
          <View style={[s.info, { marginTop: 16 }]}>
            <Icone nom="information-circle-outline" taille={18} couleur={C.marque} />
            <Text style={[s.infoTexte, { fontWeight: '500' }]}>{t('devis.voitureSeuleAide')}</Text>
          </View>
        ) : null}
        {devis.mode === 'activites' ? (
          <>
            <Text style={s.h3}>{t('devis.choisirActivites')}</Text>
            {erreur === 'activite' ? (
              <View style={[s.alerte, { backgroundColor: C.dangerPale, marginTop: 0, marginBottom: 10 }]}>
                <Icone nom="alert-circle-outline" taille={18} couleur={C.danger} />
                <Text style={[s.alerteTexte, { color: C.danger }]}>{t('devis.erreurActivite')}</Text>
              </View>
            ) : null}
            {listeActivites}
          </>
        ) : null}
        {devis.mode === 'sejour' ? (
          <>
            <Text style={s.h3}>{t('devis.residence')}</Text>
            {filtres.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                {filtres.map(f => (
                  <Puce key={f.value} texte={t(`devis.filtre.${f.value}` as 'devis.filtre.all')} compte={donnees.villas.filter(f.test).length} actif={devis.filtre === f.value}
                    onPress={() => majDevis(d => {
                      const suivante = villasFiltrees(donnees.villas, f.value);
                      const garde = suivante.some(v => v.id === d.villaId && !estIndisponible(v));
                      return { filtre: f.value, villaId: garde ? d.villaId : (suivante.find(v => !estIndisponible(v))?.id || d.villaId) };
                    })} />
                ))}
              </ScrollView>
            ) : null}
            {liste.map(v => (
              <Option
                key={v.id}
                C={C}
                image={v.images[0]}
                titre={v.name}
                detail={<><Text style={s.montant}>{t('devis.parNuit', { x: fcfa(v.pricePerNight) })}</Text>{v.capacity ? t('devis.jusquA', { n: v.capacity }) : ''}{estIndisponible(v) ? t('devis.indispo') : ''}</>}
                actif={v.id === devis.villaId}
                desactive={estIndisponible(v)}
                forme="radio"
                onPress={() => majDevis({ villaId: v.id })}
              />
            ))}
          </>
        ) : null}
      </>
    );
  } else if (cleEtape === 'dates') {
    const capacite = c.villa ? Number(c.villa.capacity) : 0;
    const depasse = !c.sansResidence && c.villa && capacite > 0 && c.personnes > capacite;
    const rang = VOYAGEURS.indexOf(devis.voyageurs);
    contenu = (
      <>
        <Text style={s.h2}>{t('devis.dates')}</Text>
        <Text style={s.aide}>{c.sansResidence ? t('devis.periode') : t('devis.sejourA', { x: c.villa?.name ?? '' })}</Text>
        <View style={s.dates}>
          <ChampDate
            libelle={c.sansResidence ? t('devis.debut') : t('devis.arrivee')}
            valeur={devis.arrivee}
            minimum={aujourdhui}
            onChange={arrivee => majDevis(d => {
              if (d.depart && d.depart > arrivee) return { arrivee };
              const lendemain = new Date(`${arrivee}T12:00:00`);
              lendemain.setDate(lendemain.getDate() + 1);
              return { arrivee, depart: dateISO(lendemain) };
            })}
          />
          <ChampDate libelle={c.sansResidence ? t('devis.fin') : t('devis.depart')} valeur={devis.depart} minimum={devis.arrivee} onChange={depart => majDevis({ depart })} />
        </View>
        <View style={s.info}>
          <Icone nom="moon-outline" taille={17} couleur={C.marque} />
          <Text style={s.infoTexte}>{c.sansResidence ? t(c.jours > 1 ? 'devis.journees' : 'devis.journee', { n: c.jours }) : t(c.jours > 1 ? 'devis.nuits' : 'devis.nuit', { n: c.jours })}</Text>
        </View>

        <Text style={s.h3}>{t('devis.voyageurs')}</Text>
        <View style={s.compteur}>
          <View style={{ flex: 1 }}>
            <Text style={s.compteurTitre}>{t('devis.personnes', { n: devis.voyageurs })}</Text>
            <Text style={s.compteurDetail}>{devis.voyageurs === '15+' ? t('devis.grandGroupe') : devis.voyageurs === '2' ? t('devis.couple') : t('devis.adultesEnfants')}</Text>
          </View>
          <BoutonCompteur C={C} icone="remove" libelle={t('devis.moins')} desactive={rang <= 0} onPress={() => majDevis({ voyageurs: VOYAGEURS[rang - 1] })} />
          <Text style={s.compteurValeur}>{devis.voyageurs}</Text>
          <BoutonCompteur C={C} icone="add" libelle={t('devis.plus')} desactive={rang >= VOYAGEURS.length - 1} onPress={() => majDevis({ voyageurs: VOYAGEURS[rang + 1] })} />
        </View>
        {depasse ? (
          <View style={s.alerte}>
            <Icone nom="warning-outline" taille={18} couleur={C.alerte} />
            <Text style={s.alerteTexte}>{t('devis.capacite', { villa: c.villa?.name ?? '', cap: capacite, n: c.personnes })}</Text>
          </View>
        ) : null}
      </>
    );
  } else if (cleEtape === 'voiture') {
    const seule = devis.mode === 'voiture';
    const messageVoiture = erreur === 'voiture' ? t('devis.erreurVoiture')
      : erreur === 'estimation' && etatDeLaVoiture ? messageErreurLocation(etatDeLaVoiture.devis.erreurs[0], t, vehicule, donnees.location)
        : erreur === 'occupe' ? t('louer.occupe')
          : erreur === 'attestation' ? t('louer.attestationRequise') : '';
    contenu = (
      <>
        <Text style={s.h2}>{seule ? t('devis.voitureSeuleTitre') : t('devis.voitureTitre')}</Text>
        <Text style={s.aide}>{seule ? t('devis.voitureDetail') : t('devis.voitureAide')}</Text>
        {vehicule ? (
          <DetailsVoiture vehicule={vehicule} reglages={donnees.location} saisie={saisieVoiture} maj={majVoiture} occupations={occupations}
            sejour={seule ? null : { arrivee: devis.arrivee, depart: devis.depart }} onChanger={() => majVoiture({ vehiculeId: '' })} />
        ) : (
          <ListeVehicules vehicules={donnees.vehicules} choisi="" sansVoiture={!seule}
            onChoisir={v => { if (v) majVoiture(saisiePourVehicule(saisieVoiture, v)); }} />
        )}
        {messageVoiture ? (
          <View style={[s.alerte, { backgroundColor: C.dangerPale }]}>
            <Icone nom="alert-circle-outline" taille={18} couleur={C.danger} />
            <Text style={[s.alerteTexte, { color: C.danger }]}>{messageVoiture}</Text>
          </View>
        ) : null}
      </>
    );
  } else if (cleEtape === 'activites') {
    contenu = (
      <>
        <Text style={s.h2}>{t('devis.activitesTitre')}</Text>
        <Text style={s.aide}>{t('devis.activitesAide')}</Text>
        {listeActivites}
      </>
    );
  } else {
    contenu = (
      <>
        <Text style={s.h2}>{t('devis.coordonnees')}</Text>
        <Text style={s.aide}>{t('devis.coordAide')}</Text>
        <Champ C={C} libelle={t('devis.nom')} requis valeur={devis.nom} enDefaut={erreur === 'nom'} placeholder={t('devis.exNom')} autoComplete="name"
          onChange={nom => { majDevis({ nom }); if (erreur === 'nom') setErreur(null); }} />
        <Champ C={C} libelle={t('devis.tel')} requis valeur={devis.tel} enDefaut={erreur === 'tel'} placeholder={t('devis.exTel')} clavier="phone-pad" autoComplete="tel"
          onChange={tel => { majDevis({ tel }); if (erreur === 'tel') setErreur(null); }} />
        <Champ C={C} libelle={t('devis.email')} valeur={devis.email} placeholder={t('devis.exEmail')} clavier="email-address" autoComplete="email"
          onChange={email => majDevis({ email })} />

        <CaseACocher C={C} coche={devis.optin} texte={t('devis.optin')} onPress={() => majDevis({ optin: !devis.optin })} />
        {suiviPossible ? <CaseACocher C={C} coche={devis.suiviNotif} texte={t('devis.suiviNotif')} icone="notifications-outline" onPress={() => majDevis({ suiviNotif: !devis.suiviNotif })} /> : null}

        {erreur === 'nom' || erreur === 'tel' ? (
          <View style={[s.alerte, { backgroundColor: C.dangerPale }]}>
            <Icone nom="alert-circle-outline" taille={18} couleur={C.danger} />
            <Text style={[s.alerteTexte, { color: C.danger }]}>{erreur === 'nom' ? t('devis.erreurNom') : t('devis.erreurTel')}</Text>
          </View>
        ) : null}

        {erreur === 'serveur' && erreurServeur ? (
          <View style={[s.alerte, { backgroundColor: C.dangerPale }]}>
            <Icone nom="alert-circle-outline" taille={18} couleur={C.danger} />
            <Text style={[s.alerteTexte, { color: C.danger }]}>{erreurServeur}</Text>
          </View>
        ) : null}

        <Text style={s.h3}>{t('devis.recap')}</Text>
        <Carte style={{ marginTop: 0 }}>
          {c.voitureSeule ? null : (
            <LigneRecap
              C={C}
              libelle={c.sansResidence ? t('devis.activitesSeules') : c.villa?.name || ''}
              detail={c.sansResidence
                ? t('devis.joursPers', { jours: t(c.jours > 1 ? 'devis.journees' : 'devis.journee', { n: c.jours }), n: devis.voyageurs })
                : t('devis.nuitsPers', { x: fcfa(c.villa?.pricePerNight || 0), nuits: t(c.jours > 1 ? 'devis.nuits' : 'devis.nuit', { n: c.jours }), n: devis.voyageurs })}
              montant={fcfa(c.sousTotalVilla)}
            />
          )}
          {c.lignes.map(l => <LigneRecap C={C} key={l.libelle} libelle={l.libelle} detail={l.calcul} montant={l.montant === null ? t('devis.surDevis') : fcfa(l.montant)} />)}
          {c.voiture ? (
            <LigneRecap C={C} libelle={c.voiture.vehicule.name}
              detail={t('devis.recapVoiture', { jours: t(c.voiture.estimation.jours > 1 ? 'louer.jours' : 'louer.jour', { n: c.voiture.estimation.jours }), formule: modeChauffeur(c.voiture.estimation.chauffeur ? 'avec' : 'sans', langue) })}
              montant={c.voiture.estimation.ok ? fcfa(c.voiture.montant) : t('devis.surDevis')} />
          ) : null}
          <View style={s.total}>
            <Text style={s.totalLibelle}>{t('devis.estimationTotale')}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.totalMontant}>{fcfa(c.total)}</Text>
              <Text style={s.totalEuro}>{euro(c.totalEuro)}</Text>
            </View>
          </View>
        </Carte>
        <Text style={s.mention}>{t('devis.mention')}</Text>
      </>
    );
  }

  return (
    <View style={s.ecran}>
      <EnTete titre={t('devis.titre')} retour={() => (etape > 1 ? changerEtape(-1) : router.navigate('/'))}>
        <View style={s.progression}>
          {parcours.map((cle, i) => <View key={cle} style={[s.barreProgression, i < etape && s.barreFaite]} />)}
        </View>
        <View style={s.etapeLigne}>
          <Text style={s.etapeTexte}>{t('devis.etape', { n: etape, total: nbEtapes })}</Text>
          <Text style={s.etapeTexte}>{titresEtapes[cleEtape]}</Text>
        </View>
      </EnTete>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView
          ref={defil}
          contentContainerStyle={s.contenu}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={cleEtape === 'projet' || cleEtape === 'activites'
            ? <RefreshControl refreshing={tire} tintColor={C.marque} colors={['#151837']} onRefresh={async () => { setTire(true); await actualiser(); setTire(false); }} />
            : undefined}>
          <Animated.View key={cleEtape} entering={Platform.OS === 'web' ? FadeIn : (sens > 0 ? SlideInRight : SlideInLeft).duration(280)}>
            {contenu}
          </Animated.View>
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={s.barreConteneur}>
          <View style={s.barre}>
            {etape > 1 ? (
              <Pressable onPress={() => changerEtape(-1)} style={s.retour} accessibilityRole="button" accessibilityLabel={t('devis.precedente')}>
                <Icone nom="chevron-back" taille={22} couleur="#fff" />
              </Pressable>
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.barreLibelle}>{t('devis.estimation')}</Text>
              <Text style={s.barreTotal} numberOfLines={1} adjustsFontSizeToFit>{fcfa(c.total)}</Text>
            </View>
            {etape < nbEtapes
              ? <Bouton texte={t('devis.continuer')} variante="or" onPress={() => changerEtape(1)} style={s.barreBouton} />
              : <Bouton texte={t('devis.envoyer')} icone="logo-whatsapp" variante="wa" charge={envoi} onPress={() => { vibrerImpact(); envoyer(); }} style={s.barreBouton} />}
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Choix({ C, icone, titre, detail, actif, desactive, onPress }: { C: Palette; icone: NomIcone; titre: string; detail: string; actif: boolean; desactive?: boolean; onPress: () => void }) {
  const s = feuille(C);
  return (
    <Pressable
      onPress={() => { vibrerSelection(); onPress(); }}
      disabled={desactive}
      accessibilityRole="radio"
      accessibilityState={{ checked: actif, disabled: desactive }}
      style={({ pressed }) => [s.choix, actif && s.choixActif, desactive && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.98 }] }]}>
      <Icone nom={icone} taille={26} couleur={C.orTexte} />
      <Text style={s.choixTitre}>{titre}</Text>
      <Text style={s.choixDetail}>{detail}</Text>
    </Pressable>
  );
}

function Option({ C, image, titre, detail, actif, desactive, forme, onPress }: {
  C: Palette; image?: string; titre: string; detail: ReactNode; actif: boolean; desactive?: boolean; forme: 'radio' | 'case'; onPress: () => void;
}) {
  const s = feuille(C);
  return (
    <Pressable
      onPress={() => { vibrerSelection(); onPress(); }}
      disabled={desactive}
      accessibilityRole={forme === 'radio' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: actif, disabled: desactive }}
      style={({ pressed }) => [s.option, actif && s.optionActive, desactive && { opacity: 0.45 }, pressed && { opacity: 0.9 }]}>
      <View style={s.optionImage}><ImageSite source={image} style={{ width: '100%', height: '100%' }} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.optionTitre} numberOfLines={2}>{titre}</Text>
        <Text style={s.optionDetail}>{detail}</Text>
      </View>
      {forme === 'radio'
        ? <View style={[s.radio, actif && s.radioActif]}>{actif ? <View style={s.radioPoint} /> : null}</View>
        : <View style={[s.case, actif && s.caseActive]}>{actif ? <Icone nom="checkmark" taille={16} couleur="#fff" /> : null}</View>}
    </Pressable>
  );
}

function CaseACocher({ C, coche, texte, icone, onPress }: { C: Palette; coche: boolean; texte: string; icone?: NomIcone; onPress: () => void }) {
  const s = feuille(C);
  return (
    <Pressable onPress={() => { vibrerSelection(); onPress(); }} style={s.optin} accessibilityRole="checkbox" accessibilityState={{ checked: coche }}>
      <View style={[s.case, coche && s.caseActive]}>{coche ? <Icone nom="checkmark" taille={16} couleur="#fff" /> : null}</View>
      <Text style={[s.optinTexte, coche && { color: C.texte }]}>{texte}</Text>
      {icone ? <Icone nom={icone} taille={18} couleur={C.texte3} /> : null}
    </Pressable>
  );
}

function BoutonCompteur({ C, icone, libelle, desactive, onPress }: { C: Palette; icone: NomIcone; libelle: string; desactive: boolean; onPress: () => void }) {
  const s = feuille(C);
  return (
    <Pressable onPress={() => { vibrerSelection(); onPress(); }} disabled={desactive} style={[s.boutonCompteur, desactive && { opacity: 0.35 }]} accessibilityRole="button" accessibilityLabel={libelle}>
      <Icone nom={icone} taille={20} couleur={C.marque} />
    </Pressable>
  );
}

function Champ({ C, libelle, valeur, onChange, placeholder, requis, enDefaut, clavier, autoComplete }: {
  C: Palette; libelle: string; valeur: string; onChange: (v: string) => void; placeholder: string; requis?: boolean; enDefaut?: boolean;
  clavier?: 'phone-pad' | 'email-address'; autoComplete?: 'name' | 'tel' | 'email';
}) {
  const s = feuille(C);
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.champLibelle}>{libelle}{requis ? <Text style={{ color: C.danger }}> *</Text> : null}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.texte3}
        keyboardType={clavier}
        autoComplete={autoComplete}
        autoCapitalize={clavier ? 'none' : 'words'}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[s.champ, focus && { borderColor: C.sombre ? C.or : '#151837' }, enDefaut && { borderColor: C.danger }]}
      />
    </View>
  );
}

function LigneRecap({ C, libelle, detail, montant }: { C: Palette; libelle: string; detail: string; montant: string }) {
  const s = feuille(C);
  return (
    <View style={s.recap}>
      <View style={{ flex: 1 }}>
        <Text style={s.recapLibelle}>{libelle}</Text>
        <Text style={s.recapDetail}>{detail}</Text>
      </View>
      <Text style={s.recapMontant}>{montant}</Text>
    </View>
  );
}

const feuille = creerStyles(C => ({
  ecran: { flex: 1, backgroundColor: C.fond },
  progression: { flexDirection: 'row', gap: 6, marginTop: 14 },
  barreProgression: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.progression },
  barreFaite: { backgroundColor: C.or },
  etapeLigne: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  etapeTexte: { color: C.enteteTexte2, fontSize: 12.5, fontWeight: '700' },
  contenu: { padding: 16, paddingBottom: 28 },
  h2: { fontSize: 22, fontWeight: '800', color: C.texte, letterSpacing: -0.3 },
  h3: { fontSize: 15, fontWeight: '800', color: C.texte, marginTop: 20, marginBottom: 10 },
  aide: { fontSize: 14.5, color: C.texte2, marginTop: 4, marginBottom: 14 },
  modes: { flexDirection: 'row', gap: 10 },
  choix: { flex: 1, gap: 5, padding: 14, borderRadius: 16, backgroundColor: C.carte, borderWidth: 2, borderColor: 'transparent', boxShadow: C.ombre },
  choixActif: { borderColor: C.sombre ? C.or : '#151837' },
  choixTitre: { fontSize: 14.5, fontWeight: '700', color: C.texte },
  choixDetail: { fontSize: 12, color: C.texte2 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 8, borderRadius: 16, backgroundColor: C.carte, borderWidth: 2, borderColor: 'transparent', boxShadow: C.ombre },
  optionActive: { borderColor: C.sombre ? C.or : '#151837' },
  optionImage: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: C.vignette },
  optionTitre: { fontSize: 14.5, fontWeight: '700', color: C.texte, lineHeight: 19 },
  optionDetail: { fontSize: 12.5, color: C.texte2, marginTop: 2 },
  montant: { color: C.orTexte, fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.texte3, alignItems: 'center', justifyContent: 'center' },
  radioActif: { borderColor: C.sombre ? C.or : '#151837' },
  radioPoint: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.sombre ? C.or : '#151837' },
  case: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: C.texte3, alignItems: 'center', justifyContent: 'center' },
  caseActive: { backgroundColor: C.primaire, borderColor: C.primaire },
  dates: { flexDirection: 'row', gap: 10 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: C.orPale },
  infoTexte: { fontSize: 14, fontWeight: '700', color: C.marque },
  compteur: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingLeft: 16, borderRadius: 14, backgroundColor: C.carte, boxShadow: C.ombre },
  compteurTitre: { fontSize: 16, fontWeight: '700', color: C.texte },
  compteurDetail: { fontSize: 12.5, color: C.texte2 },
  compteurValeur: { minWidth: 34, textAlign: 'center', fontSize: 17, fontWeight: '800', color: C.texte },
  boutonCompteur: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: C.bord, alignItems: 'center', justifyContent: 'center' },
  alerte: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: C.alertePale },
  alerteTexte: { flex: 1, fontSize: 13.5, lineHeight: 19, color: C.alerte },
  champLibelle: { fontSize: 12.5, fontWeight: '700', color: C.texte2, marginBottom: 6, marginLeft: 4 },
  champ: { height: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.bord, backgroundColor: C.carte, fontSize: 16, color: C.texte },
  optin: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, marginTop: 2, marginBottom: 8, borderRadius: 12, backgroundColor: C.carte, boxShadow: C.ombre },
  optinTexte: { flex: 1, fontSize: 13, lineHeight: 18, color: C.texte2 },
  recap: { flexDirection: 'row', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.bord },
  recapLibelle: { fontSize: 14, fontWeight: '600', color: C.texte },
  recapDetail: { fontSize: 12, color: C.texte3, marginTop: 1 },
  recapMontant: { fontSize: 14, fontWeight: '700', color: C.texte },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  totalLibelle: { fontSize: 14, color: C.texte2, fontWeight: '600' },
  totalMontant: { fontSize: 22, fontWeight: '800', color: C.marque },
  totalEuro: { fontSize: 12.5, color: C.texte2 },
  mention: { fontSize: 12.5, color: C.texte3, marginTop: 10, lineHeight: 18 },
  barreConteneur: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: 'transparent' },
  barre: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 7, paddingLeft: 16, borderRadius: 999, backgroundColor: C.sombre ? '#262a55' : '#151837', boxShadow: C.ombreForte, marginBottom: 8 },
  retour: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginLeft: -9 },
  barreLibelle: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  barreTotal: { fontSize: 16.5, fontWeight: '800', color: '#fff' },
  barreBouton: { height: 46 },
}));
