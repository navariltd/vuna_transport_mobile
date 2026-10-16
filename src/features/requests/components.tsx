import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader, StateView } from '../trips/components';
import { colors, radius, spacing } from '../../shared/theme';

export function RequestScreen({
  children,
  error,
  loading,
  title,
}: {
  children: ReactNode;
  error?: string;
  loading?: boolean;
  title: string;
}) {
  if (loading) return <View style={styles.screen}><StateView loading /></View>;
  return <View style={styles.screen}>
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <ScreenHeader back title={title} />
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  </View>;
}

export function OptionList({
  emptyText = 'No options found.',
  onSelect,
  options,
  selected,
}: {
  emptyText?: string;
  onSelect: (value: string) => void;
  options: { label: string; value: string; detail?: string }[];
  selected?: string;
}) {
  if (!options.length) return <Text style={styles.empty}>{emptyText}</Text>;
  return <View style={styles.optionList}>{options.map((option) => {
    const active = option.value === selected;
    return <Pressable key={option.value} onPress={() => onSelect(option.value)} style={[styles.option, active && styles.optionActive]}>
      <View style={styles.optionCopy}>
        <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{option.label}</Text>
        {option.detail ? <Text style={[styles.optionDetail, active && styles.optionDetailActive]}>{option.detail}</Text> : null}
      </View>
      {active ? <Ionicons color={colors.surface} name="checkmark-circle" size={20} /> : null}
    </Pressable>;
  })}</View>;
}

export function SubmitButton({ label, loading, onPress }: { label: string; loading?: boolean; onPress: () => void }) {
  return <Pressable disabled={loading} onPress={onPress} style={[styles.submit, loading && styles.disabled]}>
    {loading ? <ActivityIndicator color={colors.surface} /> : <><Text style={styles.submitText}>{label}</Text><Ionicons color={colors.surface} name="arrow-forward" size={19} /></>}
  </Pressable>;
}

export const requestStyles = StyleSheet.create({
  intro: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: spacing.lg },
  label: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 9, marginTop: spacing.xl },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 15, minHeight: 50, paddingHorizontal: 14 },
  textArea: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 96, padding: 14, textAlignVertical: 'top' },
  success: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: radius.md, marginTop: spacing.xl, padding: spacing.xl },
  successTitle: { color: colors.success, fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 12 },
  successReference: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 8 },
  successText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: 'center' },
});

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingBottom: 48, paddingTop: 58 },
  error: { color: colors.danger, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 20, marginTop: spacing.lg },
  empty: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, paddingVertical: 14 },
  optionList: { gap: 8 },
  option: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  optionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionCopy: { flex: 1 },
  optionLabel: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  optionLabelActive: { color: colors.surface },
  optionDetail: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  optionDetailActive: { color: colors.border },
  submit: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: spacing.xl, minHeight: 54 },
  submitText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  disabled: { opacity: 0.6 },
});
