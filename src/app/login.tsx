import { router } from 'expo-router';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { loginAndRegisterDevice } from '../auth/session';
import { getOnboardingRecord } from '../storage/onboarding';

export default function LoginScreen() {
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
    getOnboardingRecord().then((record) => {
      if (!record) return;
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
  }, []);

  const signIn = async () => {
    setLoading(true); setError(''); setBlocked(false);
    try {
      const result = await loginAndRegisterDevice(siteUrl, username.trim(), password, device);
      if (!result.allowed) { setBlocked(true); setError(result.message || 'Contact your administrator.'); return; }
      router.replace('/dashboard');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Sign in failed.');
    } finally { setLoading(false); }
  };

  if (!fontsLoaded) return <ActivityIndicator color="#111111" style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Text style={styles.kicker}>VUNA TRANSPORT</Text>
      <Text style={styles.title}>{blocked ? 'Device access needs attention.' : 'Sign in to continue.'}</Text>
      <Text style={styles.subtitle}>{blocked ? 'This device is not currently authorized for this user.' : `Connect to ${siteUrl || 'your transport site'}.`}</Text>
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
        <Pressable disabled={loading} onPress={signIn} style={styles.button}>{loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign in</Text>}</Pressable>
      </> : <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F7F7F5', flex: 1, justifyContent: 'center', padding: 28 },
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
});
