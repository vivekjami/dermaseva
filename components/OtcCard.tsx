import { View, Text, StyleSheet } from 'react-native';
import { type OtcRule } from '@/modules/safety/otc-rules';

interface Props {
  rule: OtcRule;
  conditionName: string;
}

export function OtcCard({ rule, conditionName }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.pill}>💊 Suggested OTC Remedy</Text>
      </View>
      <Text style={styles.condition}>{conditionName}</Text>
      <Text style={styles.remedy}>{rule.remedy}</Text>
      <View style={styles.divider} />
      <Text style={styles.instructionsLabel}>How to use:</Text>
      <Text style={styles.instructions}>{rule.instructions}</Text>
      <View style={styles.followUpRow}>
        <Text style={styles.followUpIcon}>📅</Text>
        <Text style={styles.followUp}>
          Visit PHC if no improvement within <Text style={styles.bold}>{rule.followUpDays} days</Text>.
        </Text>
      </View>
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ For use by ASHA/Anganwadi workers only. Always confirm with a PHC doctor.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#eaf4ea',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#437a22',
  },
  headerRow: { marginBottom: 6 },
  pill: {
    fontSize: 12,
    fontWeight: '700',
    color: '#437a22',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  condition: { fontSize: 16, fontWeight: '700', color: '#28251d', marginBottom: 4 },
  remedy: { fontSize: 18, fontWeight: '800', color: '#437a22', marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#c8dfc8', marginBottom: 10 },
  instructionsLabel: { fontSize: 13, fontWeight: '700', color: '#28251d', marginBottom: 4 },
  instructions: { fontSize: 14, color: '#28251d', lineHeight: 21, marginBottom: 12 },
  followUpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10 },
  followUpIcon: { fontSize: 14 },
  followUp: { flex: 1, fontSize: 14, color: '#28251d', lineHeight: 20 },
  bold: { fontWeight: '700' },
  disclaimer: {
    backgroundColor: '#d4ebd4',
    borderRadius: 8,
    padding: 8,
  },
  disclaimerText: { fontSize: 12, color: '#437a22', lineHeight: 17 },
});
