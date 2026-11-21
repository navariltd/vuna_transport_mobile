import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAddress, StatusBadge } from './components';
import { TripMap } from './trip_map';
import type { DeliveryStop, TransportTask } from './types';
import { taskTitle } from './task_model';
import { colors, radius, spacing } from '../../shared/theme';
import { useStopNavigation } from './use_stop_navigation';

export function useTaskFonts() {
  return useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
}

export function StopLocation({ stop, party, tripName }: { stop: DeliveryStop; party?: string; tripName: string }) {
  const navigate = useStopNavigation(tripName, stop);
  const address = formatAddress(stop);
  const phone = stop.contact_details?.mobile_no || stop.contact_details?.phone || stop.address_details?.phone;
  const recipient = [stop.contact_details?.first_name, stop.contact_details?.last_name].filter(Boolean).join(' ') || 'Not provided';
  return <>
    <View style={taskStyles.map}><TripMap navigationTripName={tripName} stops={[stop]} activeStop={stop.name} height={230} /></View>
    <Text style={taskStyles.place}>{party || stop.vuna_depot_names || stop.location_label || stop.customer || 'Depot'}</Text>
    <View style={taskStyles.addressCard}>
      <Ionicons name="location-outline" size={24} color={colors.ink} />
      <View style={taskStyles.flex}><Text style={taskStyles.eyebrow}>STOP ADDRESS</Text><Text style={taskStyles.body}>{address || 'Address unavailable'}</Text></View>
      {address ? <Pressable accessibilityLabel="Navigate to stop" onPress={navigate} style={taskStyles.roundButton}><Ionicons name="navigate" size={20} color={colors.surface} /></Pressable> : null}
    </View>
    <View style={taskStyles.contactRow}>
      <View style={taskStyles.flex}><Text style={taskStyles.eyebrow}>CONTACT / RECIPIENT</Text><Text style={taskStyles.body}>{recipient}</Text>{phone ? <Text style={taskStyles.muted}>{phone}</Text> : null}</View>
      {phone ? <Pressable accessibilityLabel="Call stop contact" onPress={() => void Linking.openURL(`tel:${phone}`)} style={taskStyles.outline}><Ionicons name="call-outline" size={18} color={colors.ink} /><Text style={taskStyles.outlineText}>Call</Text></Pressable> : null}
    </View>
  </>;
}

export function StopActionCard({ task, number, onPress }: { task: TransportTask; number: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={taskStyles.actionCard}>
    <View style={taskStyles.sequence}><Text style={taskStyles.sequenceText}>{number}</Text></View>
    <View style={taskStyles.flex}><View style={taskStyles.cardHeading}><Text style={taskStyles.cardTitle}>{taskTitle(task)}</Text><StatusBadge status={task.status} /></View>
      <Text style={taskStyles.reference}>{task.reference_name || task.return_request || task.dispatch_stock_entry || task.delivery_note || 'Document pending'}</Text>
      {task.items?.length ? <Text style={taskStyles.muted}>{task.items.length} item {task.items.length === 1 ? 'line' : 'lines'}</Text> : null}
      {task.blocked_reason ? <Text style={taskStyles.warning}>{task.blocked_reason}</Text> : null}
    </View><Ionicons name="chevron-forward" color={colors.faint} size={20} />
  </Pressable>;
}

export const taskStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 58, paddingBottom: 130 },
  map: { marginHorizontal: -spacing.xl, marginTop: spacing.lg },
  place: { fontFamily: 'Inter_700Bold', fontSize: 23, color: colors.ink, marginTop: spacing.lg },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: colors.muted, letterSpacing: 1 },
  body: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 23, color: colors.ink, marginTop: 6 },
  muted: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.muted, lineHeight: 19, marginTop: 5 },
  flex: { flex: 1 },
  addressCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.lg },
  roundButton: { backgroundColor: colors.ink, borderRadius: 24, height: 46, width: 46, alignItems: 'center', justifyContent: 'center' },
  contactRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: spacing.lg, borderBottomColor: colors.divider, borderBottomWidth: 1 },
  outline: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, minHeight: 44, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  outlineText: { fontFamily: 'Inter_600SemiBold', color: colors.ink, fontSize: 13 },
  actionCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: 12 },
  sequence: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  sequenceText: { color: colors.ink, fontFamily: 'Inter_600SemiBold' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  reference: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 7 },
  warning: { color: colors.warning, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 9 },
  notice: { backgroundColor: colors.warningSoft, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  success: { backgroundColor: colors.successSoft, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  footer: { backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  primary: { backgroundColor: colors.ink, borderRadius: radius.sm, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: spacing.md },
  primaryText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  itemList: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 12, borderBottomColor: colors.divider, borderBottomWidth: 1 },
  quantity: { fontFamily: 'Inter_700Bold', color: colors.ink, fontSize: 14 },
});
