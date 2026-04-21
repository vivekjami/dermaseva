// ReferralCTA — rendered on EVERY result screen without exception.
// The button cannot be hidden by any app state. Per build spec Step 6.2.

import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { type ReferralDecision } from '@/modules/safety/referral-logic';

interface Props {
  decision: ReferralDecision;
  doctorReferralText: string;
}

export function ReferralCTA({ decision, doctorReferralText }: Props) {

  function handlePress() {
    // geo: URI works on Android (opens Google Maps or any maps app)
    // Falls back to browser maps search if no maps app is installed
    const geoUri = 'geo:0,0?q=Primary+Health+Centre+near+me';
    const browserFallback = 'https://maps.google.com/?q=Primary+Health+Centre+near+me';

    Linking.canOpenURL(geoUri)
      .then((supported) => {
        const url = supported ? geoUri : browserFallback;
        return Linking.openURL(url);
      })
      .catch(() => {
        // Last resort: open browser maps
        Linking.openURL(browserFallback).catch(() =>
          Alert.alert(
            'Open Maps',
            'Search for "Primary Health Centre near me" in Google Maps.',
            [{ text: 'OK' }]
          )
        );
      });
  }

  return (
    <View style={[styles.container, { borderLeftColor: decision.buttonColor }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.icon}>👨‍⚕️</Text>
        <Text style={styles.ctaText}>{decision.ctaText}</Text>
      </View>

      {/* Doctor's specific referral note from AI */}
      <Text style={styles.referralNote}>{doctorReferralText}</Text>

      {/* Subtext */}
      <Text style={styles.subtext}>{decision.ctaSubtext}</Text>

      {/* CTA Button — ALWAYS visible */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: decision.buttonColor }]}
        onPress={handlePress}
        activeOpacity={0.8}
        accessible
        accessibilityRole="button"
        accessibilityLabel={decision.buttonLabel}
      >
        <Text style={styles.buttonText}>{decision.buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#28251d',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  icon: { fontSize: 20, marginTop: 1 },
  ctaText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#28251d',
    lineHeight: 22,
  },
  referralNote: {
    fontSize: 14,
    color: '#7a7974',
    lineHeight: 20,
    marginBottom: 10,
    paddingLeft: 28,
  },
  subtext: {
    fontSize: 13,
    color: '#7a7974',
    lineHeight: 19,
    marginBottom: 14,
    paddingLeft: 28,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
