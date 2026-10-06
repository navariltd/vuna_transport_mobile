import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getOnboardingRecord, saveOnboardingRecord } from '../storage/onboarding';

const ink = '#111111';
const muted = '#6B6B6B';
const paper = '#F7F7F5';

export default function OnboardingScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [siteUrl, setSiteUrl] = useState('');
  const [error, setError] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => { getOnboardingRecord().then((record) => record && setSiteUrl(record.siteUrl)); }, []);
  if (!fontsLoaded) return <ActivityIndicator color={ink} style={styles.loader} />;

  const validHttpsUrl = (value: string) => {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:') throw new Error();
      return url.toString().replace(/\/$/, '');
    } catch {
      setError('Enter a valid HTTPS site URL.');
      return null;
    }
  };

  const continueSetup = async () => {
    const url = validHttpsUrl(siteUrl);
    if (!url) return;
    setSaving(true);
    try { await saveOnboardingRecord(url); router.replace('/login'); }
    catch { setError('This device could not save the setup securely. Please try again.'); }
    finally { setSaving(false); }
  };

  const scan = async () => {
    if (Platform.OS === 'web') { setError('QR scanning is available in the Android and iOS app.'); return; }
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted) { setError('Camera permission is needed to scan the setup QR code.'); return; }
    setError(''); setScannerVisible(true);
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    const url = validHttpsUrl(result.data);
    if (url) { setSiteUrl(url); setScannerVisible(false); setError(''); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}><Image source={require('../../assets/icon.png')} style={styles.logo} /><Text style={styles.brand}>VUNA TRANSPORT</Text></View>
        <View style={styles.intro}>
          <Text style={styles.title}>Connect to Vuna Transport</Text>
          <Text style={styles.subtitle}>Enter the secure site address provided by your administrator.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>VUNA TRANSPORT SITE</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={(value) => { setSiteUrl(value); setError(''); }} placeholder="https://transport.example.com" placeholderTextColor="#A5A5A0" style={styles.input} value={siteUrl} />
          <Pressable onPress={scan} style={styles.scanButton}><Text style={styles.scanText}>Scan setup QR code</Text><Text style={styles.arrow}>↗</Text></Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={saving} onPress={continueSetup} style={[styles.continueButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.continueText}>Continue</Text>}</Pressable>
        </View>
      </ScrollView>
      <Modal animationType="slide" onRequestClose={() => setScannerVisible(false)} visible={scannerVisible}><View style={styles.scanner}><CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onBarcodeScanned} style={StyleSheet.absoluteFill} /><Pressable onPress={() => setScannerVisible(false)} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable><View style={styles.frame} /><Text style={styles.hint}>Place the setup QR code inside the frame.</Text></View></Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: paper, flex: 1 }, loader: { backgroundColor: paper, flex: 1 }, content: { flexGrow: 1, padding: 28, paddingTop: 64 },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, logo: { borderRadius: 8, height: 34, width: 34 }, brand: { color: ink, fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5 },
  intro: { marginTop: 72 }, title: { color: ink, fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 35 }, subtitle: { color: muted, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 10 }, card: { backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, marginTop: 36, padding: 20 }, label: { color: muted, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.1 }, input: { borderBottomColor: ink, borderBottomWidth: 1, color: ink, fontFamily: 'Inter_500Medium', fontSize: 16, paddingBottom: 13, paddingTop: 15 }, scanButton: { alignItems: 'center', borderBottomColor: '#D9D9D4', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 18 }, scanText: { color: ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 }, arrow: { color: muted, fontFamily: 'Inter_700Bold', fontSize: 20 }, error: { color: '#A32929', fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 14 }, continueButton: { alignItems: 'center', backgroundColor: ink, borderRadius: 9, justifyContent: 'center', marginTop: 22, minHeight: 52 }, continueText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 15 }, disabled: { opacity: 0.6 },
  scanner: { alignItems: 'center', backgroundColor: '#000000', flex: 1, justifyContent: 'center' }, close: { position: 'absolute', right: 24, top: 64 }, closeText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 15 }, frame: { borderColor: '#FFFFFF', borderRadius: 20, borderWidth: 2, height: 260, width: 260 }, hint: { color: '#FFFFFF', fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 28 },
});
