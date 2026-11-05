import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { FieldError, OptionList, RequestScreen, SubmitButton, requestStyles as styles } from '../../../../features/requests/components';
import { getCollectionSetup, getTripDetails, getUnplannedCollections, reportUnplannedCollection, searchCollectionItems } from '../../../../features/trips/api';
import type { CollectionItemOption, CollectionRecord } from '../../../../features/trips/api';

type Line = { id: string; item?: CollectionItemOption; qty: string; uom: string; batch: string; serials: string };
const newLine = (): Line => ({ id: Crypto.randomUUID(), qty: '', uom: '', batch: '', serials: '' });

export default function CollectionsScreen() {
  const { tripName, stopName } = useLocalSearchParams<{ tripName: string; stopName: string }>();
  const [stopLabel, setStopLabel] = useState('');
  const [history, setHistory] = useState<CollectionRecord[]>([]);
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [referenceTypes, setReferenceTypes] = useState<string[]>([]);
  const [referenceType, setReferenceType] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [loadedReference, setLoadedReference] = useState('');
  const [releasedBy, setReleasedBy] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<CollectionItemOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requestId = useRef(Crypto.randomUUID());

  useEffect(() => {
    let alive = true;
    Promise.all([getTripDetails(tripName), getUnplannedCollections(tripName, stopName), getCollectionSetup(tripName, stopName)]).then(([result, records, setup]) => {
      if (!alive) return;
      const stop = result.trip.stops.find((row) => row.name === stopName);
      if (!stop) throw new Error('This stop is no longer part of the trip.');
      const label = stop.location_label || stop.customer || stop.address || stop.name;
      setStopLabel(label);
      setReferenceTypes(setup.reference_types);
      setEnabled(Boolean(setup.enabled));
      setReferenceType(setup.reference_types[0] || '');
      setHistory(records);
      setActive(Boolean(setup.enabled) && Boolean(result.trip.actual_start) && !result.trip.actual_completion && result.trip.status !== 'Completed');
    }).catch((exception) => { if (alive) setError(exception instanceof Error ? exception.message : 'Could not load collections.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tripName, stopName]);

  const clearSourceItems = () => { setLoadedReference(''); setOptions([]); setLines([newLine()]); setOpen(null); setErrors({}); };
  const loadReference = async () => {
    if (!referenceName.trim()) { setErrors((current) => ({ ...current, reference: `Enter the ${referenceType} number.` })); return; }
    setSearching(true); setError(''); setOptions([]); setLoadedReference(''); setLines([newLine()]); setOpen(null);
    try {
      const items = await searchCollectionItems(tripName, stopName, referenceType, referenceName.trim());
      setOptions(items); setLoadedReference(referenceName.trim()); setErrors({});
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not load the reference document.'); }
    finally { setSearching(false); }
  };
  const filteredOptions = options.filter((item) => `${item.name} ${item.item_name} ${item.batch_no || ''}`.toLowerCase().includes(search.toLowerCase()));

  const update = (id: string, changes: Partial<Line>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line));
    setErrors((current) => ({ ...current, [id]: '' }));
  };
  const submit = async () => {
    if (busy) return;
    const next: Record<string, string> = {};
    if (!loadedReference || loadedReference !== referenceName.trim()) next.reference = 'Load the reference document before selecting items.';
    if (!releasedBy.trim()) next.releasedBy = 'Enter who released the goods.';
    if (!reason.trim()) next.reason = 'Explain why these goods were collected.';
    lines.forEach((line) => {
      if (!line.item || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) next[line.id] = 'Select an item and enter a positive quantity.';
      else if (Number(line.qty) > line.item.qty) next[line.id] = 'Quantity cannot exceed this reference row/batch quantity.';
      else if (line.item.has_batch_no && !line.batch.trim()) next[line.id] = 'Enter the batch number. Use a separate row for each batch.';
      else if (line.item.has_serial_no && !line.serials.trim()) next[line.id] = 'Enter the collected serial numbers.';
    });
    setErrors(next);
    if (Object.keys(next).length) { setError('Check the highlighted fields.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try {
      const result = await reportUnplannedCollection(tripName, {
        request_id: requestId.current, stop_name: stopName, reference_doctype: referenceType, reference_name: loadedReference, released_by: releasedBy.trim(), reason: reason.trim(),
        items: lines.map((line) => ({ item_code: line.item!.name, collection_reference_row: line.item!.reference_row, delivered_qty: Number(line.qty), uom: line.uom, batch_no: line.batch || null, serial_no: line.serials.trim() || null })),
      });
      setSuccess(`${result.name} recorded. Dispatch will review this collection and arrange stock receipt.`);
      setHistory((current) => [{ name: result.name, collection_location: stopLabel, collection_review_status: 'Pending Review' }, ...current.filter((record) => record.name !== result.name)]);
      requestId.current = Crypto.randomUUID();
      setLines([newLine()]); setReason(''); setReleasedBy(''); setOpen(null);
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not record collection.'); }
    finally { setBusy(false); }
  };

  return <RequestScreen title="Unplanned collections" loading={loading} error={error}>
    <Text style={styles.intro}>{stopLabel ? `${stopLabel} · ` : ''}Record an additional collection at this stop, before or after its delivery POD while the trip is active. This records custody evidence only, not stock receipt or customer credit.</Text>
    {success ? <Text accessibilityLiveRegion="polite" style={styles.intro}>{success}</Text> : null}
    {history.map((record) => <View key={record.name} style={{ marginTop: 16 }}>
      <Text style={styles.label}>{record.name} · {record.collection_review_status}</Text>
      <Text style={styles.intro}>{record.collection_location}{record.return_request ? ` · ${record.return_request}` : ''}</Text>
    </View>)}
    {!enabled ? <Text style={styles.intro}>Unplanned pickups are disabled. Use an approved Return Request pickup task. Existing collection records remain available here.</Text> : !active ? <Text style={styles.intro}>Start the trip to record a collection. Completed trips are read-only.</Text> : success ? <Pressable onPress={() => setSuccess('')}><Text style={styles.label}>+ Record another collection</Text></Pressable> : <View pointerEvents={busy || searching ? 'none' : 'auto'}>
      <Text style={styles.label}>Collection source</Text>
      <Text style={styles.intro}>{stopLabel}</Text>
      {referenceTypes.length > 1 ? <OptionList options={referenceTypes.map((value) => ({ value, label: value }))} selected={referenceType} onSelect={(value) => { clearSourceItems(); setReferenceType(value); setReferenceName(''); }} /> : null}
      <Text style={styles.label}>{referenceType || 'Reference document'} number</Text>
      <TextInput editable={!searching} autoCapitalize="none" accessibilityLabel="Reference document number" style={styles.input} value={referenceName} onChangeText={(value) => { clearSourceItems(); setReferenceName(value); }} />
      <FieldError message={errors.reference} />
      <SubmitButton label={loadedReference ? 'Reload reference items' : 'Load reference items'} loading={searching} onPress={() => void loadReference()} />
      <Text style={styles.label}>Released by</Text>
      <TextInput accessibilityLabel="Released by" style={styles.input} value={releasedBy} onChangeText={(value) => { setReleasedBy(value); setErrors((current) => ({ ...current, releasedBy: '' })); }} />
      <FieldError message={errors.releasedBy} />
      <Text style={styles.label}>Reason for collection</Text>
      <TextInput accessibilityLabel="Reason for collection" multiline style={styles.textArea} value={reason} onChangeText={(value) => { setReason(value); setErrors((current) => ({ ...current, reason: '' })); }} />
      <FieldError message={errors.reason} />
      {lines.map((line, index) => <View key={line.id} style={{ marginTop: 20 }}>
        <Text style={styles.label}>Item {index + 1}</Text>
        <Pressable disabled={!loadedReference || searching} style={styles.input} onPress={() => { setSearch(''); setOpen(open === line.id ? null : line.id); }}><Text style={styles.intro}>{line.item ? `${line.item.name} — ${line.item.item_name}` : loadedReference ? 'Select item from reference' : 'Load a reference document first'}</Text></Pressable>
        {open === line.id ? <View>
          <TextInput accessibilityLabel="Search collection items" placeholder="Search items" style={styles.input} value={search} onChangeText={setSearch} />
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
            <OptionList emptyText="No matching items in this reference." options={filteredOptions.map((item) => ({ label: `${item.name} — ${item.item_name}${item.batch_no ? ` · Batch ${item.batch_no}` : ''}`, detail: `Row ${item.row_idx} · Source quantity: ${item.qty} ${item.uom}`, value: item.key }))} onSelect={(key) => {
              const item = options.find((option) => option.key === key);
              update(line.id, { item, uom: item?.uom || '', batch: item?.batch_no || '', serials: item?.serial_no || '' }); setOpen(null);
            }} />
          </ScrollView>
        </View> : null}
        {line.item ? <>
          <Text style={styles.label}>UOM</Text>
          <Text style={styles.intro}>{line.uom} · Source quantity: {line.item.qty}</Text>
        </> : null}
        <Text style={styles.label}>Quantity collected{line.uom ? ` (${line.uom})` : ''}</Text>
        <TextInput accessibilityLabel={`Item ${index + 1} quantity`} keyboardType="decimal-pad" style={styles.input} value={line.qty} onChangeText={(qty) => update(line.id, { qty })} />
        {line.item?.has_batch_no ? <><Text style={styles.label}>Batch number</Text><Text style={styles.intro}>{line.batch}</Text></> : null}
        {line.item?.has_serial_no ? <><Text style={styles.label}>Serial numbers (one per line)</Text><TextInput multiline style={styles.textArea} value={line.serials} onChangeText={(serials) => update(line.id, { serials })} /></> : null}
        <FieldError message={errors[line.id]} />
        {lines.length > 1 ? <Pressable onPress={() => setLines((current) => current.filter((row) => row.id !== line.id))}><Text style={styles.label}>Remove item</Text></Pressable> : null}
      </View>)}
      {lines.length < 50 ? <Pressable onPress={() => setLines((current) => [...current, newLine()])}><Text style={styles.label}>+ Add item / batch</Text></Pressable> : null}
      <SubmitButton label="Record collection" loading={busy} onPress={() => void submit()} />
    </View>}
  </RequestScreen>;
}
