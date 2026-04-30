import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { initHistoryDB } from '@/modules/db/patient-history';

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initHistoryDB();
    // Small delay to ensure DB is initialized
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f6f2' }}>
        <ActivityIndicator size="large" color="#01696f" />
      </View>
    );
  }

  // Always go straight to voice screen — language + profession are set inline
  return <Redirect href={'/(main)/voice' as Href} />;
}
