import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { recordLoginEventSafely } from '../services/admin';
import { configureGoogleSignIn } from '../services/auth';
import { fetchHouseholdContext } from '../services/household';
import { createChargeEntry, createPaymentEntry } from '../services/ledger';
import {
  dispatchLivePartnerNotification,
  fetchUserSettings,
  refreshDailyLocalReminderFromCache,
  registerExpoPushTokenSafely,
  syncDailyLocalReminder,
  upsertUserSettings,
} from '../services/notifications';
import {
  flushOfflineMutations,
  type OfflineMutation,
} from '../services/offlineQueue';
import {
  cacheHouseholdContext,
  clearCachedHouseholdContext,
  getCachedHouseholdContext,
} from '../services/offlineStorage';
import { useTheme } from '../theme/ThemeContext';
import type { HouseholdContextData } from '../types/phase1';

interface SessionState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  householdContext: HouseholdContextData | null;
  error: string | null;
  refreshHousehold: () => Promise<void>;
  setHouseholdContextDirect: (ctx: HouseholdContextData | null) => void;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

export async function executeOfflineMutation(mutation: OfflineMutation): Promise<void> {
  if (mutation.kind === 'charge') {
    await createChargeEntry(mutation.payload);
  } else {
    await createPaymentEntry(mutation.payload);
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { setThemeMode } = useTheme();
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState<boolean>(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [householdContext, setHouseholdContext] = useState<HouseholdContextData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const syncedUserRef = useRef<string | null>(null);
  const bootstrapDoneRef = useRef(false);
  const householdIdRef = useRef<string | null>(null);

  useEffect(() => {
    householdIdRef.current = householdContext?.household.id ?? null;
  }, [householdContext?.household.id]);

  const syncDevicePreferences = useCallback(
    async (userId: string, householdId: string) => {
      void recordLoginEventSafely();

      try {
        const [existingSettings, pushToken] = await Promise.all([
          fetchUserSettings(userId),
          registerExpoPushTokenSafely(),
        ]);

        const syncKey = `${userId}:${householdId}:${pushToken ?? 'none'}`;
        if (syncedUserRef.current === syncKey) {
          return;
        }
        syncedUserRef.current = syncKey;

        if (existingSettings) {
          await setThemeMode(existingSettings.theme_mode);
          await syncDailyLocalReminder({
            enabled: existingSettings.daily_reminder_enabled,
            hour: existingSettings.daily_reminder_hour,
            minute: existingSettings.daily_reminder_minute,
            skipIfLoggedToday: existingSettings.skip_if_logged_today,
          });
          if (pushToken && pushToken !== existingSettings.expo_push_token) {
            await upsertUserSettings({
              userId,
              householdId,
              expo_push_token: pushToken,
            });
          }
        } else {
          const created = await upsertUserSettings({
            userId,
            householdId,
            daily_reminder_enabled: true,
            daily_reminder_hour: 20,
            daily_reminder_minute: 0,
            expo_push_token: pushToken,
          });
          await syncDailyLocalReminder({
            enabled: created.daily_reminder_enabled,
            hour: created.daily_reminder_hour,
            minute: created.daily_reminder_minute,
            skipIfLoggedToday: created.skip_if_logged_today,
          });
        }
      } catch {
        // Non-blocking when offline or if settings row cannot sync yet
      }
    },
    [setThemeMode]
  );

  const loadHouseholdForSession = useCallback(
    async (activeSession: Session | null) => {
      if (!activeSession) {
        syncedUserRef.current = null;
        setHouseholdContext(null);
        await clearCachedHouseholdContext();
        return;
      }

      try {
        setError(null);
        const ctx = await fetchHouseholdContext(activeSession.user.id);
        setHouseholdContext(ctx);
        if (ctx) {
          await cacheHouseholdContext(ctx);
          void syncDevicePreferences(activeSession.user.id, ctx.household.id);
          void flushOfflineMutations(ctx.household.id, executeOfflineMutation).catch(() => undefined);
        }
      } catch (err) {
        const cached = await getCachedHouseholdContext();
        if (cached && cached.currentMember.user_id === activeSession.user.id) {
          setHouseholdContext(cached);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load household');
        }
      }
    },
    [syncDevicePreferences]
  );

  const refreshHousehold = useCallback(async () => {
    if (!configured || !session) {
      return;
    }
    await loadHouseholdForSession(session);
  }, [configured, session, loadHouseholdForSession]);

  useEffect(() => {
    if (!configured) {
      return;
    }

    configureGoogleSignIn();
    const supabase = getSupabaseClient();
    let mounted = true;
    bootstrapDoneRef.current = false;

    void supabase.auth
      .getSession()
      .then(async ({ data, error: sessionErr }) => {
        if (!mounted) return;
        bootstrapDoneRef.current = true;
        if (sessionErr) {
          setError(sessionErr.message);
          setLoading(false);
          return;
        }
        setSession(data.session);
        await loadHouseholdForSession(data.session);
        if (mounted) {
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        bootstrapDoneRef.current = true;
        setError(err instanceof Error ? err.message : 'Unable to restore session');
        setLoading(false);
      });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION' && !bootstrapDoneRef.current) {
        // Initial getSession() call handles initial hydration without duplicate queries
        return;
      }
      setSession(nextSession);
      void loadHouseholdForSession(nextSession);
    });

    const appSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void refreshDailyLocalReminderFromCache().catch(() => undefined);
        const currentHouseholdId = householdIdRef.current;
        if (currentHouseholdId) {
          void flushOfflineMutations(currentHouseholdId, executeOfflineMutation).catch(
            () => undefined
          );
        }
      }
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
      appSub.remove();
    };
  }, [configured, loadHouseholdForSession]);

  // Global Realtime listener for instant partner alerts while app is live/open
  useEffect(() => {
    if (!configured || !session || !householdContext) {
      return;
    }

    const currentUserId = session.user.id;
    const currentHouseholdId = householdContext.household.id;
    const members = householdContext.members;
    const supabase = getSupabaseClient();
    const subId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const channel = supabase
      .channel(`live_alerts:${currentHouseholdId}:${subId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'entries',
          filter: `household_id=eq.${currentHouseholdId}`,
        },
        (payload) => {
          const newEntry = payload.new as {
            id: string;
            created_by: string;
            shop_id: string;
            type: 'charge' | 'payment';
            total_amount_santim: number;
          };

          if (!newEntry || newEntry.created_by === currentUserId) {
            return;
          }

          void dispatchLivePartnerNotification({
            entry: newEntry,
            members,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [configured, session, householdContext]);

  return (
    <SessionContext.Provider
      value={{
        configured,
        loading,
        session,
        householdContext,
        error,
        refreshHousehold,
        setHouseholdContextDirect: setHouseholdContext,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return ctx;
}
