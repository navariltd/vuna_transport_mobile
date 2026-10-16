import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MobileRequestDetail, MobileRequestHistoryItem } from '../../features/requests/types';
import { ConnectivityBadge } from '../../offline/components';
import { loadMobileRequestDetails, loadMobileRequestHistory } from '../../offline/request_repository';
import { colors, radius, spacing } from '../../shared/theme';

export default function RequestsScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [requests, setRequests] = useState<MobileRequestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<MobileRequestHistoryItem | null>(null);
  const [requestDetails, setRequestDetails] = useState<MobileRequestDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const loaded = await loadMobileRequestHistory();
      setRequests(loaded.data);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load your requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const openRequest = async (request: MobileRequestHistoryItem) => {
    setSelectedRequest(request);
    setRequestDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    try {
      const loaded = await loadMobileRequestDetails(request.doctype, request.name);
      setRequestDetails(loaded.data);
    } catch (exception) {
      setDetailsError(exception instanceof Error ? exception.message : 'Could not load the request details.');
    } finally {
      setDetailsLoading(false);
    }
  };

  if (!fontsLoaded) return <ActivityIndicator color={colors.ink} style={styles.loading} />;

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl colors={[colors.ink]} onRefresh={() => { setRefreshing(true); void load(); }} refreshing={refreshing} tintColor={colors.ink} />}
    >
      <View style={styles.pageHeader}><Image source={require('../../../assets/icon.png')} style={styles.logo} /><Text style={styles.pageTitle}>Requests</Text><ConnectivityBadge /></View>
      <Text style={styles.title}>Your requests</Text>
      <Text style={styles.subtitle}>Follow the approval and processing status of requests raised from your trips.</Text>
      {loading ? <RequestListSkeleton /> : error ? <View style={styles.messageCard}>
        <Ionicons color={colors.danger} name="alert-circle-outline" size={24} />
        <Text style={styles.messageTitle}>Requests unavailable</Text>
        <Text style={styles.messageText}>{error}</Text>
        <Pressable onPress={() => { setLoading(true); void load(); }} style={styles.retryButton}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View> : requests.length ? <View style={styles.list}>
        {requests.map((request) => <RequestCard key={`${request.doctype}-${request.name}`} onPress={() => { void openRequest(request); }} request={request} />)}
      </View> : <View style={styles.messageCard}>
        <Ionicons color={colors.muted} name="document-text-outline" size={27} />
        <Text style={styles.messageTitle}>No requests yet</Text>
        <Text style={styles.messageText}>Material Requests and Expense Claims raised from Delivery Trips will appear here.</Text>
      </View>}
    </ScrollView>
    <RequestDetailsDialog
      details={requestDetails}
      error={detailsError}
      loading={detailsLoading}
      onClose={() => setSelectedRequest(null)}
      request={selectedRequest}
    />
  </View>;
}

function RequestCard({ request, onPress }: { request: MobileRequestHistoryItem; onPress: () => void }) {
  const expenseClaim = request.doctype === 'Expense Claim';
  return <Pressable onPress={onPress} style={styles.card}>
    <View style={styles.cardHeading}>
      <View style={styles.typeIcon}>
        <Ionicons color={colors.ink} name={expenseClaim ? 'receipt-outline' : 'cube-outline'} size={20} />
      </View>
      <View style={styles.cardTitleCopy}>
        <Text style={styles.typeLabel}>{request.doctype}</Text>
        <Text numberOfLines={1} style={styles.reference}>{request.name}</Text>
      </View>
      <RequestStatus status={request.status} />
      <Ionicons color={colors.faint} name="chevron-forward" size={18} style={styles.cardChevron} />
    </View>
    <View style={styles.details}>
      {request.delivery_trip ? <Detail label="Delivery Trip" value={request.delivery_trip} /> : null}
      <Detail label="Date" value={formatDate(request.date)} />
      {expenseClaim ? <Detail label="Amount" value={`${request.currency || ''} ${formatAmount(request.amount)}`.trim()} /> : <Detail label="Request" value={`${request.purpose || 'Material'} · ${request.item_count || 0} ${(request.item_count || 0) === 1 ? 'item' : 'items'}`} />}
      {request.document_status && request.document_status !== request.status ? <Detail label="Document status" value={request.document_status} /> : null}
    </View>
  </Pressable>;
}

