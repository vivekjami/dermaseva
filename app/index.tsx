import { Redirect, type Href } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { initHistoryDB } from '@/modules/db/patient-history';

export default function Index() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    initHistoryDB(); // Initialize local storage for patient history
    SecureStore.getItemAsync('ONBOARDING_COMPLETE').then((val) => {
      setOnboarded(val === 'true');
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return onboarded
    ? <Redirect href={'/(main)/voice' as Href} />
    : <Redirect href="/(onboarding)/language" />;
}
