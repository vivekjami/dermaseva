// SafetyBanner — shown for low-confidence results and severe conditions.
// Draws the worker's attention before they read the result.

import { View, Text, StyleSheet } from 'react-native';

interface Props {
  type: 'low_confidence' | 'severe' | 'outside_scope';
}

const BANNER_CONFIG = {
  low_confidence: {
    bg: '#ddcfc6',
    border: '#964219',
    textColor: '#964219',
    icon: '⚠️',
    message:
      'The AI could not identify this condition with confidence. Retake in better lighting or refer to PHC.',
  },
  severe: {
    bg: '#e0ced7',
    border: '#a12c7b',
    textColor: '#a12c7b',
    icon: '🚨',
    message:
      'This condition requires immediate medical attention. Refer to hospital now.',
  },
  outside_scope: {
    bg: '#e7d7c4',
    border: '#da7101',
    textColor: '#964219',
    icon: '📋',
    message:
      'This condition is outside standard ASHA screening scope. Please refer to PHC.',
  },
};

export function SafetyBanner({ type }: Props) {
  const config = BANNER_CONFIG[type];
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: config.bg, borderLeftColor: config.border },
      ]}
    >
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.message, { color: config.textColor }]}>
        {config.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  icon: { fontSize: 18, marginTop: 1 },
  message: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