function RequestDetailsDialog({
  details,
  error,
  loading,
  onClose,
  request,
}: {
  details: MobileRequestDetail | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  request: MobileRequestHistoryItem | null;
}) {
  const expenseClaim = request?.doctype === 'Expense Claim';
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(request)}>
    <Pressable onPress={onClose} style={styles.modalBackdrop}>
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeading}>
          <View style={styles.sheetTitleCopy}>
            <Text style={styles.sheetType}>{request?.doctype}</Text>
            <Text numberOfLines={1} style={styles.sheetTitle}>{request?.name}</Text>
          </View>
          {request ? <RequestStatus status={details?.status || request.status} /> : null}
          <Pressable accessibilityLabel="Close request details" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <Ionicons color={colors.ink} name="close" size={23} />
          </Pressable>
        </View>
        {loading ? <View style={styles.detailsState}><ActivityIndicator color={colors.ink} /><Text style={styles.detailsStateText}>Loading request details…</Text></View>
          : error ? <View style={styles.detailsState}><Ionicons color={colors.danger} name="alert-circle-outline" size={25} /><Text style={styles.detailsStateText}>{error}</Text></View>
            : details ? <ScrollView contentContainerStyle={styles.sheetContent} nestedScrollEnabled>
              <View style={styles.summaryGrid}>
                {details.delivery_trip ? <Summary label="Delivery Trip" value={details.delivery_trip} /> : null}
                <Summary label="Date" value={formatDate(details.date)} />
                {expenseClaim ? <Summary label="Total" value={`${details.currency || ''} ${formatAmount(details.amount)}`.trim()} /> : <Summary label="Purpose" value={details.purpose || 'Material Request'} />}
              </View>
              <Text style={styles.itemsTitle}>{expenseClaim ? 'Expenses' : 'Requested items'}</Text>
              {details.items.map((item, index) => expenseClaim
                ? <View key={`${item.expense_type}-${index}`} style={styles.detailItem}>
                  <View style={styles.detailItemHeading}><Text style={styles.detailItemName}>{item.expense_type || `Expense ${index + 1}`}</Text><Text style={styles.detailItemAmount}>{details.currency || ''} {formatAmount(item.amount)}</Text></View>
                  <Text style={styles.detailItemMeta}>{formatDate(item.expense_date)}</Text>
                  {item.description ? <Text style={styles.detailItemDescription}>{item.description}</Text> : null}
                  {Number(item.sanctioned_amount || 0) > 0 && item.sanctioned_amount !== item.amount ? <Text style={styles.sanctioned}>Approved amount: {details.currency || ''} {formatAmount(item.sanctioned_amount)}</Text> : null}
                </View>
                : <View key={`${item.item_code}-${index}`} style={styles.detailItem}>
                  <Text style={styles.detailItemName}>{item.item_name || item.item_code}</Text>
                  <Text style={styles.detailItemMeta}>{item.item_code} · {item.qty} {item.uom}</Text>
                  {item.warehouse ? <Text style={styles.detailItemDescription}>Warehouse: {item.warehouse}</Text> : null}
                  {item.schedule_date ? <Text style={styles.detailItemDescription}>Required by: {formatDate(item.schedule_date)}</Text> : null}
                </View>)}
            </ScrollView> : null}
      </Pressable>
    </Pressable>
  </Modal>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text numberOfLines={1} style={styles.summaryValue}>{value}</Text></View>;
}

function RequestStatus({ status }: { status: string }) {
  const normalized = (status || 'Draft').toLowerCase();
  const success = ['approved', 'completed', 'fulfilled', 'transferred'].some((value) => normalized.includes(value));
  const danger = ['rejected', 'cancelled', 'stopped'].some((value) => normalized.includes(value));
  return <View style={[styles.status, success && styles.statusSuccess, danger && styles.statusDanger]}>
    <Text style={[styles.statusText, success && styles.statusSuccessText, danger && styles.statusDangerText]}>{status || 'Draft'}</Text>
  </View>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text numberOfLines={1} style={styles.detailValue}>{value}</Text></View>;
}

