export type ThemeMode = 'light' | 'dark' | 'system';

export interface Category {
  id: string;
  household_id: string;
  name: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

export interface CatalogItem {
  id: string;
  household_id: string;
  category_id: string | null;
  name: string;
  default_unit: string;
  default_price_santim: number;
  archived: boolean;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  household_id: string;
  daily_reminder_enabled: boolean;
  daily_reminder_hour: number;
  daily_reminder_minute: number;
  skip_if_logged_today: boolean;
  window_open_alerts: boolean;
  overdue_nudges: boolean;
  partner_alerts: boolean;
  theme_mode: ThemeMode;
  expo_push_token: string | null;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  household_id: string;
  at: string;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}

export interface ItemSuggestion {
  key: string;
  item_name: string;
  unit: string;
  unit_price_santim: number;
  source: 'memory' | 'catalog';
  catalog_item_id: string | null;
  category_name: string | null;
  use_count: number;
}
