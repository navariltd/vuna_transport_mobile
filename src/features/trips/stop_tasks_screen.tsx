import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { formatAddress, ScreenHeader, StateView, Section } from './components';
import { StopActionCard, taskStyles as styles, useTaskFonts } from './task_components';
import { stopActions, stopActionPath, taskFinished } from './task_model';
import { loadStopWork } from './task_repository';
import { loadTransportProof } from '../../offline/transport_proof_repository';
import { colors } from '../../shared/theme';

export default function StopTasksScreen() {
  const { tripName, stopName, completed } = useLocalSearchParams<{ tripName: string; stopName: string; completed?: string }>();
  const [fontsLoaded] = useTaskFonts();
  const [work, setWork] = useState<Awaited<ReturnType<typeof loadStopWork>>>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      const result = await loadStopWork(tripName, stopName);
      setWork(result);
      const actions = stopActions(result.stop, result.pending);
      if (actions.length === 1 && !completed) router.replace(stopActionPath(tripName, stopName, actions[0]) as never);
      void Promise.allSettled(actions.filter((task) => task.can_record_proof && task.task_type !== 'Customer Delivery' && !task.queued).map((task) => loadTransportProof(task.name)));
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not load stop actions.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tripName, stopName, completed]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;
  if (!work || error) return <View style={styles.screen}><ScreenHeader back title="Stop actions" /><StateView error={error || 'Stop unavailable.'} onRetry={load} /></View>;
  const actions = stopActions(work.stop, work.pending);
  const finished = actions.filter(taskFinished).length;
  return <View style={styles.screen}><StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <ScreenHeader back title="Stop actions" />
      <Text style={styles.place}>{work.stop.vuna_depot_names || work.stop.location_label || work.stop.customer || 'Delivery stop'}</Text>
      <Text style={styles.body}>{formatAddress(work.stop) || 'Address unavailable'}</Text>
      <Text style={styles.muted}>{finished} of {actions.length} actions recorded</Text>
      {completed ? <View style={styles.notice}><Text style={styles.cardTitle}>Actions at this stop</Text><Text style={styles.muted}>Review progress or choose the next action.</Text></View> : null}
      <Section title="Actions at this stop">
        {actions.length ? actions.map((task, index) => <StopActionCard key={task.name} task={task} number={index + 1} onPress={() => router.push(stopActionPath(tripName, stopName, task) as never)} />) : <StateView empty="No actions are assigned to this stop." />}
      </Section>
      {actions.some((task) => task.queued) ? <View style={styles.notice}><Text style={styles.cardTitle}>Handover awaiting sync</Text><Text style={styles.muted}>Saved on this device. Stock is not posted until the server confirms it.</Text><Pressable style={styles.outline} onPress={() => router.push('/sync-center')}><Text style={styles.outlineText}>Open Sync Center</Text></Pressable></View> : null}
      {work.stop.unplanned_pickups_enabled || Boolean(work.stop.unplanned_collection_count) ? <Pressable style={[styles.outline, { marginTop: 24 }]} onPress={() => router.push(`/trips/${encodeURIComponent(tripName)}/collections/${encodeURIComponent(stopName)}` as never)}><Ionicons name="cube-outline" size={18} color={colors.ink} /><Text style={styles.outlineText}>{work.stop.unplanned_pickups_enabled ? 'Unplanned collections' : 'Collection history'}</Text></Pressable> : null}
    </ScrollView>
  </View>;
}
