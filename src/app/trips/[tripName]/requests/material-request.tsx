import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createMaterialRequest, getMobileRequestSetup, searchMaterialRequestItems } from '../../../../features/requests/api';
import { OptionList, RequestScreen, SubmitButton, requestStyles } from '../../../../features/requests/components';
import type { CreatedMobileRequest, MaterialRequestItemOption, MobileRequestSetup } from '../../../../features/requests/types';
import { colors, radius } from '../../../../shared/theme';

type RequestLine = MaterialRequestItemOption & { qty: string };

export default function MaterialRequestScreen() {
  const { tripName } = useLocalSearchParams<{ tripName: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [setup, setSetup] = useState<MobileRequestSetup | null>(null);
  const [purpose, setPurpose] = useState<'Purchase' | 'Material Issue'>('Purchase');
  const [warehouse, setWarehouse] = useState('');
  const [scheduleDate, setScheduleDate] = useState(localDate());
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MaterialRequestItemOption[]>([]);
  const [items, setItems] = useState<RequestLine[]>([]);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedMobileRequest | null>(null);
  const requestId = useRef(Crypto.randomUUID());

  const load = useCallback(async () => {
    if (!tripName) return;
    try {
      setError('');
      setSetup(await getMobileRequestSetup(tripName));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load Material Request options.');
    } finally {
      setLoading(false);
    }
  }, [tripName]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!tripName || searchText.trim().length < 2 || !setup?.permissions.material_request) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchMaterialRequestItems(tripName, searchText.trim()));
      } catch (exception) {
        setError(exception instanceof Error ? exception.message : 'Could not search Items.');
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, setup?.permissions.material_request, tripName]);

  const addItem = (option: MaterialRequestItemOption) => {
    setItems((current) => current.some((item) => item.name === option.name) ? current : [...current, { ...option, qty: '1' }]);
    setSearchText('');
    setResults([]);
  };

  const submit = async () => {
    if (!tripName || submitting) return;
    if (!setup?.permissions.material_request) return setError('Your account cannot create Material Requests. Contact your administrator.');
    if (!items.length) return setError('Add at least one Item.');
    if (items.some((item) => !(Number(item.qty) > 0))) return setError('Every Item must have a quantity greater than zero.');
    if (purpose === 'Material Issue' && !warehouse) return setError('Select the source Warehouse for a Material Issue.');
    setSubmitting(true);
    setError('');
    try {
      setCreated(await createMaterialRequest(tripName, {
        items: items.map((item) => ({ item_code: item.name, qty: Number(item.qty) })),
        purpose,
        remarks,
        request_id: requestId.current,
        schedule_date: scheduleDate,
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
        onSelect={(value) => { setPurpose(value as 'Purchase' | 'Material Issue'); if (value === 'Purchase') setWarehouse(''); }}
        options={[{ label: 'Purchase', value: 'Purchase', detail: 'The item needs to be procured.' }, { label: 'Material Issue', value: 'Material Issue', detail: 'The item should be issued from a company warehouse.' }]}
        selected={purpose}
      />
      {purpose === 'Material Issue' ? <>
        <Text style={requestStyles.label}>Source warehouse</Text>
        <OptionList
          emptyText="No permitted Warehouses are available for this company."
          onSelect={setWarehouse}
          options={(setup?.warehouses || []).map((row) => ({ label: row.warehouse_name || row.name, value: row.name, detail: row.name }))}
          selected={warehouse}
        />
      </> : null}
      <Text style={requestStyles.label}>Required by</Text>
      <TextInput onChangeText={setScheduleDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.faint} style={requestStyles.input} value={scheduleDate} />
      <Text style={requestStyles.label}>Items</Text>
      <TextInput onChangeText={setSearchText} placeholder="Search item code or name" placeholderTextColor={colors.faint} style={requestStyles.input} value={searchText} />
      {searching ? <Text style={styles.searchHint}>Searching…</Text> : null}
      {results.length ? <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.searchResults}>{results.map((item) => <Pressable key={item.name} onPress={() => addItem(item)} style={styles.searchResult}>
        <View style={styles.resultCopy}><Text style={styles.resultName}>{item.item_name || item.name}</Text><Text style={styles.resultMeta}>{item.name} · {item.stock_uom}</Text></View>
        <Ionicons color={colors.ink} name="add-circle-outline" size={22} />
      </Pressable>)}</ScrollView> : null}
      {items.map((item) => <View key={item.name} style={styles.itemRow}>
        <View style={styles.itemCopy}><Text style={styles.itemName}>{item.item_name || item.name}</Text><Text style={styles.itemMeta}>{item.name} · {item.stock_uom}</Text></View>
        <TextInput keyboardType="decimal-pad" onChangeText={(qty) => setItems((current) => current.map((row) => row.name === item.name ? { ...row, qty } : row))} style={styles.qtyInput} value={item.qty} />
        <Pressable hitSlop={10} onPress={() => setItems((current) => current.filter((row) => row.name !== item.name))}><Ionicons color={colors.danger} name="close-circle-outline" size={23} /></Pressable>
      </View>)}
      <Text style={requestStyles.label}>Remarks</Text>
      <TextInput multiline onChangeText={setRemarks} placeholder="Why are these materials needed?" placeholderTextColor={colors.faint} style={requestStyles.textArea} value={remarks} />
      <SubmitButton label="Create Material Request" loading={submitting} onPress={submit} />
    </>}
  </RequestScreen>;
}

function localDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  searchHint: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 8 },
  searchResults: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginTop: 8, maxHeight: 240, overflow: 'hidden' },
  searchResult: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', padding: 13 },
  resultCopy: { flex: 1 },
  resultName: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  resultMeta: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  itemRow: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 10, padding: 12 },
  itemCopy: { flex: 1 },
  itemName: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  itemMeta: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  qtyInput: { borderBottomColor: colors.ink, borderBottomWidth: 1, color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 15, minWidth: 52, padding: 5, textAlign: 'center' },
});
