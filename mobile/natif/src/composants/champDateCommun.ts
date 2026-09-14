import { creerStyles } from '@/donnees/theme';

/** `plat` : présentation du formulaire de recherche (libellé en capitales, trait en dessous). */
export type ProprietesChampDate = { libelle: string; valeur: string; minimum: string; onChange: (iso: string) => void; plat?: boolean };

export const feuilleChampDate = creerStyles(C => ({
  champ: { flex: 1, backgroundColor: C.carte, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, boxShadow: C.ombre },
  libelle: { fontSize: 12, fontWeight: '700', color: C.texte2, marginBottom: 4 },
  valeurLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valeur: { fontSize: 16, fontWeight: '700', color: C.texte },

  champPlat: { flex: 1, minWidth: 0, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.bord },
  tetePlat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  libellePlat: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: C.texte2 },
  valeurPlat: { flex: 1, fontSize: 15.5, fontWeight: '700', color: C.texte, marginTop: 6 },
}));
