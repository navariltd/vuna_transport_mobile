import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clearSession } from '../../auth/session';
import { clearCurrentOfflineCache } from '../../offline/cache';
import { ConnectivityBadge } from '../../offline/components';
import { loadDriverProfile, type MobileDriverProfile } from '../../offline/profile_repository';
import { getOnboardingRecord } from '../../storage/onboarding';

type Driver = NonNullable<MobileDriverProfile['driver']>;

export default function ProfileScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [driver, setDriver] = useState<Driver | null>(null);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const record = await getOnboardingRecord();
      if (!record) return router.replace('/');
      const loaded = await loadDriverProfile(record.installationId, record.deviceIdentifier);
      const profile = loaded.data;
      if (profile.linked) setDriver(profile.driver);
      else setMessage(profile.message || 'Your driver profile needs attention.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load your profile.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const logout = async () => {
    await clearCurrentOfflineCache();
    await clearSession();
    router.replace('/login');
  };
  if (!fontsLoaded || (!driver && !message)) return <ActivityIndicator color="#111111" style={styles.loading} />;

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl colors={["#111111"]} onRefresh={() => { setRefreshing(true); void loadProfile(); }} refreshing={refreshing} tintColor="#111111" />}
    >
      <View style={styles.pageHeader}><Image source={require('../../../assets/icon.png')} style={styles.logo} /><Text style={styles.pageTitle}>Profile</Text><ConnectivityBadge /></View>
      {driver ? <>
        <Text style={styles.title}>{driver.full_name}</Text>
        <Text style={styles.subtitle}>Your ERPNext Driver profile.</Text>
        <View style={styles.card}>
          <InfoRow label="Driver ID" value={driver.name} />
          <InfoRow label="Status" value={driver.status} />
          {driver.employee_details?.designation ? <InfoRow label="Role" value={driver.employee_details.designation} /> : null}
          {driver.employee_details?.company ? <InfoRow label="Company" value={driver.employee_details.company} /> : null}
          {driver.cell_number ? <InfoRow label="Phone" value={driver.cell_number} /> : null}
          {driver.license_number ? <InfoRow label="Licence" value={driver.license_number} /> : null}
          {driver.expiry_date ? <InfoRow label="Licence expiry" value={driver.expiry_date} /> : null}
        </View>
      </> : <><Text style={styles.title}>Profile unavailable.</Text><Text style={styles.subtitle}>{message}</Text></>}
      <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Log out</Text></Pressable>
    </ScrollView>
  </View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  loading: { backgroundColor: '#F7F7F5', flex: 1 }, screen: { backgroundColor: '#F7F7F5', flex: 1 }, content: { flexGrow: 1, padding: 28, paddingTop: 64 },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 }, logo: { borderRadius: 7, height: 28, width: 28 }, pageTitle: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 20 }, title: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 39, marginTop: 28 }, subtitle: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 16 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, marginTop: 32, paddingHorizontal: 20 }, infoRow: { borderBottomColor: '#ECECE8', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15 }, infoLabel: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 13 }, infoValue: { color: '#111111', fontFamily: 'Inter_500Medium', fontSize: 13, maxWidth: '58%', textAlign: 'right' },
  logout: { alignItems: 'center', borderColor: '#111111', borderRadius: 9, borderWidth: 1, marginTop: 28, minHeight: 50, justifyContent: 'center' }, logoutText: { color: '#111111', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