function RequestListSkeleton() {
  return <View accessibilityLabel="Loading requests" accessibilityRole="progressbar" style={styles.list}>
    {[0, 1, 2].map((index) => <View key={index} style={styles.skeletonCard}>
      <View style={styles.skeletonHeading}><View style={styles.skeletonIcon} /><View style={styles.skeletonTitle}><View style={styles.skeletonLabel} /><View style={styles.skeletonReference} /></View><View style={styles.skeletonStatus} /></View>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
    </View>)}
  </View>;
}

function formatDate(value?: string) {
  if (!value) return 'Not set';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString([], { dateStyle: 'medium' });
}

function formatAmount(value?: number) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  loading: { backgroundColor: colors.background, flex: 1 },
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, padding: 28, paddingBottom: 48, paddingTop: 64 },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  logo: { borderRadius: 7, height: 28, width: 28 },
  pageTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 20 },
  title: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 38, marginTop: 28 },
  subtitle: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, marginTop: 10 },
  list: { marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: 13, padding: spacing.md },
  cardHeading: { alignItems: 'center', flexDirection: 'row' },
  typeIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 11, height: 42, justifyContent: 'center', width: 42 },
  cardTitleCopy: { flex: 1, marginLeft: 12 },
  typeLabel: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 11 },
  reference: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 14, marginTop: 3 },
  status: { backgroundColor: colors.warningSoft, borderRadius: 99, marginLeft: 8, paddingHorizontal: 9, paddingVertical: 5 },
  statusSuccess: { backgroundColor: colors.successSoft },
  statusDanger: { backgroundColor: colors.dangerSoft },
  statusText: { color: colors.warning, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  statusSuccessText: { color: colors.success },
  statusDangerText: { color: colors.danger },
  cardChevron: { marginLeft: 4 },
  details: { borderTopColor: colors.divider, borderTopWidth: 1, marginTop: 14, paddingTop: 7 },
  detailRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 30 },
  detailLabel: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  detailValue: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 12, marginLeft: 16, maxWidth: '64%', textAlign: 'right' },
  messageCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.xl, padding: spacing.xl },
  messageTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 12 },
  messageText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: 'center' },
  retryButton: { borderColor: colors.ink, borderRadius: radius.sm, borderWidth: 1, marginTop: 18, minHeight: 42, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  skeletonCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: 13, padding: spacing.md },
  skeletonHeading: { alignItems: 'center', flexDirection: 'row' },
  skeletonIcon: { backgroundColor: colors.divider, borderRadius: 11, height: 42, width: 42 },
  skeletonTitle: { flex: 1, marginLeft: 12 },
  skeletonLabel: { backgroundColor: colors.divider, borderRadius: 5, height: 10, width: 85 },
  skeletonReference: { backgroundColor: colors.divider, borderRadius: 5, height: 14, marginTop: 7, width: 145 },
  skeletonStatus: { backgroundColor: colors.divider, borderRadius: 99, height: 24, width: 65 },
  skeletonLine: { backgroundColor: colors.divider, borderRadius: 5, height: 11, marginTop: 18, width: '100%' },
  skeletonLineShort: { marginTop: 10, width: '70%' },
  modalBackdrop: { backgroundColor: 'rgba(9, 9, 11, 0.42)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '84%', minHeight: 360, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 99, height: 4, marginTop: 10, width: 42 },
  sheetHeading: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: 16, paddingTop: 16 },
  sheetTitleCopy: { flex: 1 },
  sheetType: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 11 },
  sheetTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 3 },
  closeButton: { alignItems: 'center', height: 38, justifyContent: 'center', marginLeft: 5, width: 38 },
  detailsState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 270, padding: spacing.xl },
  detailsStateText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 13, textAlign: 'center' },
  sheetContent: { padding: spacing.lg, paddingBottom: 18 },
  summaryGrid: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 7 },
  summaryItem: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 34 },
  summaryLabel: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12 },
  summaryValue: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12, marginLeft: 16, maxWidth: '65%', textAlign: 'right' },
  itemsTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 16, marginBottom: 4, marginTop: spacing.lg },
  detailItem: { borderBottomColor: colors.divider, borderBottomWidth: 1, paddingVertical: 14 },
  detailItemHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  detailItemName: { color: colors.ink, flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  detailItemAmount: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 13, marginLeft: 12 },
  detailItemMeta: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 5 },
  detailItemDescription: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6 },
  sanctioned: { color: colors.success, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 7 },
});
