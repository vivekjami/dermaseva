import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, Image, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { getAllCases, deleteCaseById, clearAllCases, type CaseRecord } from '@/modules/db/case-store';
import { useTranslation } from 'react-i18next';

const SEVERITY_COLORS: Record<string, string> = {
  mild:     '#437a22',
  moderate: '#da7101',
  severe:   '#a12c7b',
};

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getAllCases();
    setCases(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  function handleDelete(id: string) {
    Alert.alert(
      'Delete Case',
      'Remove this case from history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteCaseById(id);
            await load();
          },
        },
      ]
    );
  }

  function handleClearAll() {
    Alert.alert(
      'Clear All History',
      'This will permanently delete all saved cases. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All', style: 'destructive',
          onPress: async () => {
            await clearAllCases();
            await load();
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: CaseRecord }) {
    const color = SEVERITY_COLORS[item.severity ?? 'mild'] ?? '#7a7974';
    const date  = format(new Date(item.created_at), 'dd MMM yyyy, hh:mm a');

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => router.push({ pathname: '/(main)/result', params: { caseId: item.id } })}
        onLongPress={() => handleDelete(item.id)}
        accessibilityLabel={`Case: ${item.condition_name ?? 'Unknown'}, ${item.severity}`}
        accessibilityHint="Tap to view full result. Long press to delete."
      >
        {/* Thumbnail */}
        <View style={styles.thumbContainer}>
          {item.thumbnail_base64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.thumbnail_base64}` }}
              style={styles.thumb}
            />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbPlaceholderText}>🩺</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.conditionName} numberOfLines={1}>
            {item.condition_name ?? 'Unknown condition'}
          </Text>
          <Text style={styles.date}>{date}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
              <Text style={[styles.badgeText, { color }]}>
                {item.severity?.toUpperCase() ?? '—'}
              </Text>
            </View>
            {item.needs_urgent_referral && (
              <View style={[styles.badge, styles.urgentBadge]}>
                <Text style={styles.urgentBadgeText}>⚠️ REFER</Text>
              </View>
            )}
          </View>
        </View>

        {/* Chevron */}
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('history.title')}</Text>
        {cases.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} accessibilityRole="button">
            <Text style={styles.clearAll}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={cases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={cases.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>{t('history.empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f2ee' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#f5f2ee',
    borderBottomWidth: 1, borderBottomColor: '#e5e0da',
  },
  title:    { fontSize: 22, fontWeight: '800', color: '#28251d' },
  clearAll: { fontSize: 14, color: '#a12c7b', fontWeight: '600' },
  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#7a7974', textAlign: 'center' },
  // Card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    shadowColor: '#28251d', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    gap: 12,
  },
  thumbContainer: { width: 60, height: 60 },
  thumb: { width: 60, height: 60, borderRadius: 8 },
  thumbPlaceholder: {
    backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center',
  },
  thumbPlaceholderText: { fontSize: 26 },
  info:          { flex: 1, gap: 4 },
  conditionName: { fontSize: 15, fontWeight: '700', color: '#28251d' },
  date:          { fontSize: 12, color: '#7a7974' },
  badgeRow:      { flexDirection: 'row', gap: 6, marginTop: 2 },
  badge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  badgeText:      { fontSize: 11, fontWeight: '700' },
  urgentBadge:    { backgroundColor: '#f5e6f0', borderColor: '#a12c7b' },
  urgentBadgeText:{ fontSize: 11, fontWeight: '700', color: '#a12c7b' },
  chevron: { fontSize: 22, color: '#c5bfb5', fontWeight: '300' },
});
