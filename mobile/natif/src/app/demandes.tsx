/**
 * Mes demandes : devis envoyés depuis ce téléphone, avec leur statut tenu à
 * jour par le site (POST /api/app/suivi) — Envoyée, Prise en charge, Confirmée.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ouvrirLien, vibrerSelection } from '@/composants/outils';
import { Bouton, EtatVide, Icone, type NomIcone } from '@/composants/ui';
import { dateCourte } from '@/donnees/i18n';
import { useMagasin } from '@/donnees/magasin';
import { usePreferences } from '@/donnees/preferences';
import { creerStyles, type Palette } from '@/donnees/theme';

const ETAPES = ['nouveau', 'contacte', 'confirme'];

export default function Demandes() {
  const router = useRouter();
  const { historique, actualiserStatuts } = useMagasin();
  const { C, t, langue } = usePreferences();
  const s = feuille(C);
  const [tire, setTire] = useState(false);

  // Statuts rafraîchis à l'ouverture de l'écran, dès que l'historique est lu
  // sur le téléphone (il peut arriver juste après l'affichage).
  const nbDemandes = historique.length;
  useEffect(() => { if (nbDemandes) actualiserStatuts(); }, [nbDemandes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!historique.length) {
    return (
      <View style={{ flex: 1, backgroundColor: C.fond }}>
        <EtatVide
          icone="receipt-outline"
          titre={t('demandes.vide')}
          texte={t('demandes.videTexte')}
          action={<Bouton texte={t('demandes.nouvelle')} icone="add" onPress={() => { if (router.canDismiss()) router.dismissAll(); router.navigate('/devis'); }} />}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: C.fond }}
      contentContainerStyle={s.contenu}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={tire} tintColor={C.marque} colors={['#151837']} onRefresh={async () => { setTire(true); await actualiserStatuts(); setTire(false); }} />}>
      {historique.map((d, i) => {
        const statut = d.statut || (d.enregistree ? 'nouveau' : '');
        const rang = ETAPES.indexOf(statut);
        return (
          <View key={`${d.le}-${i}`} style={s.carte}>
            <View style={s.tete}>
              <View style={{ flex: 1 }}>
                <Text style={s.objet} numberOfLines={2}>{d.objet}</Text>
                <Text style={s.detail}>{t('demandes.envoyee', { date: dateCourte(d.le, langue) })}</Text>
              </View>
              {statut ? <Pastille C={C} statut={statut} texte={t(`statut.${statut}` as 'statut.nouveau')} /> : null}
            </View>

            <View style={s.infos}>
              <Info C={C} icone="calendar-outline" texte={d.dates} />
              <Info C={C} icone="people-outline" texte={d.voyageurs} />
              <Info C={C} icone="cash-outline" texte={d.total} fort />
            </View>

            {d.id && statut !== 'archive' ? (
              <View style={s.etapes}>
                {ETAPES.map((etape, n) => (
                  <View key={etape} style={s.etape}>
                    <View style={[s.point, n <= rang && s.pointFait]}>{n <= rang ? <Icone nom="checkmark" taille={12} couleur="#fff" /> : null}</View>
                    <Text style={[s.etapeTexte, n <= rang && { color: C.texte, fontWeight: '700' }]} numberOfLines={1}>{t(`statut.${etape}` as 'statut.nouveau')}</Text>
                    {n < ETAPES.length - 1 ? <View style={[s.trait, n < rang && s.traitFait]} /> : null}
                  </View>
                ))}
              </View>
            ) : !d.id ? <Text style={s.sansSuivi}>{t('demandes.sansSuivi')}</Text> : null}

            <Pressable onPress={() => { vibrerSelection(); ouvrirLien(d.lien, t); }} style={({ pressed }) => [s.whatsapp, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <Icone nom="logo-whatsapp" taille={18} couleur={C.wa} />
              <Text style={s.whatsappTexte}>{t('profil.rouvrir')}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Pastille({ C, statut, texte }: { C: Palette; statut: string; texte: string }) {
  const s = feuille(C);
  const couleurs: Record<string, [string, string]> = {
    nouveau: [C.surface, C.texte2],
    contacte: [C.orPale, C.orTexte],
    confirme: [C.okPale, C.ok],
    archive: [C.surface, C.texte3],
  };
  const [fond, texteCouleur] = couleurs[statut] || couleurs.nouveau;
  return <View style={[s.pastille, { backgroundColor: fond }]}><Text style={[s.pastilleTexte, { color: texteCouleur }]}>{texte}</Text></View>;
}

function Info({ C, icone, texte, fort }: { C: Palette; icone: NomIcone; texte: string; fort?: boolean }) {
  const s = feuille(C);
  return (
    <View style={s.info}>
      <Icone nom={icone} taille={15} couleur={C.texte3} />
      <Text style={[s.infoTexte, fort && { color: C.marque, fontWeight: '800' }]} numberOfLines={1}>{texte}</Text>
    </View>
  );
}

const feuille = creerStyles(C => ({
  contenu: { padding: 16, gap: 12, paddingBottom: 40 },
  carte: { backgroundColor: C.carte, borderRadius: 18, padding: 14, boxShadow: C.ombre, borderWidth: 1, borderColor: C.bord },
  tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  objet: { fontSize: 16, fontWeight: '800', color: C.texte },
  detail: { fontSize: 12.5, color: C.texte3, marginTop: 2 },
  pastille: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pastilleTexte: { fontSize: 12, fontWeight: '800' },
  infos: { marginTop: 12, gap: 6 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoTexte: { fontSize: 14, color: C.texte2, flex: 1 },
  etapes: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.bord },
  etape: { flex: 1, alignItems: 'center', position: 'relative' },
  point: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.bord, backgroundColor: C.carte, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  pointFait: { backgroundColor: C.ok, borderColor: C.ok },
  etapeTexte: { fontSize: 11.5, color: C.texte3, marginTop: 5, textAlign: 'center' },
  trait: { position: 'absolute', top: 10, left: '60%', right: '-40%', height: 2, backgroundColor: C.bord },
  traitFait: { backgroundColor: C.ok },
  sansSuivi: { fontSize: 12.5, color: C.texte3, marginTop: 12 },
  whatsapp: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, height: 42, borderRadius: 999, borderWidth: 1.5, borderColor: C.bord },
  whatsappTexte: { fontSize: 14, fontWeight: '700', color: C.texte },
}));
