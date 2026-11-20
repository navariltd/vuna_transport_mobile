import { useRouter, useLocalSearchParams } from 'expo-router';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearSession, getPendingSession, loginAndRegisterDevice, MobileAccessError, refreshDeviceRegistration } from '../auth/session';
import { requestOfflineSync } from '../offline/sync';
import { getOnboardingRecord } from '../storage/onboarding';
import { ChangeSite } from '../features/settings/ChangeSite';

export default function LoginScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [siteUrl, setSiteUrl] = useState('');
  const [device, setDevice] = useState<Record<string, unknown>>({});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (reason === 'expired') {
      setBlocked(false);
      setError('Your session has expired. Please sign in again. Your saved work is still on this device.');
    }
    void getPendingSession().then((pending) => {
      if (pending) {
        setBlocked(true);
        setUsername(pending.user);
        setError('Ask your administrator to activate this device, then check access again.');
      }
    }).catch(() => setError('Could not restore device access. Please sign in again.'));
  }, [reason]);

  const openWork = () => { requestOfflineSync(); router.replace('/dashboard'); };

  const checkAccess = async () => {
    if (loading || !device.installation_id) return;
    setLoading(true);
    try {
      const result = await refreshDeviceRegistration(device);
      if (result?.allowed) openWork();
      else setError(result?.message || 'This device is still awaiting approval.');
    } catch (exception) {
      if (exception instanceof MobileAccessError && exception.reason === 'expired') setBlocked(false);
      setError(exception instanceof Error ? exception.message : 'Could not check device access.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    getOnboardingRecord().then((record) => {
      if (!record || record.requiresSiteSetup) { router.replace('/'); return; }
      setSiteUrl(record.siteUrl);
      setDevice({
        installation_id: record.installationId,
        device_identifier: record.deviceIdentifier,
        platform: record.platform,
        manufacturer: record.manufacturer,
        model_name: record.modelName,
        os_name: record.osName,
        os_version: record.osVersion,
        app_version: '1.0.0',
      });
    });
  }, [router]);

  const signIn = async () => {
    setLoading(true); setError(''); setBlocked(false);
    try {
      const result = await loginAndRegisterDevice(siteUrl, username.trim(), password, device);
      setPassword('');
      if (!result.allowed) { setBlocked(true); setError(result.message || 'Contact your administrator.'); return; }
      openWork();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Sign in failed.');
    } finally { setLoading(false); }
  };

  if (!fontsLoaded) return <ActivityIndicator color="#111111" style={styles.screen} />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        alwaysBounceVertical
        contentContainerStyle={styles.content}
        refreshControl={blocked ? <RefreshControl refreshing={loading} onRefresh={() => { void checkAccess(); }} tintColor="#111111" /> : undefined}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.kicker}>VUNA TRANSPORT</Text>
        <Text style={styles.title}>{blocked ? 'Device access needs attention.' : 'Sign in to continue.'}</Text>
        {blocked ? <Text style={styles.subtitle}>This device is not currently authorized. For a new phone, ask your administrator to activate it in Transport Mobile Device. This replaces the previous active phone.</Text> : null}
        {!blocked ? <>
          <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setUsername} placeholder="Email or username" placeholderTextColor="#999999" style={styles.input} value={username} />
          <View style={styles.passwordField}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#999999"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              value={password}
            />
            <Pressable
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => setShowPassword((visible) => !visible)}
              style={styles.passwordToggle}
            >
              <Ionicons color="#6B6B6B" name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={loading || !device.installation_id} onPress={signIn} style={styles.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign in</Text>}</Pressable>
        </> : <>
          <Text style={styles.error}>{error}</Text>
          <Pressable disabled={loading || !device.installation_id} onPress={() => { void checkAccess(); }} style={styles.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Check access again</Text>}</Pressable>
          <Pressable disabled={loading} onPress={async () => { await clearSession(); setBlocked(false); setPassword(''); setError(''); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Sign in with another account</Text></Pressable>
          <Text style={styles.subtitle}>Sync saved work on your old phone before switching. Unsynced work stays on that phone.</Text>
        </>}
        <ChangeSite siteUrl={siteUrl} disabled={loading} onBusyChange={setLoading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F7F5', flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  kicker: { color: '#6B6B6B', fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.5 },
  title: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 39, marginTop: 14 },
  subtitle: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 16 },
  input: { borderBottomColor: '#111111', borderBottomWidth: 1, color: '#111111', fontFamily: 'Inter_500Medium', fontSize: 16, marginTop: 28, paddingBottom: 13 },
  passwordField: { alignItems: 'center', borderBottomColor: '#111111', borderBottomWidth: 1, flexDirection: 'row', marginTop: 28 },
  passwordInput: { color: '#111111', flex: 1, fontFamily: 'Inter_500Medium', fontSize: 16, paddingBottom: 13, paddingRight: 12 },
  passwordToggle: { alignItems: 'center', justifyContent: 'center', paddingBottom: 13, paddingLeft: 12 },
  error: { color: '#A32929', fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, marginTop: 18 },
  button: { alignItems: 'center', backgroundColor: '#111111', borderRadius: 9, justifyContent: 'center', marginTop: 28, minHeight: 52 },
  buttonText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  secondaryButton: { alignItems: 'center', padding: 16 },
  secondaryText: { color: '#111111', fontFamily: 'Inter_500Medium', fontSize: 14 },
});
