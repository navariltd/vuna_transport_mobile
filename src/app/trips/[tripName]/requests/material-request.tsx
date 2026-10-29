import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createMaterialRequest, getMobileRequestSetup, searchMaterialRequestItems } from '../../../../features/requests/api';
import { FieldError, OptionList, RequestScreen, SubmitButton, requestStyles } from '../../../../features/requests/components';
import type { CreatedMobileRequest, MaterialRequestItemOption, MobileRequestSetup } from '../../../../features/requests/types';
import { colors, radius, spacing } from '../../../../shared/theme';

type MaterialRequestLine = {
  id: string;
  option: MaterialRequestItemOption | null;
  qty: string;
  scheduleDate: string;
  description: string;
};

const MAX_MATERIAL_ROWS = 20;

export default function MaterialRequestScreen() {
  const { tripName } = useLocalSearchParams<{ tripName: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [setup, setSetup] = useState<MobileRequestSetup | null>(null);
  const [purpose, setPurpose] = useState<'Purchase' | 'Material Issue'>('Purchase');
  const [warehouse, setWarehouse] = useState('');
  const [availableItems, setAvailableItems] = useState<MaterialRequestItemOption[]>([]);
  const [items, setItems] = useState<MaterialRequestLine[]>(() => [newMaterialRequestLine()]);
  const [openItemRow, setOpenItemRow] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedMobileRequest | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const requestId = useRef(Crypto.randomUUID());

  const load = useCallback(async () => {
    if (!tripName) return;
    try {
      setError('');
      const requestSetup = await getMobileRequestSetup(tripName);
      const initialItems = requestSetup.permissions.material_request
        ? await searchMaterialRequestItems(tripName, '')
        : [];
      setSetup(requestSetup);
      setAvailableItems(initialItems);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load Material Request options.');
    } finally {
      setLoading(false);
    }
  }, [tripName]);

  useEffect(() => { void load(); }, [load]);
  const addItemRow = () => {
    if (items.length >= MAX_MATERIAL_ROWS) return;
    const row = newMaterialRequestLine();
    setItems((current) => [...current, row]);
    setOpenItemRow(row.id);
  };

  const updateItem = (id: string, changes: Partial<MaterialRequestLine>) => {
    setItems((current) => current.map((row) => row.id === id ? { ...row, ...changes } : row));
    setFieldErrors((current) => {
      const next = { ...current };
      Object.keys(changes).forEach((field) => delete next[`${id}.${field}`]);
      return next;
    });
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((row) => row.id !== id));
    setOpenItemRow((current) => current === id ? null : current);
  };

  const selectItem = (id: string, option: MaterialRequestItemOption) => {
    updateItem(id, { option });
    setOpenItemRow(null);
  };

  const submit = async () => {
    if (!tripName || submitting) return;
    if (!setup?.permissions.material_request) return setError('Your account cannot create Material Requests. Contact your administrator.');
    if (!items.length) return setError('Add at least one Item.');
    const nextFieldErrors: Record<string, string> = {};
    items.forEach((item) => {
      if (!item.option) nextFieldErrors[`${item.id}.option`] = 'Select an Item.';
      if (!(Number(item.qty) > 0)) nextFieldErrors[`${item.id}.qty`] = 'Enter a quantity greater than zero.';
      if (!item.scheduleDate) nextFieldErrors[`${item.id}.scheduleDate`] = 'Enter the due date.';
    });
    if (purpose === 'Material Issue' && !warehouse) nextFieldErrors.warehouse = 'Select the source warehouse.';
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      return setError('Complete the highlighted fields before submitting.');
    }
    setFieldErrors({});
    setSubmitting(true);
    setError('');
    try {
      setCreated(await createMaterialRequest(tripName, {
        items: items.map((item) => ({
          description: item.description,
          item_code: item.option?.name,
          qty: Number(item.qty),
          schedule_date: item.scheduleDate,
        })),
        purpose,
        remarks,
        request_id: requestId.current,
        warehouse: purpose === 'Material Issue' ? warehouse : undefined,
      }));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not create the Material Request.');
    } finally {
      setSubmitting(false);
    }
  };

  return <RequestScreen error={error} loading={!fontsLoaded || loading} title="Material Request">
    <StatusBar style="dark" />
    {created ? <>
      <Text style={requestStyles.intro}>Your material request has been saved in ERPNext for review.</Text>
      <Pressable onPress={() => router.back()} style={requestStyles.success}>
        <Ionicons color={colors.success} name="checkmark-circle" size={34} />
        <Text style={requestStyles.successTitle}>Material Request created</Text>
        <Text style={requestStyles.successReference}>{created.name}</Text>
        <Text style={requestStyles.successText}>Status: {created.status}. Tap to return to the Delivery Trip.</Text>
      </Pressable>
    </> : <>
      <Text style={requestStyles.intro}>Request stock or purchasing support for this trip. The request will be saved as a draft for review.</Text>
      <Text style={requestStyles.label}>Purpose</Text>
      <OptionList
        onSelect={(value) => { setPurpose(value as 'Purchase' | 'Material Issue'); setFieldErrors({}); if (value === 'Purchase') setWarehouse(''); }}
        options={[{ label: 'Purchase', value: 'Purchase', detail: 'The item needs to be procured.' }, { label: 'Material Issue', value: 'Material Issue', detail: 'The item should be issued from a company warehouse.' }]}
        selected={purpose}
      />
      {purpose === 'Material Issue' ? <>
        <Text style={requestStyles.label}>Source warehouse</Text>
        <OptionList
          emptyText="No permitted Warehouses are available for this company."
          onSelect={(value) => { setWarehouse(value); setFieldErrors((current) => { const next = { ...current }; delete next.warehouse; return next; }); }}
          options={(setup?.warehouses || []).map((row) => ({ label: row.warehouse_name || row.name, value: row.name, detail: row.name }))}
          selected={warehouse}
        />
        <FieldError message={fieldErrors.warehouse} />
      </> : null}
      <View style={styles.itemsHeading}>
        <View><Text style={styles.sectionTitle}>Items</Text><Text style={styles.sectionCaption}>{items.length} of {MAX_MATERIAL_ROWS} rows</Text></View>
        <Pressable disabled={items.length >= MAX_MATERIAL_ROWS} onPress={addItemRow} style={[styles.addButton, items.length >= MAX_MATERIAL_ROWS && styles.disabled]}>
          <Ionicons color={colors.ink} name="add" size={18} /><Text style={styles.addButtonText}>Add Item</Text>
        </Pressable>
      </View>
      {items.map((item, index) => {
        const itemOptions = availableItems.filter((option) => !items.some((row) => row.id !== item.id && row.option?.name === option.name));
        return <View key={item.id} style={styles.itemCard}>
          <View style={styles.rowHeading}><Text style={styles.rowTitle}>Item {index + 1}</Text>{items.length > 1 ? <Pressable hitSlop={10} onPress={() => removeItem(item.id)}><Ionicons color={colors.danger} name="trash-outline" size={20} /></Pressable> : null}</View>
          <Text style={styles.fieldLabel}>ITEM</Text>
          <Pressable onPress={() => setOpenItemRow((current) => current === item.id ? null : item.id)} style={[styles.selectButton, fieldErrors[`${item.id}.option`] && styles.invalidSelect]}>
            <Text numberOfLines={1} style={[styles.selectText, !item.option && styles.placeholder]}>{item.option ? `${item.option.item_name || item.option.name} · ${item.option.name}` : 'Select item'}</Text>
            <Ionicons color={colors.muted} name={openItemRow === item.id ? 'chevron-up' : 'chevron-down'} size={18} />
          </Pressable>
          <FieldError message={fieldErrors[`${item.id}.option`]} />
          {openItemRow === item.id ? <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.itemDropdown}>{itemOptions.map((option) => <Pressable key={option.name} onPress={() => selectItem(item.id, option)} style={[styles.itemOption, item.option?.name === option.name && styles.itemOptionActive]}><View style={styles.itemOptionCopy}><Text style={[styles.itemOptionText, item.option?.name === option.name && styles.itemOptionTextActive]}>{option.item_name || option.name}</Text><Text style={[styles.itemOptionDetail, item.option?.name === option.name && styles.itemOptionTextActive]}>{option.name} · {option.stock_uom}</Text></View>{item.option?.name === option.name ? <Ionicons color={colors.surface} name="checkmark" size={17} /> : null}</Pressable>)}</ScrollView> : null}
          <View style={styles.fieldRow}>
            <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>QUANTITY</Text><TextInput keyboardType="decimal-pad" onChangeText={(qty) => updateItem(item.id, { qty })} placeholder="0" placeholderTextColor={colors.faint} style={[requestStyles.input, fieldErrors[`${item.id}.qty`] && requestStyles.invalidInput]} value={item.qty} /><FieldError message={fieldErrors[`${item.id}.qty`]} /></View>
            <View style={styles.fieldColumn}><Text style={styles.fieldLabel}>DUE DATE</Text><TextInput onChangeText={(scheduleDate) => updateItem(item.id, { scheduleDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.faint} style={[requestStyles.input, fieldErrors[`${item.id}.scheduleDate`] && requestStyles.invalidInput]} value={item.scheduleDate} /><FieldError message={fieldErrors[`${item.id}.scheduleDate`]} /></View>
          </View>
          <Text style={styles.fieldLabel}>DESCRIPTION</Text><TextInput multiline onChangeText={(description) => updateItem(item.id, { description })} placeholder="Why is this item needed?" placeholderTextColor={colors.faint} style={styles.descriptionInput} value={item.description} />
        </View>;
      })}
      <Text style={requestStyles.label}>Remarks</Text>
      <TextInput multiline onChangeText={setRemarks} placeholder="Why are these materials needed?" placeholderTextColor={colors.faint} style={requestStyles.textArea} value={remarks} />
      <SubmitButton label="Create Material Request" loading={submitting} onPress={submit} />
    </>}
  </RequestScreen>;
}

function newMaterialRequestLine(): MaterialRequestLine {
  return { id: Crypto.randomUUID(), option: null, qty: '', scheduleDate: localDate(), description: '' };
}

function localDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  itemsHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 },
  sectionCaption: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  addButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 99, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 40, paddingHorizontal: 13 },
  addButtonText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  disabled: { opacity: 0.45 },
  itemCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginTop: 14, padding: spacing.md },
  rowHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  rowTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 14 },
  fieldLabel: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, marginBottom: 8, marginTop: 14 },
  selectButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: 13 },
  invalidSelect: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  selectText: { color: colors.ink, flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14 },
  placeholder: { color: colors.faint },
  itemDropdown: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginTop: 6, maxHeight: 190 },
  itemOption: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: 13 },
  itemOptionActive: { backgroundColor: colors.ink },
  itemOptionCopy: { flex: 1 },
  itemOptionText: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 13 },
  itemOptionDetail: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  itemOptionTextActive: { color: colors.surface },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldColumn: { flex: 1 },
  descriptionInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 13, minHeight: 76, padding: 12, textAlignVertical: 'top' },
});
