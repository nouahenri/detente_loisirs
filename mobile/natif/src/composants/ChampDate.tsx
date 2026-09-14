/** Sélecteur de date natif : calendrier iOS compact, boîte de dialogue Android. */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, Text, View } from 'react-native';

import { dateJour } from '@/donnees/i18n';
import { usePreferences } from '@/donnees/preferences';
import { dateISO } from '@/donnees/regles';
import { feuilleChampDate, type ProprietesChampDate } from './champDateCommun';
import { Icone } from './ui';

const LOCALES = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' } as const;

export function ChampDate({ libelle, valeur, minimum, onChange, plat }: ProprietesChampDate) {
  const { C, langue } = usePreferences();
  const s = feuilleChampDate(C);
  const date = new Date(`${valeur}T12:00:00`);
  const min = new Date(`${minimum}T00:00:00`);

  const entete = plat
    ? <View style={s.tetePlat}><Icone nom="calendar-outline" taille={14} couleur={C.orTexte} /><Text style={s.libellePlat} numberOfLines={1}>{libelle}</Text></View>
    : <Text style={s.libelle}>{libelle}</Text>;

  if (Platform.OS === 'ios') {
    return (
      <View style={plat ? s.champPlat : s.champ}>
        {entete}
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          minimumDate={min}
          locale={LOCALES[langue]}
          accentColor={C.sombre ? C.or : '#151837'}
          themeVariant={C.sombre ? 'dark' : 'light'}
          onChange={(_, choisie) => { if (choisie) onChange(dateISO(choisie)); }}
          style={{ alignSelf: 'flex-start', marginLeft: -8, marginTop: plat ? 2 : 0 }}
        />
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [plat ? s.champPlat : s.champ, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${libelle} : ${dateJour(valeur, langue)}`}
      onPress={() => DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        minimumDate: min,
        onChange: (evenement, choisie) => { if (evenement.type === 'set' && choisie) onChange(dateISO(choisie)); },
      })}>
      {entete}
      {plat
        ? <Text style={s.valeurPlat} numberOfLines={1}>{dateJour(valeur, langue)}</Text>
        : (
          <View style={s.valeurLigne}>
            <Icone nom="calendar-outline" taille={17} couleur={C.orTexte} />
            <Text style={s.valeur}>{dateJour(valeur, langue)}</Text>
          </View>
        )}
    </Pressable>
  );
}
