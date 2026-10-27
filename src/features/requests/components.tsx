import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
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
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (error) requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  }, [error]);

  if (loading) return <View style={styles.screen}><StateView loading /></View>;

  return <View style={styles.screen}>
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      ref={scrollRef}
    >
      <ScreenHeader back title={title} />
      {error ? <TaskErrorBanner message={error} /> : null}
      {children}
    </ScrollView>
  </View>;
}

export function TaskErrorBanner({ message, title = 'Action could not be completed' }: { message: string; title?: string }) {
  return <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.errorBanner}>
    <View style={styles.errorIcon}><Ionicons color={colors.danger} name="alert-circle" size={21} /></View>
    <View style={styles.errorCopy}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
    </View>
  </View>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <View accessibilityRole="alert" style={styles.fieldError}>
    <Ionicons color={colors.danger} name="alert-circle-outline" size={14} />
    <Text style={styles.fieldErrorText}>{message}</Text>
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
  invalidInput: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  textArea: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 96, padding: 14, textAlignVertical: 'top' },
  success: { alignItems: 'center', backgroundColor: colors.successSoft, borderRadius: radius.md, marginTop: spacing.xl, padding: spacing.xl },
  successTitle: { color: colors.success, fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 12 },
  successReference: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 8 },
  successText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: 'center' },
});

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingBottom: 48, paddingTop: 58 },
  errorBanner: { alignItems: 'flex-start', backgroundColor: colors.dangerSoft, borderColor: '#E7B6B6', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: spacing.lg, padding: 14 },
  errorIcon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 99, height: 32, justifyContent: 'center', width: 32 },
  errorCopy: { flex: 1 },
  errorTitle: { color: colors.danger, fontFamily: 'Inter_700Bold', fontSize: 13 },
  errorMessage: { color: colors.danger, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 3 },
  fieldError: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 6 },
  fieldErrorText: { color: colors.danger, flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16 },
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
