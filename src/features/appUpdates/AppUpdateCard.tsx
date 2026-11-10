import * as Application from 'expo-application';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme';
import { useAppUpdate } from './AppUpdateProvider';

export function AppUpdateCard() {
  const { release, status, error, supported, check, install } = useAppUpdate();
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(status);
  const labels = { idle: 'Check for updates', checking: 'Checking…', current: 'You are up to date', downloading: 'Downloading update…', verifying: 'Verifying update…', ready: 'Install update', installing: 'Opening installer…', error: 'Retry update check' };
  return <View style={styles.card}>
    <Text style={styles.heading}>App updates</Text>
    <Text style={styles.body}>{Application.nativeApplicationVersion || 'Development build'}{Application.nativeBuildVersion ? ' · build ' + Application.nativeBuildVersion : ''}</Text>
    {release ? <Text style={styles.body}>Version {release.versionName} {status === 'ready' ? 'is ready to install.' : 'is available.'}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {supported ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void (status === 'ready' ? install() : check(true)); }} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{labels[status]}</Text></Pressable> : <Text style={styles.body}>Update checks are available in the installed Android release app.</Text>}
  </View>;
}

export function AppUpdatePrompt() {
  const { release, showPrompt, error, install, dismiss } = useAppUpdate();
  if (!release) return null;
  return <Modal transparent animationType="slide" visible={showPrompt} onRequestClose={dismiss}>
    <View style={styles.backdrop}><View style={styles.sheet}>
      <Text style={styles.title}>Update ready</Text>
      <Text style={styles.body}>{Application.applicationName || 'Vuna Transport'} {release.versionName} is ready to install.</Text>
      {release.releaseNotes ? <ScrollView style={styles.notes}><Text style={styles.body}>{release.releaseNotes}</Text></ScrollView> : null}
      <Text style={styles.body}>Finish and sync your work before updating. Your saved account and app data will be kept.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => { void install(); }} style={styles.button}><Text style={styles.buttonText}>Install update</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={dismiss} style={styles.later}><Text style={styles.heading}>Later</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, marginTop: 24, padding: 20, gap: 12 },
  heading: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  button: { backgroundColor: colors.ink, borderRadius: 9, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.55 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, padding: 28, paddingBottom: 40, gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '700' },
  notes: { maxHeight: 150 },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
