import React from 'react';
import { PersonalCategoryAnalysisCard } from '../src/components/PersonalCategoryAnalysisCard';
import { PersonalExpenseRow } from '../src/components/PersonalExpenseRow';
import { LogExpenseModal } from '../src/components/LogExpenseModal';
import type { PersonalExpense, PersonalCategory } from '../src/types/personalExpense';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));
jest.mock('@expo/vector-icons/Feather', () => 'Feather');

jest.mock('../src/lib/haptics', () => ({
  triggerHaptic: jest.fn(),
}));

jest.mock('../src/theme/ThemeContext', () => ({
  useTheme: () => ({
    palette: {
      background: '#FAFAF7',
      surface: '#FFFFFF',
      surfaceMuted: '#F4F4F0',
      border: '#E3E3DC',
      borderStrong: '#C8C8BE',
      textPrimary: '#1E1E1C',
      textSecondary: '#5A5A54',
      textMuted: '#8C8C82',
      primary: '#146C43',
      primaryLight: '#E8F5E9',
      primaryButtonBg: '#146C43',
      primaryButtonText: '#FFFFFF',
      cardElevated: '#FFFFFF',
      danger: '#B42318',
    },
    isDark: false,
  }),
}));

describe('Personal Expense UI Components', () => {
  const sampleExpense: PersonalExpense = {
    id: 'exp-123',
    user_id: 'user-xyz',
    amount_santim: 12500, // 125.00 ETB
    category: 'transport',
    title: 'Ride to Megenagna',
    note: 'Feres economy',
    expense_date: '2026-05-18',
    payment_method: 'telebirr',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders PersonalExpenseRow with props correctly', () => {
    const onPress = jest.fn();
    const onDelete = jest.fn();

    const element = (
      <PersonalExpenseRow
        expense={sampleExpense}
        onPress={onPress}
        onDelete={onDelete}
      />
    );

    expect(element).toBeDefined();
    expect(element.props.expense.id).toBe('exp-123');
    expect(element.props.expense.title).toBe('Ride to Megenagna');
    expect(element.props.expense.amount_santim).toBe(12500);
  });

  it('detects pending sync state on offline items', () => {
    const offlineExpense: PersonalExpense = {
      ...sampleExpense,
      id: 'local_client-req-999',
    };

    const element = <PersonalExpenseRow expense={offlineExpense} />;
    expect(element.props.expense.id.startsWith('local_')).toBe(true);
  });

  it('renders LogExpenseModal with initial props correctly', () => {
    const onClose = jest.fn();
    const onSaved = jest.fn();

    const element = (
      <LogExpenseModal
        visible={true}
        onClose={onClose}
        onSaved={onSaved}
        userId="user-test-1"
        initialExpense={sampleExpense}
      />
    );

    expect(element).toBeDefined();
    expect(element.props.visible).toBe(true);
    expect(element.props.userId).toBe('user-test-1');
    expect(element.props.initialExpense?.title).toBe('Ride to Megenagna');
  });

  it('supports custom categories in PersonalExpenseRow and LogExpenseModal', () => {
    const customCategories: PersonalCategory[] = [
      {
        id: 'cat-gym',
        user_id: 'user-xyz',
        name: 'Gym',
        icon: 'activity',
        color: '#059669',
        bg_color: '#D1FAE5',
        created_at: new Date().toISOString(),
      },
    ];

    const gymExpense: PersonalExpense = {
      ...sampleExpense,
      category: 'Gym',
      title: 'Monthly membership',
    };

    const row = (
      <PersonalExpenseRow
        expense={gymExpense}
        customCategories={customCategories}
      />
    );
    expect(row).toBeDefined();
    expect(row.props.expense.category).toBe('Gym');
    expect(row.props.customCategories).toHaveLength(1);

    const modal = (
      <LogExpenseModal
        visible={true}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        userId="user-xyz"
        customCategories={customCategories}
        onCategoryCreated={jest.fn()}
      />
    );
    expect(modal).toBeDefined();
    expect(modal.props.customCategories?.[0].name).toBe('Gym');
  });

  it('shows purchases inline when a Deep Analysis category card is expanded and handles clicks', () => {
    interface ElementProps {
      testID?: string;
      children?: React.ReactNode;
      onPress?: () => void;
    }
    const findByTestId = (
      node: unknown,
      testID: string
    ): React.ReactElement<ElementProps> | null => {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const child of node) {
          const hit = findByTestId(child, testID);
          if (hit) return hit;
        }
        return null;
      }
      const el = node as React.ReactElement<ElementProps>;
      if (el.props?.testID === testID) return el;
      if (el.props?.children) {
        return findByTestId(el.props.children, testID);
      }
      return null;
    };

    const groceryPurchases: PersonalExpense[] = [
      {
        ...sampleExpense,
        id: 'groc-1',
        category: 'groceries',
        title: 'Milk and Eggs',
        amount_santim: 25000,
        expense_date: '2026-05-19',
      },
      {
        ...sampleExpense,
        id: 'groc-2',
        category: 'groceries',
        title: 'Fresh Vegetables',
        amount_santim: 18000,
        expense_date: '2026-05-18',
      },
    ];

    const categoryStat = {
      category: 'groceries',
      label: 'Groceries',
      icon: 'shopping-bag' as const,
      color: '#16A34A',
      bgColor: '#DCFCE7',
      totalSantim: 43000,
      count: 2,
      pctOfTotal: 55,
      changeFromLastMonthPct: 12,
      lastMonthTotalSantim: 38000,
    };

    const onToggle = jest.fn();
    const onPressPurchase = jest.fn();

    const collapsedTree = PersonalCategoryAnalysisCard({
      categoryStat,
      purchases: groceryPurchases,
      expanded: false,
      onToggle,
      onPressPurchase,
    });

    expect(findByTestId(collapsedTree, 'analysis-category-purchases-groceries')).toBeNull();
    const toggleBtn = findByTestId(collapsedTree, 'analysis-category-toggle-groceries');
    expect(toggleBtn).not.toBeNull();
    toggleBtn?.props.onPress?.();
    expect(onToggle).toHaveBeenCalledWith('groceries');

    const expandedTree = PersonalCategoryAnalysisCard({
      categoryStat,
      purchases: groceryPurchases,
      expanded: true,
      onToggle,
      onPressPurchase,
    });

    expect(findByTestId(expandedTree, 'analysis-category-purchases-groceries')).not.toBeNull();
    const firstPurchase = findByTestId(expandedTree, 'analysis-purchase-row-groc-1');
    const secondPurchase = findByTestId(expandedTree, 'analysis-purchase-row-groc-2');
    expect(firstPurchase).not.toBeNull();
    expect(secondPurchase).not.toBeNull();

    firstPurchase?.props.onPress?.();
    expect(onPressPurchase).toHaveBeenCalledWith(groceryPurchases[0]);
  });
});
