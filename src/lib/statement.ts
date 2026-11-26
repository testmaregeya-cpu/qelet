import { formatBillMonthLabel } from '../domain/billing';
import { formatEtb, formatQuantityMilli } from './money';
import { findMember } from './shopRules';
import type { Member, Shop } from '../types/phase1';
import type { LedgerEntry, ShopLedgerSummary } from '../types/phase2';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildShopStatementText(params: {
  householdName: string;
  shopName: string;
  generatedDate: string;
  summary: ShopLedgerSummary;
  entries: readonly LedgerEntry[];
  members: readonly Member[];
}): string {
  const { householdName, shopName, generatedDate, summary, entries, members } = params;
  const activeEntries = entries.filter((e) => !e.voided);

  const lines: string[] = [
    `QELET SHOP STATEMENT`,
    `Shop: ${shopName}`,
    `Household: ${householdName}`,
    `Date: ${generatedDate}`,
    `Status: ${summary.status}`,
    `Current Balance Owed: ${
      summary.balanceSantim < 0
        ? `Credit ${formatEtb(summary.unappliedCreditSantim)}`
        : formatEtb(summary.balanceSantim)
    }`,
    `Total Charged: ${formatEtb(summary.totalChargedSantim)} | Total Paid: ${formatEtb(
      summary.totalPaidSantim
    )}`,
  ];

  if (summary.bills.length > 0) {
    lines.push('', '--- Bills by Month ---');
    for (const bill of [...summary.bills].reverse()) {
      lines.push(
        `${bill.label}: Charged ${formatEtb(bill.chargedSantim)}, Paid ${formatEtb(
          bill.paidSantim
        )}, Remaining ${formatEtb(bill.remainingSantim)} [${bill.status}]`
      );
    }
  }

  if (activeEntries.length > 0) {
    lines.push('', '--- Entries ---');
    for (const entry of activeEntries.slice(0, 40)) {
      const actor = findMember(members, entry.created_by)?.display_name ?? 'Partner';
      const prefix = entry.type === 'charge' ? '+' : '-';
      const billTag = entry.bill_month ? ` (${formatBillMonthLabel(entry.bill_month)})` : '';
      lines.push(
        `${entry.entry_date} | ${actor} | ${entry.type.toUpperCase()}${billTag}: ${prefix}${formatEtb(
          entry.total_amount_santim
        )}`
      );
      if (entry.type === 'charge' && entry.entry_lines) {
        for (const item of entry.entry_lines) {
          lines.push(
            `   • ${formatQuantityMilli(item.quantity_milli)} ${item.unit} ${item.item_name} = ${formatEtb(
              item.line_total_santim
            )}`
          );
        }
      }
      if (entry.note) {
        lines.push(`   Note: ${entry.note}`);
      }
    }
  }

  return lines.join('\n');
}

export function buildShopStatementHtml(params: {
  householdName: string;
  shopName: string;
  generatedDate: string;
  summary: ShopLedgerSummary;
  entries: readonly LedgerEntry[];
  members: readonly Member[];
}): string {
  const { householdName, shopName, generatedDate, summary, entries, members } = params;
  const activeEntries = entries.filter((e) => !e.voided);

  const billRows = [...summary.bills]
    .reverse()
    .map(
      (b) => `
      <tr>
        <td>${escapeHtml(b.label)}</td>
        <td>${escapeHtml(formatEtb(b.chargedSantim))}</td>
        <td>${escapeHtml(formatEtb(b.paidSantim))}</td>
        <td><strong>${escapeHtml(formatEtb(b.remainingSantim))}</strong></td>
        <td>${escapeHtml(b.status)}</td>
      </tr>`
    )
    .join('');

  const entryRows = activeEntries
    .map((e) => {
      const actor = findMember(members, e.created_by)?.display_name ?? 'Partner';
      const itemsText =
        e.type === 'charge' && e.entry_lines?.length
          ? e.entry_lines
              .map(
                (l) =>
                  `${formatQuantityMilli(l.quantity_milli)} ${l.unit} ${l.item_name} (${formatEtb(
                    l.line_total_santim
                  )})`
              )
              .join('<br/>')
          : e.note || 'Payment';
      const sign = e.type === 'charge' ? '+' : '-';
      return `
      <tr>
        <td>${escapeHtml(e.entry_date)}</td>
        <td>${escapeHtml(actor)}</td>
        <td>${escapeHtml(e.type.toUpperCase())}</td>
        <td>${itemsText}</td>
        <td style="text-align:right;"><strong>${sign}${escapeHtml(
          formatEtb(e.total_amount_santim)
        )}</strong></td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #132019; padding: 24px; }
    h1 { color: #146C43; margin: 0 0 4px 0; font-size: 22px; }
    .meta { color: #52635A; font-size: 13px; margin-bottom: 16px; }
    .summary { background: #E7F4EC; padding: 14px; border-radius: 10px; margin-bottom: 18px; }
    .balance { font-size: 24px; font-weight: bold; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 18px; font-size: 12px; }
    th, td { border-bottom: 1px solid #DCE3DC; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { background: #F6F7F4; color: #52635A; text-transform: uppercase; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Qelet Statement · ${escapeHtml(shopName)}</h1>
  <div class="meta">Household: ${escapeHtml(householdName)} · Generated: ${escapeHtml(generatedDate)} · Status: <strong>${escapeHtml(summary.status)}</strong></div>
  <div class="summary">
    <div>Balance Owed</div>
    <div class="balance">${escapeHtml(
      summary.balanceSantim < 0
        ? `Credit ${formatEtb(summary.unappliedCreditSantim)}`
        : formatEtb(summary.balanceSantim)
    )}</div>
    <div>Total Charged: ${escapeHtml(formatEtb(summary.totalChargedSantim))} · Total Paid: ${escapeHtml(formatEtb(summary.totalPaidSantim))}</div>
  </div>
  <h3>Monthly Bills</h3>
  <table>
    <thead><tr><th>Month</th><th>Charged</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead>
    <tbody>${billRows || '<tr><td colspan="5">No bills</td></tr>'}</tbody>
  </table>
  <h3>Ledger Entries</h3>
  <table>
    <thead><tr><th>Date</th><th>Added By</th><th>Type</th><th>Details</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>${entryRows || '<tr><td colspan="5">No entries</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

export function buildEntriesCsv(
  entries: readonly LedgerEntry[],
  shops: readonly Shop[],
  members: readonly Member[]
): string {
  const shopMap = new Map(shops.map((s) => [s.id, s.name]));
  const memberMap = new Map(members.map((m) => [m.user_id, m.display_name]));

  const header = [
    'entry_id',
    'entry_date',
    'bill_month',
    'shop',
    'type',
    'added_by',
    'total_etb',
    'total_santim',
    'items',
    'note',
    'voided',
    'void_reason',
  ].join(',');

  const rows = entries.map((e) => {
    const shopName = shopMap.get(e.shop_id) ?? e.shop_id;
    const actor = memberMap.get(e.created_by) ?? e.created_by;
    const items = (e.entry_lines ?? [])
      .map(
        (l) =>
          `${formatQuantityMilli(l.quantity_milli)} ${l.unit} ${l.item_name} (${formatEtb(
            l.line_total_santim
          )})`
      )
      .join(' | ');
    return [
      e.id,
      e.entry_date,
      e.bill_month ?? '',
      shopName,
      e.type,
      actor,
      (e.total_amount_santim / 100).toFixed(2),
      String(e.total_amount_santim),
      items,
      e.note,
      String(e.voided),
      e.void_reason ?? '',
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [header, ...rows].join('\n');
}
