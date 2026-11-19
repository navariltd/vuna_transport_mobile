import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import licenses from '../../../assets/legal/google-navigation-8.1.0-LICENSES.txt';
import notice from '../../../assets/legal/google-navigation-8.1.0-NOTICE.txt';
import { ScreenHeader } from '../trips/components';
import { colors } from '../../shared/theme';

const PAGE_SIZE = 12000;
// License text from the resolved SDK AAR, with line endings normalized to LF.

export default function LegalScreen() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const files = await Asset.loadAsync([notice, licenses]);
      const contents = await Promise.all(files.map((asset) => new File(asset.localUri || asset.uri).text()));
      if (!cancelled) setText(contents.join('\n\n'));
    })().catch(() => { if (!cancelled) setError('Legal notices could not load. Please reopen this screen.'); });
    return () => { cancelled = true; };
  }, []);
  const pages = Math.max(1, Math.ceil(text.length / PAGE_SIZE));
  const go = (next: number) => { setPage(next); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const find = () => {
    const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
    if (index >= 0) { setError(''); go(Math.floor(index / PAGE_SIZE)); }
    else setError('No matching license text found.');
  };
  return <View style={styles.screen}>
    <ScreenHeader back title="Legal notices" />
    <View style={styles.header}>
      <Text style={styles.title}>Google Maps & Navigation SDK 8.1.0</Text>
      <Text style={styles.body}>Attribution and third-party software licenses supplied with the Android SDK.</Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://www.google.com/help/terms_maps.html').catch(() => setError('Could not open Maps terms.'))}><Text style={styles.link}>Google Maps terms</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://policies.google.com/privacy').catch(() => setError('Could not open Google privacy policy.'))}><Text style={styles.link}>Google privacy policy</Text></Pressable>
      </View>
      <View style={styles.links}><TextInput accessibilityLabel="Search licenses" placeholder="Search licenses" value={query} onChangeText={setQuery} onSubmitEditing={find} style={styles.input} /><Pressable accessibilityRole="button" onPress={find}><Text style={styles.link}>Find</Text></Pressable></View>
      {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
      <View style={styles.links}>
        <Pressable accessibilityRole="button" disabled={page === 0} onPress={() => go(page - 1)}><Text style={[styles.link, page === 0 && styles.disabled]}>Previous</Text></Pressable>
        <Text style={styles.body}>Page {page + 1} of {pages}</Text>
        <Pressable accessibilityRole="button" disabled={page + 1 >= pages} onPress={() => go(page + 1)}><Text style={[styles.link, page + 1 >= pages && styles.disabled]}>Next</Text></Pressable>
      </View>
    </View>
    <ScrollView ref={scroll} contentContainerStyle={styles.text}><Text selectable style={styles.body}>{text ? text.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : error || 'Loading bundled notices…'}</Text></ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, header: { padding: 16, gap: 12 }, title: { fontSize: 18, fontWeight: '600', color: colors.ink },
  body: { color: colors.ink, fontSize: 13, lineHeight: 20 }, links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  link: { color: colors.ink, paddingVertical: 10, textDecorationLine: 'underline' }, disabled: { opacity: 0.35 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.ink }, text: { padding: 16 },
});
