import { Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import { useAppStore } from '../../store/app-store';

export default function LanguageScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const setLanguage = useAppStore((s) => s.setLanguage);
  const currentLang = useAppStore((s) => s.language);

  const handleSelect = (code: string) => {
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  const handleNext = () => {
    router.push('/(onboarding)/worker-type');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>{t('onboarding.pickLanguage')}</Text>

      <FlatList
        data={SUPPORTED_LANGUAGES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, currentLang === item.code && styles.itemSelected]}
            onPress={() => handleSelect(item.code)}
            activeOpacity={0.7}
          >
            <Text style={[styles.itemText, currentLang === item.code && styles.itemTextSelected]}>
              {item.label}
            </Text>
            {currentLang === item.code && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.btn} onPress={handleNext} activeOpacity={0.8}>
        <Text style={styles.btnText}>Next →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2', paddingHorizontal: 24 },
  heading: { fontSize: 26, fontWeight: '700', marginTop: 48, marginBottom: 32, color: '#28251d' },
  list: { gap: 12, paddingBottom: 24 },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dcd9d5',
  },
  itemSelected: { borderColor: '#01696f', backgroundColor: '#cedcd8' },
  itemText: { fontSize: 18, color: '#28251d' },
  itemTextSelected: { color: '#01696f', fontWeight: '600' },
  check: { fontSize: 18, color: '#01696f' },
  btn: {
    backgroundColor: '#01696f',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
