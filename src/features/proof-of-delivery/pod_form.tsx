import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { FieldError, TaskErrorBanner } from '../requests/components';
import { ScreenHeader, Section } from '../trips/components';
import { useTaskFonts } from '../trips/task_components';
import { SignaturePad } from './signature_pad';
import { depotRejectedQuantity, rejectedQuantity, validatePODForm, type PODFormDraft, type PODFormItem, type PODFormSubmission } from './form_model';
import { persistPODPhoto, removePODPhoto } from '../../offline/files';
import { colors, radius, spacing } from '../../shared/theme';

type Props = {
  initial: PODFormDraft; initialSignature?: string | null; initialPhoto?: { uri: string; filename: string } | null;
  queuedStatus?: string | null; onSubmit: (value: PODFormSubmission) => Promise<void>;
};

/** One driver-facing editor; transaction-specific adapters own posting and sync. */
export function PODForm({ initial, initialSignature, initialPhoto, queuedStatus, onSubmit }: Props) {
  const [fontsLoaded] = useTaskFonts();
  const [draft, setDraft] = useState(initial);
  const [signature, setSignature] = useState<string | null>(initialSignature || null);
  const [signaturePreview, setSignaturePreview] = useState(Boolean(initialSignature));
  const [photo, setPhoto] = useState(initialPhoto || null);
  const [busy, setBusy] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locked = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const pickup = draft.mode === 'pickup';
  const title = pickup ? 'Proof of Pickup' : 'Proof of Delivery';
  useEffect(() => { if (error) requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: true })); }, [error]);
  const update = (id: string, values: Partial<PODFormItem>) => {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, ...values } : item) }));
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.endsWith(`.${id}`))));
  };
  const outcome = (accepted: boolean) => setDraft((current) => ({ ...current, items: current.items.map((item) => ({ ...item, accepted: String(accepted ? item.planned : 0), rejected: String(accepted ? 0 : item.planned), recordMissing: false })) }));
  const takePhoto = async () => {
    if (processingPhoto || busy) return;
    setProcessingPhoto(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { Alert.alert('Camera permission needed', 'Allow camera access to capture delivery evidence.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const image = ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > 1600) image.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
      const rendered = await image.renderAsync();
      const prepared = await rendered.saveAsync({ compress: 0.55, format: SaveFormat.JPEG });
      const filename = `delivery-${Date.now()}.jpg`;
      const uri = await persistPODPhoto(prepared.uri, filename);
      // Queued evidence still belongs to the outbox until sync succeeds.
      if (!queuedStatus) removePODPhoto(photo?.uri);
      setPhoto({ uri, filename });
    } catch { setError('Could not capture the photo. Please try again.'); }
    finally { setProcessingPhoto(false); }
  };
  const submit = async () => {
    if (locked.current || processingPhoto) return;
    const validation = validatePODForm(draft);
    setErrors(validation);
    if (Object.keys(validation).length) {
      setError('Complete the highlighted fields before submitting.');
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    locked.current = true; setBusy(true); setError('');
    try { await onSubmit({ draft, signatureSvg: signature, photo }); }
    catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not submit this proof.'); }
    finally { locked.current = false; setBusy(false); }
  };
  if (!fontsLoaded) return <View style={styles.screen}><ActivityIndicator /></View>;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <StatusBar style="dark" />
    <Modal visible={busy} transparent animationType="fade" onRequestClose={() => undefined} statusBarTranslucent><View style={styles.overlay}><View style={styles.modal}><ActivityIndicator size="large" color={colors.ink} /><Text style={styles.party}>Submitting proof…</Text><Text style={styles.muted}>Please keep the app open.</Text></View></View></Modal>
    <ScrollView ref={scroll} automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <ScreenHeader back title={title} />
      {error ? <TaskErrorBanner title="Check this proof" message={error} /> : null}
      {queuedStatus ? <View style={styles.notice}><Text style={styles.label}>Saved on this device · {queuedStatus}</Text><Text style={styles.muted}>Stock and trip completion are only confirmed after synchronization.</Text></View> : null}
      <Text style={styles.party}>{draft.party}</Text><Text style={styles.muted}>{draft.reference}</Text>
      <Text style={styles.muted}>Time and current location are recorded automatically when available.</Text>
      <View style={styles.outcomes}>
        <Pressable onPress={() => outcome(true)} style={styles.outcome}><Ionicons name="checkmark-circle-outline" size={22} color={colors.success} /><Text style={styles.label}>{pickup ? 'Collect all' : 'Accept all'}</Text></Pressable>
        <Pressable onPress={() => outcome(false)} style={styles.outcome}><Ionicons name="close-circle-outline" size={22} color={colors.danger} /><Text style={styles.label}>{pickup ? 'Collect none' : 'Reject all'}</Text></Pressable>
      </View>
      <Section title={pickup ? 'Collected quantities' : 'Delivered quantities'}>
        {draft.items.map((item) => {
          const rejected = rejectedQuantity(item, draft.mode);
          const missing = Math.max(item.planned - Number(item.accepted) - rejected, 0);
          return <View key={item.id} style={styles.item}>
            <View style={styles.row}><View style={styles.flex}><Text style={styles.label}>{item.itemName || item.itemCode}</Text><Text style={styles.muted}>{item.itemCode}{item.batch ? ` · Batch ${item.batch}` : ''}</Text></View><Text style={styles.muted}>of {item.planned} {item.uom}</Text></View>
            <View style={styles.quantities}>
              <View style={styles.flex}><Text style={styles.eyebrow}>{pickup ? 'COLLECTED' : 'ACCEPTED'} · {item.uom}</Text><TextInput accessibilityLabel={`${pickup ? 'Collected' : 'Accepted'} quantity for ${item.itemCode}`} keyboardType="decimal-pad" selectTextOnFocus value={item.accepted} onChangeText={(accepted) => update(item.id, { accepted })} style={[styles.quantity, errors[`quantity.${item.id}`] && styles.invalid]} /><FieldError message={errors[`quantity.${item.id}`]} /></View>
              <View style={styles.divider} />
              <View style={styles.flex}><Text style={styles.eyebrow}>{pickup ? 'UNCOLLECTED' : 'REJECTED'} · {item.uom}</Text>{item.recordMissing && !pickup ? <TextInput accessibilityLabel={`Rejected quantity for ${item.itemCode}`} keyboardType="decimal-pad" value={item.rejected} onChangeText={(value) => update(item.id, { rejected: value })} style={[styles.quantity, errors[`rejected.${item.id}`] && styles.invalid]} /> : <Text style={[styles.quantity, rejected > 0 && styles.danger]}>{Number.isFinite(pickup ? missing : rejected) ? pickup ? missing : rejected : '—'}</Text>}<FieldError message={errors[`rejected.${item.id}`]} /></View>
            </View>
            {draft.mode === 'depot' ? <Pressable style={styles.link} onPress={() => update(item.id, { recordMissing: !item.recordMissing, rejected: String(Number.isFinite(rejected) ? rejected : 0) })}><Text style={styles.linkText}>{item.recordMissing ? 'All goods accounted for' : 'Record missing / unaccounted goods'}</Text></Pressable> : null}
            {item.recordMissing ? <Text style={styles.muted}>Unaccounted: {Number.isFinite(missing) ? missing : '—'} {item.uom}. Explain this in Remarks.</Text> : null}
            {rejected > 0 ? <View style={styles.reasons}>
              <Text style={styles.eyebrow}>REJECTION REASON</Text><View style={styles.chips}>{draft.rejectionReasons.map((reason) => <Pressable key={reason} onPress={() => update(item.id, { reason })} style={[styles.chip, item.reason === reason && styles.selected]}><Text style={item.reason === reason ? styles.selectedText : styles.label}>{reason}</Text></Pressable>)}</View>
              <TextInput multiline value={item.reasonNotes || ''} onChangeText={(reasonNotes) => update(item.id, { reasonNotes })} placeholder="Additional details" placeholderTextColor={colors.faint} style={[styles.textArea, errors[`rejection.${item.id}`] && styles.invalid]} /><FieldError message={errors[`rejection.${item.id}`]} />
              {draft.mode === 'depot' ? <>
                <Text style={styles.eyebrow}>WHERE ARE THE REJECTED GOODS?</Text>
                {['All remain on vehicle', 'All received by depot', 'Split between depot and vehicle'].map((custody) => <Pressable key={custody} accessibilityRole="radio" accessibilityState={{ selected: item.custody === custody }} onPress={() => update(item.id, { custody })} style={styles.choice}><Ionicons name={item.custody === custody ? 'radio-button-on' : 'radio-button-off'} size={19} color={colors.ink} /><Text style={styles.label}>{custody}</Text></Pressable>)}
                {item.custody === 'Split between depot and vehicle' ? <><Text style={styles.label}>Rejected quantity received by depot</Text><TextInput keyboardType="decimal-pad" value={item.depotRejected} onChangeText={(depotRejected) => update(item.id, { depotRejected })} style={[styles.input, errors[`custody.${item.id}`] && styles.invalid]} /><FieldError message={errors[`custody.${item.id}`]} /><Text style={styles.muted}>{Math.max(rejected - depotRejectedQuantity(item, rejected), 0)} {item.uom} remain on vehicle (calculated).</Text>{item.availableSerials ? <><Text style={styles.label}>Rejected serials received by depot</Text><TextInput multiline value={item.depotSerials || ''} onChangeText={(depotSerials) => update(item.id, { depotSerials })} style={styles.textArea} /></> : null}</> : null}
              </> : null}
            </View> : null}
            {item.captureBatch ? <View style={styles.reasons}><Text style={styles.label}>Batch number</Text><TextInput value={item.batch || ''} onChangeText={(batch) => update(item.id, { batch })} style={styles.input} /></View> : null}
            {item.availableSerials || item.captureSerials ? <View style={styles.reasons}><Text style={styles.label}>{pickup ? 'Collected' : 'Accepted'} serial numbers</Text><TextInput multiline value={item.serials || ''} onChangeText={(serials) => update(item.id, { serials })} style={styles.textArea} />{rejected > 0 ? <><Text style={styles.label}>Rejected serial numbers</Text><TextInput multiline value={item.rejectedSerials || ''} onChangeText={(rejectedSerials) => update(item.id, { rejectedSerials })} style={styles.textArea} /></> : null}<Text style={styles.muted}>Use only the serial numbers from this consignment, one per line.</Text></View> : null}
          </View>;
        })}
      </Section>
      <Section title={pickup ? 'Released by' : 'Receiver'}>
        <TextInput value={draft.receivedBy} onChangeText={(receivedBy) => { setDraft({ ...draft, receivedBy }); setErrors((current) => ({ ...current, receivedBy: '' })); }} placeholder={pickup ? 'Name of person releasing goods' : 'Receiver name'} autoCapitalize="words" placeholderTextColor={colors.faint} style={[styles.input, errors.receivedBy && styles.invalid]} /><FieldError message={errors.receivedBy} />
        <TextInput value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} keyboardType="phone-pad" placeholder="Phone number (optional)" placeholderTextColor={colors.faint} style={styles.input} />
      </Section>
      <Section title={pickup ? 'Release signature' : 'Receiver signature'}>{signaturePreview && signature ? <><SvgXml xml={signature} width="100%" height={160} /><Pressable style={styles.link} onPress={() => { setSignaturePreview(false); setSignature(null); }}><Text style={styles.linkText}>Replace signature</Text></Pressable></> : <SignaturePad onChange={setSignature} />}</Section>
      <Section title={pickup ? 'Pickup photo' : 'Delivery photo'}><Pressable disabled={processingPhoto} onPress={() => void takePhoto()} style={styles.photoButton}>{processingPhoto ? <ActivityIndicator /> : photo ? <Image source={{ uri: photo.uri }} style={styles.photo} /> : <><Ionicons name="camera-outline" size={25} color={colors.ink} /><Text style={styles.label}>{pickup ? 'Take pickup photo' : 'Take delivery photo'}</Text></>}</Pressable></Section>
      <Section title="Remarks"><TextInput multiline value={draft.remarks} onChangeText={(remarks) => { setDraft({ ...draft, remarks }); setErrors((current) => ({ ...current, remarks: '' })); }} placeholder="Add notes or observations" placeholderTextColor={colors.faint} style={[styles.textArea, errors.remarks && styles.invalid]} /><FieldError message={errors.remarks} /></Section>
      <Pressable disabled={busy || processingPhoto} onPress={() => void submit()} style={styles.submit}><Text style={styles.submitText}>{pickup ? 'Confirm pickup' : 'Confirm delivery'}</Text><Ionicons name="checkmark" size={21} color={colors.surface} /></Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.xl, paddingTop: 58, paddingBottom: 48 },
  party: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: spacing.xl },
  label: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 }, muted: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 6, lineHeight: 18 },
  eyebrow: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, flex: { flex: 1 },
  outcomes: { flexDirection: 'row', gap: 10, marginTop: spacing.lg }, outcome: { flex: 1, minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  item: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: 12 },
  quantities: { flexDirection: 'row', marginTop: 16, alignItems: 'flex-start' }, divider: { backgroundColor: colors.divider, width: 1, height: 42, marginHorizontal: 18 },
  quantity: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 20, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 5, paddingBottom: 5, minHeight: 36 }, danger: { color: colors.danger },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, minHeight: 50, padding: 12, marginTop: 10, color: colors.ink, fontFamily: 'Inter_500Medium' },
  textArea: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, minHeight: 80, padding: 12, marginTop: 12, textAlignVertical: 'top', color: colors.ink, fontFamily: 'Inter_400Regular' },
  invalid: { borderColor: colors.danger, backgroundColor: colors.dangerSoft }, reasons: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 16, paddingTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 9 }, selected: { backgroundColor: colors.ink }, selectedText: { color: colors.surface, fontFamily: 'Inter_500Medium', fontSize: 13 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }, link: { paddingVertical: 12, minHeight: 44 }, linkText: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 12, textDecorationLine: 'underline' },
  photoButton: { height: 170, justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }, photo: { width: '100%', height: '100%' },
  submit: { minHeight: 54, backgroundColor: colors.ink, borderRadius: radius.sm, marginTop: spacing.xl, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }, submitText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  notice: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }, modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, width: '85%', alignItems: 'center' },
});
