import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getSupabaseClient } from '../lib/supabase';
import type { AuditLogRow } from '../types/phase4to6';

export async function fetchFullAuditLog(
  householdId: string,
  limit = 150,
  offset = 0
): Promise<AuditLogRow[]> {
  const supabase = getSupabaseClient();
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, limit);
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .eq('household_id', householdId)
    .order('at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)
    .returns<AuditLogRow[]>();

  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function recordLoginEventSafely(): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.rpc('record_login_event');
  } catch {
    // Non-blocking audit hook
  }
}

export async function exportHouseholdJsonAndShare(householdId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('export_household_data', {
    p_household_id: householdId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const file = new File(Paths.cache, `qelet-export-${Date.now()}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(data, null, 2));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device');
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Export Qelet Household Data (JSON)',
    mimeType: 'application/json',
  });
}

export async function exportTextFileAndShare(
  filename: string,
  content: string,
  mimeType = 'text/csv'
): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is unavailable on this device');
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: `Share ${filename}`,
    mimeType,
  });
}

export async function exportHtmlStatementAsPdfAndShare(
  html: string,
  dialogTitle = 'Share Qelet Shop Statement (PDF)'
): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is unavailable on this device');
  }

  await Sharing.shareAsync(uri, {
    dialogTitle,
    mimeType: 'application/pdf',
    UTI: '.pdf',
  });
}
