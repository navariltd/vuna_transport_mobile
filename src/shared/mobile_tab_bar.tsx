import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function MobileTabBar() {
  const pathname = usePathname();
  const homeActive = pathname === '/dashboard';

  return (
    <View style={styles.bar}>
      <Pressable onPress={() => router.replace('/dashboard')} style={styles.tab}>
        <Ionicons color={homeActive ? '#111111' : '#8A8A84'} name={homeActive ? 'home' : 'home-outline'} size={21} />
        <Text style={[styles.label, homeActive && styles.active]}>Home</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/profile')} style={styles.tab}>
        <Ionicons color={!homeActive ? '#111111' : '#8A8A84'} name={!homeActive ? 'person' : 'person-outline'} size={21} />
        <Text style={[styles.label, !homeActive && styles.active]}>Profile</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFFFFF', borderTopColor: '#E2E2DD', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 20, paddingTop: 10 },
  tab: { alignItems: 'center', minWidth: 90, paddingHorizontal: 20, paddingVertical: 4 },
  label: { color: '#8A8A84', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 3 },
  active: { color: '#111111', fontFamily: 'Inter_700Bold' },
});
