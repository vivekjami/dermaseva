import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function HistoryScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>{t('history.title')}</Text>
      <Text style={styles.empty}>{t('history.empty')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700', color: '#28251d', marginBottom: 16 },
  empty: { fontSize: 16, color: '#7a7974' },
});
