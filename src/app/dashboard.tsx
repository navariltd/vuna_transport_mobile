import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDriverProfile } from '../auth/session';
import { MobileTabBar } from '../shared/mobile_tab_bar';
import { getOnboardingRecord } from '../storage/onboarding';

export default function DashboardScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [driverName, setDriverName] = useState('Driver');
  const [message, setMessage] = useState('Your assigned trips will appear here.');
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const record = await getOnboardingRecord();
      if (!record) return router.replace('/');
      const profile = await getDriverProfile(record.installationId, record.deviceIdentifier);
      if (profile.linked && profile.driver) setDriverName(profile.driver.full_name);
      else setMessage(profile.message || 'Your driver profile needs administrator attention.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load your work profile.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  if (!fontsLoaded) return <ActivityIndicator color="#111111" style={styles.loading} />;
  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl colors={["#111111"]} onRefresh={() => { setRefreshing(true); void loadProfile(); }} refreshing={refreshing} tintColor="#111111" />}
    >
      <View style={styles.pageHeader}><Image source={require('../../assets/icon.png')} style={styles.logo} /><Text style={styles.pageTitle}>Home</Text></View>
      <Text style={styles.greeting}>Good day, {driverName}.</Text>
      <Text style={styles.subtitle}>{message}</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No assigned trips yet</Text>
        <Text style={styles.emptyText}>When a Delivery Trip is assigned to you, its stops and delivery actions will be available here.</Text>
      </View>
    </ScrollView>
    <MobileTabBar />
  </View>;
}

const styles = StyleSheet.create({
  loading: { backgroundColor: '#F7F7F5', flex: 1 },
  screen: { backgroundColor: '#F7F7F5', flex: 1 },
  content: { flexGrow: 1, padding: 28, paddingTop: 64 },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  logo: { borderRadius: 7, height: 28, width: 28 },
  pageTitle: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 20 },
  greeting: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 39, marginTop: 28 },
  subtitle: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 16 },
  emptyCard: { backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, marginTop: 32, padding: 20 },
  emptyTitle: { color: '#111111', fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  emptyText: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 10 },
});
