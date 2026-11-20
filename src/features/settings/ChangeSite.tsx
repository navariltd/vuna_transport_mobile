import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { changeSite } from '../../auth/change_site';
import { colors } from '../../shared/theme';

export function ChangeSite({ siteUrl, disabled = false, onBusyChange }: { siteUrl: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const router = useRouter();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const updateBusy = (value: boolean) => { lock.current = value; setBusy(value); onBusyChange?.(value); };
  const confirm = () => {
    if (lock.current || disabled) return;
    updateBusy(true);
    Alert.alert('Change connected site?', 'You will be signed out and asked for a new site URL. Saved work will not be deleted. If you have used Google Maps, fully close and reopen the app before using maps on the new site.', [
      { text: 'Cancel', style: 'cancel', onPress: () => updateBusy(false) },
      { text: 'Change site', onPress: () => {
        void changeSite(siteUrl).then(() => {
          if (router.canDismiss()) router.dismissAll();
          router.replace('/');
        }).catch((error) => Alert.alert('Site not changed', error instanceof Error ? error.message : 'Could not change site. Please try again.'))
          .finally(() => updateBusy(false));
      } },
    ], { cancelable: false });
  };
  if (!siteUrl) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Change site" disabled={disabled || busy} onPress={confirm} style={styles.button}>
    <Text style={[styles.action, (disabled || busy) && styles.disabled]}>{busy ? 'Checking saved work…' : 'Change site'}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', alignSelf: 'stretch', paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  action: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 13 }, disabled: { opacity: 0.5 },
});
