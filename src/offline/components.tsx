import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../shared/theme';
import { useConnectivity } from './connectivity';
import { getPendingOfflineOperationCount } from './outbox';

export function OfflineBadge() {
  return (
    <View accessibilityLabel="Showing saved offline information" style={styles.offlineBadge}>
      <Ionicons color={colors.warning} name="cloud-offline-outline" size={14} />
      <Text style={styles.offlineBadgeText}>Offline</Text>
    </View>
  );
}

export function ConnectivityBadge() {
  const { isOffline } = useConnectivity();
  return isOffline ? <OfflineBadge /> : null;
}

export function SyncStatusPill() {
  const { isOffline } = useConnectivity();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const count = await getPendingOfflineOperationCount();
      if (mounted) setPendingCount(count);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [isOffline]);

  return (
    <Pressable
      accessibilityLabel="Open synchronization center"
      accessibilityRole="button"
      onPress={() => router.push('/sync-center' as never)}
      style={[styles.pill, isOffline && styles.pillOffline]}
    >
      <Ionicons
        color={isOffline ? colors.warning : pendingCount ? colors.muted : colors.success}
        name={isOffline ? 'cloud-offline-outline' : pendingCount ? 'sync-outline' : 'cloud-done-outline'}
        size={14}
      />
      <Text style={[styles.pillText, !isOffline && !pendingCount && styles.pillTextSynced, isOffline && styles.pillTextOffline]}>
        {isOffline ? 'Offline' : pendingCount ? `${pendingCount} pending` : 'Synced'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    backgroundColor: colors.divider,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 5,
    marginLeft: 'auto',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  pillOffline: { backgroundColor: colors.warningSoft },
  pillText: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  pillTextSynced: { color: colors.success },
  pillTextOffline: { color: colors.warning },
  offlineBadge: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderRadius: 99,
    flexDirection: 'row',
    gap: 5,
    marginLeft: 'auto',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  offlineBadgeText: { color: colors.warning, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
});
