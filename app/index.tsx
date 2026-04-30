import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useAppStore } from '@/store/app-store';

export default function IndexRedirect() {
  const { onboardingComplete } = useAppStore();

  if (!onboardingComplete) {
    return <Redirect href={'/(onboarding)/welcome' as Href} />;
  }

  return <Redirect href={'/(main)/voice' as Href} />;
}
