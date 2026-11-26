import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as QuickActions from 'expo-quick-actions';
import { type RouterAction, useQuickActionRouting } from 'expo-quick-actions/router';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppLockGate } from '../components/AppLockGate';
import { configureNotifications } from '../services/notifications';
import { SessionProvider } from '../state/SessionContext';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppShell() {
  const { isDark, palette } = useTheme();
  useQuickActionRouting();

  useEffect(() => {
    configureNotifications();

    void QuickActions.setItems<RouterAction>([
      {
        id: 'quick_add_charge',
        title: 'Add charge',
        subtitle: 'Log credit at a shop',
        icon: Platform.OS === 'android' ? 'ic_menu_add' : 'add',
        params: { href: '/add-charge' },
      },
      {
        id: 'quick_record_payment',
        title: 'Record payment',
        subtitle: 'Pay a shop tab',
        icon: Platform.OS === 'android' ? 'ic_menu_send' : 'compose',
        params: { href: '/record-payment' },
      },
    ]).catch(() => undefined);

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === 'string' && href.startsWith('/')) {
        router.push(href as '/add-charge' | '/shops');
      }
    });

    return () => {
      responseSub.remove();
    };
  }, []);

  return (
    <AppLockGate>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade_from_bottom',
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="link-household" />
        <Stack.Screen name="shops" />
        <Stack.Screen name="insights" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="shop/[id]" />
        <Stack.Screen name="add-charge" />
        <Stack.Screen name="record-payment" />
        <Stack.Screen name="entry/[id]" />
        <Stack.Screen name="edit-entry/[id]" />
        <Stack.Screen name="platform-console" />
      </Stack>
    </AppLockGate>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <AppShell />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
