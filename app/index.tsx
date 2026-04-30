import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/app-store';

export default function IndexRedirect() {
  const { onboardingComplete } = useAppStore();

  if (!onboardingComplete) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  return <Redirect href="/(main)/voice" />;
}
