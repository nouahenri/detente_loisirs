/** Navigateur (mise au point) : champ date HTML. */
import { createElement } from 'react';
import { Text, View } from 'react-native';

import { usePreferences } from '@/donnees/preferences';
import { feuilleChampDate, type ProprietesChampDate } from './champDateCommun';
import { Icone } from './ui';

export function ChampDate({ libelle, valeur, minimum, onChange, plat }: ProprietesChampDate) {
  const { C } = usePreferences();
  const s = feuilleChampDate(C);
  return (
    <View style={plat ? s.champPlat : s.champ}>
      {plat
        ? <View style={s.tetePlat}><Icone nom="calendar-outline" taille={14} couleur={C.orTexte} /><Text style={s.libellePlat} numberOfLines={1}>{libelle}</Text></View>
        : <Text style={s.libelle}>{libelle}</Text>}
      {createElement('input', {
        type: 'date',
        value: valeur,
        min: minimum,
        onChange: (e: { target: { value: string } }) => { if (e.target.value) onChange(e.target.value); },
        style: { border: 0, fontSize: plat ? 15 : 16, fontWeight: 700, color: C.texte, background: 'transparent', padding: 0, marginTop: plat ? 6 : 0, fontFamily: 'inherit', colorScheme: C.sombre ? 'dark' : 'light', minWidth: 0, width: '100%' },
      })}
    </View>
  );
}
