import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ConnectivityBadge } from '../../offline/components';
import { colors, radius, spacing } from '../../shared/theme';
import type { DeliveryStop } from './types';

export function ScreenHeader({ title, back = false, right }: { title: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityLabel="Go back" hitSlop={12} onPress={() => router.back()} style={styles.back}>
          <Ionicons color={colors.ink} name="chevron-back" size={24} />
        </Pressable>
      ) : null}
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      {right}
      <ConnectivityBadge />
    </View>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const normalized = (status || 'Pending').toLowerCase();
  const completed = ['completed', 'accepted', 'delivered'].some((value) => normalized.includes(value));
  const failed = ['failed', 'rejected', 'exception'].some((value) => normalized.includes(value));
  return (
    <View style={[styles.badge, completed && styles.badgeSuccess, failed && styles.badgeDanger]}>
      <Text style={[styles.badgeText, completed && styles.badgeSuccessText, failed && styles.badgeDangerText]}>
        {status || 'Pending'}
      </Text>
    </View>
  );
}

export function TripProgress({ completed, total }: { completed: number; total: number }) {
  const percentage = total ? Math.min(Math.max(completed / total, 0), 1) : 0;
  return (
    <View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressText}>{completed} of {total} stops completed</Text>
        <Text style={styles.progressText}>{Math.round(percentage * 100)}%</Text>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percentage * 100}%` }]} /></View>
    </View>
  );
}

export function SemiCircleTripProgress({ completed, total }: { completed: number; total: number }) {
  const percentage = total ? Math.min(Math.max(completed / total, 0), 1) : 0;
  const radius = 58;
  const arcLength = Math.PI * radius;

  return (
    <View accessibilityLabel={`${completed} of ${total} stops completed`} style={styles.semiCircleProgress}>
      <Svg height={76} width={132}>
        <Path d="M 8 66 A 58 58 0 0 1 124 66" fill="none" stroke={colors.divider} strokeLinecap="round" strokeWidth={9} />
        <Path
          d="M 8 66 A 58 58 0 0 1 124 66"
          fill="none"
          stroke={percentage >= 1 ? colors.success : colors.ink}
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={arcLength * (1 - percentage)}
          strokeLinecap="round"
          strokeWidth={9}
        />
      </Svg>
      <View pointerEvents="none" style={styles.semiCircleLabel}>
        <Text style={styles.semiCircleValue}>{completed}/{total}</Text>
        <Text style={styles.semiCircleCaption}>STOPS</Text>
      </View>
    </View>
  );
}

export function DeliveryStopCard({
  stop,
  current,
  onPress,
}: {
  stop: DeliveryStop;
  current?: boolean;
  onPress: () => void;
}) {
  const address = formatAddress(stop);
  return (
    <Pressable onPress={onPress} style={[styles.stopCard, current && styles.currentStop]}>
      <View style={styles.stopSequence}>
        <Text style={styles.stopNumber}>{stop.idx}</Text>
        <View style={[styles.stopLine, stop.visited ? styles.stopLineCompleted : null]} />
      </View>
      <View style={styles.stopBody}>
        <View style={styles.stopHeading}>
          <Text numberOfLines={1} style={styles.stopCustomer}>{stop.customer || 'Customer'}</Text>
          <StatusBadge status={stop.delivery_status} />
        </View>
        <Text style={styles.stopAddress}>{address || 'Delivery address unavailable'}</Text>
        {stop.estimated_arrival ? <Text style={styles.stopTime}>Expected {formatDateTime(stop.estimated_arrival)}</Text> : null}
        {stop.delivery_note ? <Text style={styles.stopNote}>{stop.delivery_note}</Text> : null}
      </View>
      <Ionicons color={colors.faint} name="chevron-forward" size={20} />
    </Pressable>
  );
}

export function StateView({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading?: boolean;
  error?: string;
  empty?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.state}>
      {loading ? <ActivityIndicator color={colors.ink} /> : null}
      <Text style={styles.stateText}>{error || empty}</Text>
      {error && onRetry ? <Pressable onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

export function formatAddress(stop: DeliveryStop) {
  const address = stop.address_details;
  if (!address) return stop.customer_address || stop.address || '';
  return [address.address_line1, address.address_line2, address.city, address.county]
    .filter(Boolean)
    .join(', ');
}

export function formatDateTime(value?: string) {
  if (!value) return '';
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 44 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: -10, marginRight: 4, width: 44 },
  headerTitle: { color: colors.ink, flex: 1, fontFamily: 'Inter_700Bold', fontSize: 20 },
  badge: { backgroundColor: colors.warningSoft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: colors.warning, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  badgeSuccessText: { color: colors.success },
  badgeDangerText: { color: colors.danger },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 12 },
  progressTrack: { backgroundColor: colors.divider, borderRadius: 4, height: 6, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.ink, borderRadius: 4, height: 6 },
  semiCircleProgress: { height: 76, position: 'relative', width: 132 },
  semiCircleLabel: { alignItems: 'center', bottom: 2, left: 0, position: 'absolute', right: 0 },
  semiCircleValue: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 21 },
  semiCircleCaption: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1, marginTop: 1 },
  stopCard: { alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', marginBottom: 12, padding: 16 },
  currentStop: { borderColor: colors.ink, borderWidth: 1.5 },
  stopSequence: { alignItems: 'center', marginRight: 12 },
  stopNumber: { backgroundColor: colors.ink, borderRadius: 15, color: colors.surface, fontFamily: 'Inter_700Bold', fontSize: 12, lineHeight: 30, overflow: 'hidden', textAlign: 'center', width: 30 },
  stopLine: { backgroundColor: colors.divider, flex: 1, marginTop: 7, minHeight: 36, width: 2 },
  stopLineCompleted: { backgroundColor: colors.success },
  stopBody: { flex: 1 },
  stopHeading: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  stopCustomer: { color: colors.ink, flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  stopAddress: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 8 },
  stopTime: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 7 },
  stopNote: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 7 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 260, padding: spacing.xl },
  stateText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 14, textAlign: 'center' },
  retry: { borderColor: colors.ink, borderRadius: radius.sm, borderWidth: 1, marginTop: 18, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.1, marginBottom: 12, textTransform: 'uppercase' },
});
