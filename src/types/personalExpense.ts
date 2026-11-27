import type Feather from '@expo/vector-icons/Feather';

export type ExpenseCategoryKey =
  | 'transport'
  | 'mobile'
  | 'food_coffee'
  | 'lunch_dining'
  | 'groceries'
  | 'utilities'
  | 'shopping'
  | 'health'
  | 'entertainment'
  | 'other';

export type PaymentMethod = 'cash' | 'telebirr' | 'cbe_birr' | 'bank' | 'other';

export interface PersonalCategory {
  id: string;
  user_id: string;
  name: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bg_color: string;
  created_at: string;
}

export interface PersonalCategoryDraft {
  name: string;
  icon?: keyof typeof Feather.glyphMap;
  color?: string;
  bgColor?: string;
}

export interface PersonalExpense {
  id: string;
  user_id: string;
  amount_santim: number;
  category: ExpenseCategoryKey | (string & {});
  title: string;
  note: string;
  expense_date: string; // YYYY-MM-DD in Africa/Addis_Ababa
  payment_method: PaymentMethod;
  client_request_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalExpenseDraft {
  amountSantim: number;
  category: ExpenseCategoryKey | (string & {});
  title: string;
  note?: string;
  expenseDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  clientRequestId?: string;
}

export interface ExpenseCategoryMeta {
  key: ExpenseCategoryKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bgColor: string;
  popularPresets: string[];
}

export const EXPENSE_CATEGORIES: Record<ExpenseCategoryKey, ExpenseCategoryMeta> = {
  transport: {
    key: 'transport',
    label: 'Taxi & Transport',
    icon: 'navigation',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    popularPresets: ['Ride / Feres', 'Minibus Taxi', 'Bajaj Ride', 'Lada Taxi', 'Bus / Train'],
  },
  mobile: {
    key: 'mobile',
    label: 'Mobile Card & Data',
    icon: 'smartphone',
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    popularPresets: ['Ethio 100 ETB', 'Ethio 50 ETB', 'Weekly Data Package', 'Monthly Package', 'Safaricom Airtime'],
  },
  food_coffee: {
    key: 'food_coffee',
    label: 'Coffee & Snacks',
    icon: 'coffee',
    color: '#B45309',
    bgColor: '#FEF3C7',
    popularPresets: ['Morning Bunna', 'Macchiato', 'Pastry / Sambusa', 'Afternoon Tea', 'Juice / Smoothie'],
  },
  lunch_dining: {
    key: 'lunch_dining',
    label: 'Lunch & Dining',
    icon: 'compass',
    color: '#EA580C',
    bgColor: '#FFEDD5',
    popularPresets: ['Workday Lunch', 'Dinner Out', 'Fast Food', 'Shiro / Tibs Lunch', 'Takeout'],
  },
  groceries: {
    key: 'groceries',
    label: 'Groceries',
    icon: 'shopping-bag',
    color: '#16A34A',
    bgColor: '#DCFCE7',
    popularPresets: ['Supermarket', 'Fruits & Veggies', 'Bread / Bakery', 'Meat / Butcher', 'Spices'],
  },
  utilities: {
    key: 'utilities',
    label: 'Utilities & Bills',
    icon: 'zap',
    color: '#D97706',
    bgColor: '#FEF9C3',
    popularPresets: ['Electricity Card', 'Water Bill', 'Home Wifi', 'Laundry', 'House Service'],
  },
  shopping: {
    key: 'shopping',
    label: 'Shopping & Care',
    icon: 'tag',
    color: '#DB2777',
    bgColor: '#FCE7F3',
    popularPresets: ['Clothes', 'Shoes', 'Haircut / Salon', 'Cosmetics / Hygiene', 'Electronics'],
  },
  health: {
    key: 'health',
    label: 'Health & Pharmacy',
    icon: 'heart',
    color: '#E11D48',
    bgColor: '#FFE4E6',
    popularPresets: ['Pharmacy Medicine', 'Doctor Visit', 'Vitamins / First Aid', 'Dental'],
  },
  entertainment: {
    key: 'entertainment',
    label: 'Fun & Outings',
    icon: 'film',
    color: '#6366F1',
    bgColor: '#EEF2FF',
    popularPresets: ['Cinema / Movies', 'Weekend Gathering', 'Games / Sports', 'Drinks with Friends'],
  },
  other: {
    key: 'other',
    label: 'Other',
    icon: 'more-horizontal',
    color: '#475569',
    bgColor: '#F1F5F9',
    popularPresets: ['Donation / Charity', 'Gift', 'Home Maintenance', 'Miscellaneous'],
  },
};

export const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'cash', label: 'Cash', icon: 'dollar-sign' },
  { key: 'telebirr', label: 'Telebirr', icon: 'smartphone' },
  { key: 'cbe_birr', label: 'CBE Birr', icon: 'credit-card' },
  { key: 'bank', label: 'Bank Transfer', icon: 'send' },
  { key: 'other', label: 'Other', icon: 'check-circle' },
];

export const CATEGORY_COLOR_PRESETS: { color: string; bgColor: string; label: string }[] = [
  { color: '#0284C7', bgColor: '#E0F2FE', label: 'Blue' },
  { color: '#059669', bgColor: '#D1FAE5', label: 'Emerald' },
  { color: '#7C3AED', bgColor: '#EDE9FE', label: 'Purple' },
  { color: '#E11D48', bgColor: '#FFE4E6', label: 'Rose' },
  { color: '#D97706', bgColor: '#FEF3C7', label: 'Amber' },
  { color: '#0891B2', bgColor: '#CFFAFE', label: 'Cyan' },
  { color: '#4F46E5', bgColor: '#EEF2FF', label: 'Indigo' },
  { color: '#475569', bgColor: '#F1F5F9', label: 'Slate' },
];

export const CATEGORY_ICON_PRESETS: (keyof typeof Feather.glyphMap)[] = [
  'tag',
  'activity',
  'heart',
  'book',
  'gift',
  'tool',
  'truck',
  'briefcase',
  'home',
  'smile',
  'star',
  'dollar-sign',
];

export function getCategoryMeta(
  categoryKey: string,
  customCategories?: PersonalCategory[]
): {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bgColor: string;
} {
  const std = EXPENSE_CATEGORIES[categoryKey as ExpenseCategoryKey];
  if (std) {
    return {
      key: std.key,
      label: std.label,
      icon: std.icon,
      color: std.color,
      bgColor: std.bgColor,
    };
  }

  if (customCategories && customCategories.length > 0) {
    const found = customCategories.find(
      (c) => c.name.toLowerCase() === categoryKey.toLowerCase() || c.id === categoryKey
    );
    if (found) {
      return {
        key: found.name,
        label: found.name,
        icon: found.icon || 'tag',
        color: found.color || '#0284C7',
        bgColor: found.bg_color || '#E0F2FE',
      };
    }
  }

  return {
    key: categoryKey,
    label: categoryKey,
    icon: 'tag',
    color: '#475569',
    bgColor: '#F1F5F9',
  };
}
