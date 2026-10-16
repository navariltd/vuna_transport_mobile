import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createExpenseClaim, getMobileRequestSetup } from '../../../../features/requests/api';
import { RequestScreen, SubmitButton, requestStyles } from '../../../../features/requests/components';
import type { CreatedMobileRequest, MobileRequestSetup } from '../../../../features/requests/types';
import { colors, radius, spacing } from '../../../../shared/theme';

type ExpenseLine = {
  id: string;
  expenseType: string;
  amount: string;
  expenseDate: string;
  description: string;
};

const MAX_EXPENSE_ROWS = 20;

export default function ExpenseClaimRequestScreen() {
  const { tripName } = useLocalSearchParams<{ tripName: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [setup, setSetup] = useState<MobileRequestSetup | null>(null);
  const [expenses, setExpenses] = useState<ExpenseLine[]>(() => [newExpenseLine()]);
  const [openTypeRow, setOpenTypeRow] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedMobileRequest | null>(null);
  const requestId = useRef(Crypto.randomUUID());

  const load = useCallback(async () => {
    if (!tripName) return;
    try {
      setError('');
      setSetup(await getMobileRequestSetup(tripName));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load Expense Claim options.');
    } finally {
      setLoading(false);
    }
  }, [tripName]);

  useEffect(() => { void load(); }, [load]);

  const updateExpense = (id: string, changes: Partial<ExpenseLine>) => {
    setExpenses((current) => current.map((row) => row.id === id ? { ...row, ...changes } : row));
  };

  const removeExpense = (id: string) => {
    setExpenses((current) => current.filter((row) => row.id !== id));
    setOpenTypeRow((current) => current === id ? null : current);
  };

  const submit = async () => {
    if (!tripName || submitting) return;
    if (!setup?.permissions.expense_claim) return setError('Your account cannot create Expense Claims. Contact your administrator.');
    const incompleteRow = expenses.findIndex((row) => !row.expenseType || !(Number(row.amount) > 0) || !row.expenseDate);
    if (incompleteRow >= 0) return setError(`Complete the expense type, date, and amount in row ${incompleteRow + 1}.`);
    setSubmitting(true);
    setError('');
    try {
      setCreated(await createExpenseClaim(tripName, {
        expenses: expenses.map((row) => ({
          amount: Number(row.amount),
          description: row.description,
          expense_date: row.expenseDate,
          expense_type: row.expenseType,
        })),
        remarks,
        request_id: requestId.current,
      }));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not create the Expense Claim.');
    } finally {
      setSubmitting(false);
    }
  };

  return <RequestScreen error={error} loading={!fontsLoaded || loading} title="Expense Claim">
    <StatusBar style="dark" />
    {created ? <>
      <Text style={requestStyles.intro}>Your claim has been saved in HRMS for review.</Text>
      <Pressable onPress={() => router.back()} style={requestStyles.success}>
        <Ionicons color={colors.success} name="checkmark-circle" size={34} />
        <Text style={requestStyles.successTitle}>Expense Claim created</Text>
        <Text style={requestStyles.successReference}>{created.name}</Text>
        <Text style={requestStyles.successText}>Status: {created.status}. Tap to return to the Delivery Trip.</Text>
      </Pressable>
    </> : <>
      <Text style={requestStyles.intro}>Add the expenses incurred during this trip. One draft claim will be created for normal HRMS review.</Text>
      <View style={styles.expenseHeading}>
        <View>
          <Text style={styles.sectionTitle}>Expenses</Text>
          <Text style={styles.sectionCaption}>{expenses.length} of {MAX_EXPENSE_ROWS} rows</Text>
        </View>
        <Pressable
          disabled={expenses.length >= MAX_EXPENSE_ROWS}
          onPress={() => setExpenses((current) => [...current, newExpenseLine()])}
          style={[styles.addButton, expenses.length >= MAX_EXPENSE_ROWS && styles.disabled]}
        >
          <Ionicons color={colors.ink} name="add" size={18} />
          <Text style={styles.addButtonText}>Add expense</Text>
        </Pressable>
      </View>
      {expenses.map((expense, index) => <View key={expense.id} style={styles.expenseCard}>
        <View style={styles.rowHeading}>
          <Text style={styles.rowTitle}>Expense {index + 1}</Text>
          {expenses.length > 1 ? <Pressable hitSlop={10} onPress={() => removeExpense(expense.id)}>
            <Ionicons color={colors.danger} name="trash-outline" size={20} />
          </Pressable> : null}
        </View>
        <Text style={styles.fieldLabel}>EXPENSE TYPE</Text>
        <Pressable onPress={() => setOpenTypeRow((current) => current === expense.id ? null : expense.id)} style={styles.selectButton}>
          <Text numberOfLines={1} style={[styles.selectText, !expense.expenseType && styles.placeholder]}>{expense.expenseType || 'Select expense type'}</Text>
          <Ionicons color={colors.muted} name={openTypeRow === expense.id ? 'chevron-up' : 'chevron-down'} size={18} />
        </Pressable>
        {openTypeRow === expense.id ? <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.typeDropdown}>
          {(setup?.expense_types || []).length ? setup?.expense_types.map((expenseType) => <Pressable
            key={expenseType}
            onPress={() => { updateExpense(expense.id, { expenseType }); setOpenTypeRow(null); }}
            style={[styles.typeOption, expense.expenseType === expenseType && styles.typeOptionActive]}
          >
            <Text style={[styles.typeOptionText, expense.expenseType === expenseType && styles.typeOptionTextActive]}>{expenseType}</Text>
            {expense.expenseType === expenseType ? <Ionicons color={colors.surface} name="checkmark" size={17} /> : null}
          </Pressable>) : <Text style={styles.emptyOptions}>No Expense Claim Types are configured for this company.</Text>}
        </ScrollView> : null}
        <View style={styles.fieldRow}>
          <View style={styles.fieldColumn}>
            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <TextInput keyboardType="decimal-pad" onChangeText={(amount) => updateExpense(expense.id, { amount })} placeholder="0.00" placeholderTextColor={colors.faint} style={requestStyles.input} value={expense.amount} />
          </View>
          <View style={styles.fieldColumn}>
            <Text style={styles.fieldLabel}>EXPENSE DATE</Text>
            <TextInput onChangeText={(expenseDate) => updateExpense(expense.id, { expenseDate })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.faint} style={requestStyles.input} value={expense.expenseDate} />
          </View>
        </View>
        <Text style={styles.fieldLabel}>DESCRIPTION</Text>
        <TextInput multiline onChangeText={(description) => updateExpense(expense.id, { description })} placeholder="What was this expense for?" placeholderTextColor={colors.faint} style={styles.descriptionInput} value={expense.description} />
      </View>)}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Claim total</Text>
        <Text style={styles.totalValue}>{expenses.reduce((total, row) => total + (Number(row.amount) || 0), 0).toFixed(2)}</Text>
      </View>
      <Text style={requestStyles.label}>Remarks</Text>
      <TextInput multiline onChangeText={setRemarks} placeholder="Optional additional information" placeholderTextColor={colors.faint} style={requestStyles.textArea} value={remarks} />
      <SubmitButton label="Create Expense Claim" loading={submitting} onPress={submit} />
    </>}
  </RequestScreen>;
}

function newExpenseLine(): ExpenseLine {
  return {
    id: Crypto.randomUUID(),
    expenseType: '',
    amount: '',
    expenseDate: localDate(),
    description: '',
  };
}

function localDate() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  expenseHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 },
  sectionCaption: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  addButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 99, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 40, paddingHorizontal: 13 },
  addButtonText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  disabled: { opacity: 0.45 },
  expenseCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginTop: 14, padding: spacing.md },
  rowHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  rowTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 14 },
  fieldLabel: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, marginBottom: 8, marginTop: 14 },
  selectButton: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: 13 },
  selectText: { color: colors.ink, flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14 },
  placeholder: { color: colors.faint },
  typeDropdown: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginTop: 6, maxHeight: 210 },
  typeOption: { alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 13 },
  typeOptionActive: { backgroundColor: colors.ink },
  typeOptionText: { color: colors.ink, flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  typeOptionTextActive: { color: colors.surface },
  emptyOptions: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, padding: 14 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldColumn: { flex: 1 },
  descriptionInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 13, minHeight: 76, padding: 12, textAlignVertical: 'top' },
  totalRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: 1, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, paddingVertical: 15 },
  totalLabel: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  totalValue: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 },
});
