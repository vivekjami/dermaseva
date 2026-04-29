import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import { useAppStore } from '../../store/app-store';

type WorkerType = 'asha' | 'anganwadi' | 'general';

const WORKER_TYPES: WorkerType[] = ['asha', 'anganwadi', 'general'];

export default function WorkerTypeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const setWorkerType = useAppStore((s) => s.setWorkerType);
  const workerType = useAppStore((s) => s.workerType);

  const handleSelect = (type: WorkerType) => {
    setWorkerType(type);
  };

  const handleFinish = async () => {
    await SecureStore.setItemAsync('ONBOARDING_COMPLETE', 'true');
    router.replace('/(main)/voice' as Href);
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.heading}>{t('onboarding.workerType')}</Text>

      <View style={styles.list}>
        {WORKER_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.item, workerType === type && styles.itemSelected]}
            onPress={() => handleSelect(type)}
            activeOpacity={0.7}
          >
            <Text style={[styles.itemText, workerType === type && styles.itemTextSelected]}>
              {t(`workerType.${type}`)}
            </Text>
            {workerType === type && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.btn, !workerType && styles.btnDisabled]}
        onPress={handleFinish}
        disabled={!workerType}
        activeOpacity={0.8}
      >
        <Text style={styles.btnText}>Get Started →</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f6f2', paddingHorizontal: 24 },
  back: { marginTop: 16 },
  backText: { fontSize: 16, color: '#01696f', fontWeight: '600' },
  heading: { fontSize: 26, fontWeight: '700', marginTop: 32, marginBottom: 32, color: '#28251d' },
  list: { gap: 16 },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
    marginTop: 'auto',
    marginBottom: 32,
  },
  btnDisabled: { backgroundColor: '#bab9b4' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
