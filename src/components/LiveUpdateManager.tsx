import Feather from '@expo/vector-icons/Feather';
import * as Updates from 'expo-updates';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Fonts, Radius, Space } from '../theme/tokens';

export function LiveUpdateManager() {
  const { palette } = useTheme();
  const [manualChecking, setManualChecking] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Hook from expo-updates provides live reactive state
  const updatesState = Updates.useUpdates();
  const {
    currentlyRunning,
    isUpdateAvailable,
    isUpdatePending,
    isChecking,
    isDownloading,
    downloadProgress,
    checkError,
    downloadError,
    lastCheckForUpdateTimeSinceRestart,
  } = updatesState;

  const isEnabled = Updates.isEnabled;
  const runningId = currentlyRunning.updateId;
  const isEmbedded = currentlyRunning.isEmbeddedLaunch;
  const channel = currentlyRunning.channel ?? 'preview';
  const runtimeVersion = currentlyRunning.runtimeVersion ?? '1.0.0';

  const checking = isChecking || manualChecking;
  const rawProgress = downloadProgress ?? 0;
  const progressPercent = Math.min(100, Math.max(0, Math.round(rawProgress * 100)));

  const handleCheckAndDownload = async () => {
    if (!isEnabled) {
      setStatusNote('OTA updates are only active in standalone preview builds.');
      return;
    }

    setManualChecking(true);
    setActionError(null);
    setStatusNote('Checking update server...');

    try {
      const checkResult = await Updates.checkForUpdateAsync();
      if (checkResult.isAvailable) {
        setStatusNote('New update found! Downloading update bundle...');
        const fetchResult = await Updates.fetchUpdateAsync();
        if (fetchResult.isNew) {
          setStatusNote('Update downloaded! Tap "Restart to Apply" below.');
        } else {
          setStatusNote('Update bundle is ready to apply.');
        }
      } else {
        setStatusNote('Your app is already running the latest update.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(`Update check failed: ${msg}`);
      setStatusNote(null);
    } finally {
      setManualChecking(false);
    }
  };

  const handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(`Restart failed: ${msg}`);
    }
  };

  const displayError = actionError || checkError?.message || downloadError?.message;

  return (
    <View style={styles.container}>
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: palette.textMuted }]}>Runtime</Text>
          <Text style={[styles.metaValue, { color: palette.textPrimary }]}>
            v{runtimeVersion} ({channel})
          </Text>
        </View>

        <View style={styles.metaItem}>
          <Text style={[styles.metaLabel, { color: palette.textMuted }]}>Current Build</Text>
          <Text
            style={[styles.metaValueMono, { color: palette.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {runningId ? runningId.slice(0, 8) : isEmbedded ? 'Embedded Base' : 'Development'}
          </Text>
        </View>
      </View>

      {/* Live Status Pill */}
      <View
        style={[
          styles.statusCard,
          {
            backgroundColor: isUpdatePending
              ? palette.primaryLight
              : isDownloading || checking
              ? palette.surfaceMuted
              : palette.background,
            borderColor: isUpdatePending ? palette.primary : palette.border,
          },
        ]}
      >
        <View style={styles.statusContentRow}>
          {checking ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : isDownloading ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : isUpdatePending ? (
            <Feather name="check-circle" size={18} color={palette.primary} />
          ) : isUpdateAvailable ? (
            <Feather name="download" size={18} color={palette.primary} />
          ) : (
            <Feather name="check" size={16} color={palette.textSecondary} />
          )}

          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                styles.statusTitle,
                { color: isUpdatePending ? palette.primary : palette.textPrimary },
              ]}
            >
              {checking
                ? 'Checking for updates...'
                : isDownloading
                ? `Downloading update (${progressPercent}%)...`
                : isUpdatePending
                ? 'Update downloaded and ready!'
                : isUpdateAvailable
                ? 'A new update is available'
                : 'App is up to date'}
            </Text>

            <Text style={[styles.statusSubtitle, { color: palette.textSecondary }]}>
              {statusNote
                ? statusNote
                : isUpdatePending
                ? 'Restart the app now to switch to the new update.'
                : lastCheckForUpdateTimeSinceRestart
                ? `Checked at ${lastCheckForUpdateTimeSinceRestart.toLocaleTimeString()}`
                : isEnabled
                ? 'Automatic background update checks enabled'
                : 'Local development environment'}
            </Text>
          </View>
        </View>

        {/* Real-time Download Progress Bar */}
        {isDownloading ? (
          <View style={styles.progressContainer}>
            <View
              style={[
                styles.progressBarTrack,
                { backgroundColor: palette.border },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: palette.primary,
                    width: `${Math.max(5, progressPercent)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: palette.textMuted }]}>
              {progressPercent}%
            </Text>
          </View>
        ) : null}
      </View>

      {/* Error Message */}
      {displayError ? (
        <View style={[styles.errorBox, { backgroundColor: palette.dangerLight }]}>
          <Feather name="alert-triangle" size={15} color={palette.danger} />
          <Text style={[styles.errorText, { color: palette.danger }]}>{displayError}</Text>
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {isUpdatePending ? (
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: palette.primaryButtonBg },
              pressed && { opacity: 0.9 },
            ]}
            onPress={() => void handleRestart()}
          >
            <Feather name="rotate-cw" size={15} color={palette.primaryButtonText} />
            <Text style={[styles.primaryBtnText, { color: palette.primaryButtonText }]}>
              Restart to Apply Now
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: palette.borderStrong, backgroundColor: palette.background },
              (checking || isDownloading) && { opacity: 0.6 },
              pressed && { opacity: 0.8 },
            ]}
            disabled={checking || isDownloading}
            onPress={() => void handleCheckAndDownload()}
          >
            {checking ? (
              <ActivityIndicator size="small" color={palette.primary} />
            ) : (
              <Feather name="refresh-cw" size={14} color={palette.primary} />
            )}
            <Text style={[styles.secondaryBtnText, { color: palette.primary }]}>
              {checking ? 'Checking...' : isDownloading ? 'Downloading...' : 'Check for Updates'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.s12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.s12,
  },
  metaItem: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 15,
  },
  metaValue: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  metaValueMono: {
    fontFamily: Fonts.monoMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  statusCard: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.s12,
    gap: Space.s8,
  },
  statusContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s12,
  },
  statusTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  statusSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s8,
    marginTop: Space.s4,
  },
  progressBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    minWidth: 32,
    textAlign: 'right',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.s8,
    borderRadius: Radius.pill,
    gap: Space.s8,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.s8,
  },
  primaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  primaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  secondaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: Radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s8,
  },
  secondaryBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
});
