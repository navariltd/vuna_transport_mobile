import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function MobileTabBar() {
  const pathname = usePathname();
  const homeActive = pathname === '/dashboard';
  const requestsActive = pathname === '/requests';
  const profileActive = pathname === '/profile';

  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: homeActive }} onPress={() => router.navigate('/dashboard')} style={styles.tab}>
        <Ionicons color={homeActive ? '#111111' : '#8A8A84'} name={homeActive ? 'home' : 'home-outline'} size={21} />
        <Text style={[styles.label, homeActive && styles.active]}>Home</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: requestsActive }} onPress={() => router.navigate('/requests')} style={styles.tab}>
        <Ionicons color={requestsActive ? '#111111' : '#8A8A84'} name={requestsActive ? 'documents' : 'documents-outline'} size={21} />
        <Text style={[styles.label, requestsActive && styles.active]}>Requests</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: profileActive }} onPress={() => router.navigate('/profile')} style={styles.tab}>
        <Ionicons color={profileActive ? '#111111' : '#8A8A84'} name={profileActive ? 'person' : 'person-outline'} size={21} />
        <Text style={[styles.label, profileActive && styles.active]}>Profile</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFFFFF', borderTopColor: '#E2E2DD', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 20, paddingTop: 10 },
  tab: { alignItems: 'center', flex: 1, paddingHorizontal: 8, paddingVertical: 4 },
  label: {
    alignSelf: 'stretch',
    color: '#8A8A84',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 3,
    paddingHorizontal: 2,
    textAlign: 'center',
  },
  active: { color: '#111111' },
});
