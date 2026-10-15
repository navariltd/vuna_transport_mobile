import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader, Section, StateView, StatusBadge, formatAddress, formatDateTime } from '../../../../../features/trips/components';
import { getDeliveryNoteDetails } from '../../../../../features/trips/api';
import type { DeliveryNoteDetails } from '../../../../../features/trips/types';
import { colors, radius, spacing } from '../../../../../shared/theme';

export default function DeliveryNoteScreen() {
  const { tripName, stopName } = useLocalSearchParams<{ tripName: string; stopName: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [details, setDetails] = useState<DeliveryNoteDetails | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tripName || !stopName) return;
    try {
      setError('');
      setDetails(await getDeliveryNoteDetails(tripName, stopName));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load the Delivery Note.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stopName, tripName]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;
  if (error || !details) return <View style={styles.screen}><ScreenHeader back title="Delivery Note" /><StateView error={error || 'Delivery Note not found.'} onRetry={load} /></View>;

  const { stop, delivery_note: note } = details;
  const phone = stop.contact_details?.mobile_no || stop.contact_details?.phone || stop.address_details?.phone;
  const address = formatAddress(stop);
  const completed = Boolean(stop.visited || stop.proof_of_delivery?.docstatus === 1);
  const navigate = async () => {
    const query = stop.lat && stop.lng ? `${stop.lat},${stop.lng}` : address;
    if (query) await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.ink} />}
      >
        <ScreenHeader back title="Delivery Note" />
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}><Text style={styles.noteName}>{note.name}</Text><Text style={styles.customer}>{note.customer_name || note.customer}</Text></View>
          <StatusBadge status={stop.delivery_status || note.status} />
        </View>

        <View style={styles.addressCard}>
          <View style={styles.addressIcon}><Ionicons color={colors.ink} name="location-outline" size={24} /></View>
          <View style={styles.addressCopy}><Text style={styles.label}>DELIVERY ADDRESS</Text><Text style={styles.address}>{address || 'Address unavailable'}</Text></View>
          {address ? <Pressable accessibilityLabel="Open navigation" onPress={navigate} style={styles.iconButton}><Ionicons color={colors.surface} name="navigate" size={20} /></Pressable> : null}
        </View>

        <View style={styles.contactRow}>
          <View style={styles.contactCopy}>
            <Text style={styles.label}>RECIPIENT</Text>
            <Text style={styles.contactName}>{[stop.contact_details?.first_name, stop.contact_details?.last_name].filter(Boolean).join(' ') || stop.customer || 'Not provided'}</Text>
            {phone ? <Text style={styles.phone}>{phone}</Text> : null}
          </View>
          {phone && !completed ? <Pressable accessibilityLabel="Call customer" onPress={() => Linking.openURL(`tel:${phone}`)} style={styles.outlineButton}><Ionicons color={colors.ink} name="call-outline" size={19} /><Text style={styles.outlineText}>Call</Text></Pressable> : null}
        </View>

        {stop.estimated_arrival ? <View style={styles.timeRow}><Ionicons color={colors.muted} name="time-outline" size={22} /><View><Text style={styles.label}>EXPECTED ARRIVAL</Text><Text style={styles.timeValue}>{formatDateTime(stop.estimated_arrival)}</Text></View></View> : null}

        <Section title={`Items · ${note.items.length}`}>
          <View style={styles.itemList}>{note.items.map((item) => <View key={item.name} style={styles.itemRow}>
            <View style={styles.itemCopy}><Text style={styles.itemName}>{item.item_name || item.item_code}</Text><Text style={styles.itemCode}>{item.item_code}{item.batch_no ? ` · Batch ${item.batch_no}` : ''}</Text></View>
            <Text style={styles.itemQty}>{item.qty} {item.uom}</Text>
          </View>)}</View>
        </Section>

        {completed ? <View style={styles.completedCard}><Ionicons color={colors.success} name="checkmark-circle" size={24} /><View style={styles.completedCopy}><Text style={styles.completedTitle}>Delivery recorded</Text><Text style={styles.completedText}>{stop.proof_of_delivery?.name || 'Proof of Delivery submitted'}</Text></View></View> : null}
      </ScrollView>
      {!completed ? <View style={styles.footer}><Pressable onPress={() => router.push(`/trips/${encodeURIComponent(tripName)}/stops/${encodeURIComponent(stopName)}/pod` as never)} style={styles.primary}><Text style={styles.primaryText}>Complete delivery</Text><Ionicons color={colors.surface} name="arrow-forward" size={20} /></Pressable></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 120, paddingTop: 58 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: spacing.lg },
  titleCopy: { flex: 1 },
  noteName: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 23 },
  customer: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 15, marginTop: 7 },
  addressCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', marginTop: spacing.xl, padding: spacing.lg },
  addressIcon: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center', width: 32 },
  addressCopy: { flex: 1, marginHorizontal: 12 },
  label: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1 },
  address: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22, marginTop: 7 },
  iconButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  contactRow: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: spacing.xl },
  contactCopy: { flex: 1 },
  contactName: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 7 },
  phone: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 4 },
  outlineButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 7, minHeight: 44, paddingHorizontal: 15 },
  outlineText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  timeRow: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', gap: 13, paddingVertical: spacing.lg },
  timeValue: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 5 },
  itemList: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  itemRow: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', gap: 12, padding: 16 },
  itemCopy: { flex: 1 },
  itemName: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  itemCode: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  itemQty: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 14 },
  completedCard: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: radius.md, flexDirection: 'row', marginTop: spacing.xl, padding: spacing.lg },
  completedCopy: { marginLeft: 12 },
  completedTitle: { color: colors.success, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  completedText: { color: colors.success, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, bottom: 0, left: 0, padding: 16, paddingBottom: 28, position: 'absolute', right: 0 },
  primary: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'center', minHeight: 54 },
  primaryText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginRight: 10 },
});
