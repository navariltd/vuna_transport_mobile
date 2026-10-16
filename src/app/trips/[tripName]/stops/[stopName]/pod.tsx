import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenHeader, Section, StateView } from '../../../../../features/trips/components';
import { prepareProofOfDelivery, submitProofOfDelivery, uploadPODAttachment } from '../../../../../features/trips/api';
import type { PODItem, ProofOfDeliveryDraft } from '../../../../../features/trips/types';
import { SignaturePad } from '../../../../../features/proof-of-delivery/signature_pad';
import { colors, radius, spacing } from '../../../../../shared/theme';

export default function ProofOfDeliveryScreen() {
  const { tripName, stopName } = useLocalSearchParams<{ tripName: string; stopName: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [pod, setPod] = useState<ProofOfDeliveryDraft | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState('Uploading delivery proof…');
  const submissionLock = useRef(false);
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; filename: string } | null>(null);

  const load = useCallback(async () => {
    if (!tripName || !stopName) return;
    try {
      setError('');
      setPod(await prepareProofOfDelivery(tripName, stopName));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not prepare Proof of Delivery.');
    } finally {
      setLoading(false);
    }
  }, [stopName, tripName]);

  useEffect(() => { void load(); }, [load]);
  const rejectedTotal = useMemo(() => pod?.items.reduce((sum, item) => sum + Math.max(item.ordered_qty - item.delivered_qty, 0), 0) || 0, [pod]);

  const updateItem = (name: string, changes: Partial<PODItem>) => {
    setPod((current) => current ? { ...current, items: current.items.map((item) => item.name === name ? { ...item, ...changes } : item) } : current);
  };

  const setOutcome = (accepted: boolean) => {
    setPod((current) => current ? {
      ...current,
      items: current.items.map((item) => ({
        ...item,
        delivered_qty: accepted ? item.ordered_qty : 0,
        rejected_qty: accepted ? 0 : item.ordered_qty,
      })),
    } : current);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera permission needed', 'Allow camera access to capture delivery evidence.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const longestEdge = Math.max(asset.width || 0, asset.height || 0);
    try {
      const image = ImageManipulator.manipulate(asset.uri);
      if (longestEdge > 1600) {
        image.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
      }
      const rendered = await image.renderAsync();
      const prepared = await rendered.saveAsync({
        base64: true,
        compress: 0.55,
        format: SaveFormat.JPEG,
      });
      if (!prepared.base64) throw new Error('The prepared image has no data.');
      setPhoto({
        uri: prepared.uri,
        base64: prepared.base64,
        filename: `delivery-${Date.now()}.jpg`,
      });
    } catch {
      Alert.alert('Photo processing failed', 'Please take the delivery photo again.');
    }
  };

  const submit = async () => {
    if (submissionLock.current || !pod || !tripName || !stopName) return;
    if (!pod.received_by?.trim()) return setError('Enter the receiver name before submitting.');
    if (rejectedTotal > 0 && !pod.exception_reason) return setError('Select an exception reason for the rejected quantity.');
    const missingReason = pod.items.find((item) => item.ordered_qty - item.delivered_qty > 0 && !item.rejection_reason && !item.rejection_reason_remarks);
    if (missingReason) return setError(`Select a rejection reason for ${missingReason.item_name || missingReason.item_code}.`);

    submissionLock.current = true;
    setSubmitting(true);
    setSubmissionMessage('Uploading delivery proof…');
    setError('');
    try {
      let nextPod = { ...pod };
      const [signatureUpload, photoUpload] = await Promise.all([
        signatureSvg
          ? uploadPODAttachment(tripName, stopName, pod.name, 'signature', signatureSvg, `signature-${pod.name}.svg`, 'text')
          : Promise.resolve(null),
        photo
          ? uploadPODAttachment(tripName, stopName, pod.name, 'delivery_photo', photo.base64, photo.filename)
          : Promise.resolve(null),
      ]);
      if (signatureUpload) nextPod.signature = signatureUpload.file_url;
      if (photoUpload) nextPod.delivery_photo = photoUpload.file_url;
      nextPod.items = nextPod.items.map((item) => ({ ...item, rejected_qty: Math.max(item.ordered_qty - item.delivered_qty, 0) }));
      setSubmissionMessage('Finalising delivery…');
      const result = await submitProofOfDelivery(tripName, stopName, nextPod);
      const focus = result.trip.next_stop ? `?focusStop=${encodeURIComponent(result.trip.next_stop)}` : '';
      router.replace(`/trips/${encodeURIComponent(tripName)}${focus}` as never);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not submit Proof of Delivery.');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;
  if (error && !pod) return <View style={styles.screen}><ScreenHeader back title="Proof of Delivery" /><StateView error={error} onRetry={load} /></View>;
  if (!pod) return null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <StatusBar style="dark" />
      <Modal animationType="fade" onRequestClose={() => undefined} statusBarTranslucent transparent visible={submitting}>
        <View style={styles.submissionOverlay}>
          <View style={styles.submissionCard}>
            <ActivityIndicator color={colors.ink} size="large" />
            <Text style={styles.submissionTitle}>{submissionMessage}</Text>
            <Text style={styles.submissionHint}>Please keep the app open.</Text>
          </View>
        </View>
      </Modal>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader back title="Proof of Delivery" />
        <Text style={styles.customer}>{pod.customer}</Text>
        <Text style={styles.reference}>{pod.delivery_note}</Text>

        <View style={styles.outcomeRow}>
          <Pressable onPress={() => setOutcome(true)} style={styles.outcomeButton}><Ionicons color={colors.success} name="checkmark-circle-outline" size={22} /><Text style={styles.outcomeText}>Accept all</Text></Pressable>
          <Pressable onPress={() => setOutcome(false)} style={styles.outcomeButton}><Ionicons color={colors.danger} name="close-circle-outline" size={22} /><Text style={styles.outcomeText}>Reject all</Text></Pressable>
        </View>

        <Section title="Delivered quantities">
          {pod.items.map((item) => {
            const rejected = Math.max(item.ordered_qty - item.delivered_qty, 0);
            return <View key={item.name} style={styles.itemCard}>
              <View style={styles.itemHeader}><View style={styles.itemCopy}><Text style={styles.itemName}>{item.item_name || item.item_code}</Text><Text style={styles.itemMeta}>{item.item_code}{item.batch_no ? ` · Batch ${item.batch_no}` : ''}</Text></View><Text style={styles.ordered}>of {item.ordered_qty} {item.uom}</Text></View>
              <View style={styles.quantityRow}><View style={styles.quantityField}><Text style={styles.inputLabel}>ACCEPTED · {item.uom}</Text><TextInput keyboardType="decimal-pad" onChangeText={(value: string) => updateItem(item.name, { delivered_qty: Math.min(Math.max(Number(value) || 0, 0), item.ordered_qty) })} selectTextOnFocus style={styles.quantityInput} value={String(item.delivered_qty)} /></View><View style={styles.quantityDivider} /><View style={styles.quantityField}><Text style={styles.inputLabel}>REJECTED · {item.uom}</Text><Text style={[styles.rejected, rejected > 0 && styles.rejectedActive]}>{rejected}</Text></View></View>
              {rejected > 0 ? <View style={styles.reasons}><Text style={styles.inputLabel}>REJECTION REASON</Text><View style={styles.chips}>{pod.rejection_reasons.map((reason) => <Pressable key={reason} onPress={() => updateItem(item.name, { rejection_reason: reason })} style={[styles.chip, item.rejection_reason === reason && styles.chipSelected]}><Text style={[styles.chipText, item.rejection_reason === reason && styles.chipTextSelected]}>{reason}</Text></Pressable>)}</View><TextInput multiline onChangeText={(value: string) => updateItem(item.name, { rejection_reason_remarks: value })} placeholder="Additional details" placeholderTextColor={colors.faint} style={styles.textAreaSmall} value={item.rejection_reason_remarks || ''} /></View> : null}
            </View>;
          })}
        </Section>

        <Section title="Receiver">
          <TextInput onChangeText={(value: string) => setPod({ ...pod, received_by: value })} placeholder="Receiver name" placeholderTextColor={colors.faint} style={styles.input} value={pod.received_by || ''} />
          <TextInput keyboardType="phone-pad" onChangeText={(value: string) => setPod({ ...pod, receiver_phone: value })} placeholder="Phone number (optional)" placeholderTextColor={colors.faint} style={styles.input} value={pod.receiver_phone || ''} />
        </Section>

        {rejectedTotal > 0 ? <Section title="Delivery outcome"><View style={styles.chips}>{pod.exception_reasons.map((reason) => <Pressable key={reason} onPress={() => setPod({ ...pod, exception_reason: reason })} style={[styles.chip, pod.exception_reason === reason && styles.chipSelected]}><Text style={[styles.chipText, pod.exception_reason === reason && styles.chipTextSelected]}>{reason}</Text></Pressable>)}</View></Section> : null}

        <Section title="Receiver signature"><SignaturePad onChange={setSignatureSvg} /></Section>
        <Section title="Delivery photo">
          <Pressable onPress={takePhoto} style={styles.photoButton}>
            {photo ? <Image source={{ uri: photo.uri }} style={styles.photo} /> : <><Ionicons color={colors.ink} name="camera-outline" size={25} /><Text style={styles.photoText}>Take delivery photo</Text></>}
          </Pressable>
        </Section>
        <Section title="Remarks"><TextInput multiline onChangeText={(value: string) => setPod({ ...pod, remarks: value })} placeholder="Add delivery notes or observations" placeholderTextColor={colors.faint} style={styles.textArea} value={pod.remarks || ''} /></Section>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}><Pressable disabled={submitting} onPress={submit} style={[styles.submit, submitting && styles.disabled]}>{submitting ? <ActivityIndicator color={colors.surface} /> : <><Text style={styles.submitText}>Confirm and complete stop</Text><Ionicons color={colors.surface} name="checkmark" size={21} /></>}</Pressable></View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 130, paddingTop: 58 },
  customer: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: spacing.xl },
  reference: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 6 },
  outcomeRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  outcomeButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  outcomeText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  itemCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: 12, padding: spacing.md },
  itemHeader: { alignItems: 'flex-start', flexDirection: 'row' },
  itemCopy: { flex: 1 },
  itemName: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  itemMeta: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  ordered: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 12 },
  quantityRow: { alignItems: 'center', flexDirection: 'row', marginTop: 16 },
  quantityField: { flex: 1 },
  quantityDivider: { backgroundColor: colors.divider, height: 42, marginHorizontal: 18, width: 1 },
  inputLabel: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8 },
  quantityInput: { borderBottomColor: colors.ink, borderBottomWidth: 1, color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 5, paddingBottom: 5 },
  rejected: { color: colors.muted, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 9 },
  rejectedActive: { color: colors.danger },
  reasons: { borderTopColor: colors.divider, borderTopWidth: 1, marginTop: 16, paddingTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 11 },
  chipTextSelected: { color: colors.surface },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 15, marginBottom: 10, minHeight: 50, paddingHorizontal: 14 },
  textAreaSmall: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 12, minHeight: 72, padding: 12, textAlignVertical: 'top' },
  photoButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderStyle: 'dashed', borderWidth: 1, height: 170, justifyContent: 'center', overflow: 'hidden' },
  photo: { height: '100%', width: '100%' },
  photoText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 10 },
  textArea: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 120, padding: 14, textAlignVertical: 'top' },
  error: { color: colors.danger, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 20, marginTop: spacing.lg },
  footer: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, bottom: 0, left: 0, padding: 16, paddingBottom: 28, position: 'absolute', right: 0 },
  submit: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 54 },
  submitText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.6 },
  submissionOverlay: { alignItems: 'center', backgroundColor: 'rgba(9, 9, 11, 0.42)', flex: 1, justifyContent: 'center', padding: spacing.xl },
  submissionCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, maxWidth: 320, paddingHorizontal: 34, paddingVertical: 30, width: '100%' },
  submissionTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 18, textAlign: 'center' },
  submissionHint: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 7, textAlign: 'center' },
});
