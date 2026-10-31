import { SubItem, Transaction } from '../types/ledger';

const STORAGE_KEY = 'smart_money_subitems_store_v1';

interface StoredSubItemsMap {
  [key: string]: SubItem[];
}

/**
 * Generate stable signature for a transaction to recover sub-items across sheet reload
 */
export function getTransactionSignature(tx: {
  id?: string;
  date?: string;
  description?: string;
  amount?: number;
}): string {
  if (tx.id && !tx.id.startsWith('local-')) {
    return tx.id;
  }
  const d = tx.date || '';
  const desc = (tx.description || '').trim();
  const amt = tx.amount || 0;
  return `${d}_${desc}_${amt}`;
}

/**
 * Load all stored sub-items map from localStorage
 */
export function loadAllSubItems(): StoredSubItemsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load sub-items from storage', e);
    return {};
  }
}

/**
 * Save sub-items map to localStorage
 */
export function saveAllSubItems(map: StoredSubItemsMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to save sub-items to storage', e);
  }
}

/**
 * Save sub-items for a specific transaction
 */
export function saveSubItemsForTransaction(
  tx: { id: string; date?: string; description?: string; amount?: number },
  subItems: SubItem[]
): void {
  const map = loadAllSubItems();
  const sig = getTransactionSignature(tx);

  if (!subItems || subItems.length === 0) {
    delete map[tx.id];
    delete map[sig];
  } else {
    map[tx.id] = subItems;
    map[sig] = subItems;
  }

  saveAllSubItems(map);
}

/**
 * Parse sub-items from a memo string if present
 * Formats supported:
 * 1. [세부품목: 우유 6,500원 | 세제 12,000원]
 * 2. [세부: 우유 6500원, 계란 8900원]
 * 3. JSON format [subItems:[{"name":"...","amount":12000}]]
 */
export function parseSubItemsFromMemo(memo?: string): SubItem[] {
  if (!memo) return [];

  // Check JSON format first
  const jsonMatch = memo.match(/\[subItems:\s*(\[.*?\])\s*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => {
          const qty = Number(item.quantity || item.qty) || 1;
          const amt = Number(item.amount || item.price || 0);
          const unitPrice = Number(item.unitPrice) || (qty > 0 ? Math.round(amt / qty) : amt);
          return {
            id: item.id || `sub_${idx}_${Date.now()}`,
            name: String(item.name || item.item || ''),
            amount: amt,
            quantity: qty,
            unitPrice: unitPrice,
            category: item.category ? String(item.category) : undefined,
            memo: item.memo ? String(item.memo) : undefined,
          };
        });
      }
    } catch {
      // ignore
    }
  }

  // Check Korean bracket format: [세부: ...] or [세부품목: ...] or [세부내역: ...]
  const match = memo.match(/\[(?:세부|세부품목|세부내역):\s*([^\]]+)\]/);
  if (!match) return [];

  const rawList = match[1].split(/[|,\n]/);
  const items: SubItem[] = [];

  rawList.forEach((raw, idx) => {
    const chunk = raw.trim();
    if (!chunk) return;

    // Pattern: "품목명 12,000원" or "품목명(카테고리) 2개 12000원"
    const amtMatch = chunk.match(/^(.*?)(?:[:\s]+)([0-9,]+)\s*(?:원)?$/);
    if (amtMatch) {
      let namePart = amtMatch[1].trim();
      const amt = parseInt(amtMatch[2].replace(/,/g, ''), 10) || 0;
      let category: string | undefined;
      let quantity = 1;

      // Extract optional category in parenthesis: "신선란 (식비)"
      const catMatch = namePart.match(/^(.*?)\s*\((.*?)\)(.*)$/);
      if (catMatch) {
        namePart = `${catMatch[1]} ${catMatch[3]}`.trim();
        category = catMatch[2].trim();
      }

      // Extract optional quantity: "우유 2개" or "2개"
      const qtyMatch = namePart.match(/^(.*?)\s*([0-9]+)\s*개(?:\s*\(.*?\))?$/);
      if (qtyMatch) {
        namePart = qtyMatch[1].trim();
        quantity = parseInt(qtyMatch[2], 10) || 1;
      }

      const unitPrice = quantity > 0 ? Math.round(amt / quantity) : amt;

      if (namePart && amt > 0) {
        items.push({
          id: `memo_sub_${idx}_${Date.now()}`,
          name: namePart,
          amount: amt,
          quantity,
          unitPrice,
          category,
        });
      }
    }
  });

  return items;
}

/**
 * Format sub-items into a concise string for Google Sheet memo
 */
export function serializeSubItemsToMemo(
  baseMemo: string | undefined,
  subItems?: SubItem[]
): string {
  // Strip existing sub-item tags from base memo
  let cleanMemo = (baseMemo || '')
    .replace(/\[(?:세부|세부품목|세부내역):[^\]]*\]/g, '')
    .replace(/\[subItems:\s*\[.*?\]\s*\]/g, '')
    .trim();

  if (!subItems || subItems.length === 0) {
    return cleanMemo;
  }

  const itemsSummary = subItems
    .map((s) => {
      const catPart = s.category ? `(${s.category})` : '';
      const qtyPart = s.quantity && s.quantity > 1 ? ` ${s.quantity}개` : '';
      return `${s.name}${catPart}${qtyPart} ${s.amount.toLocaleString('ko-KR')}원`;
    })
    .join(' | ');

  const subTag = `[세부품목: ${itemsSummary}]`;
  return cleanMemo ? `${subTag} ${cleanMemo}` : subTag;
}

/**
 * Retrieve sub-items for a transaction from storage or memo
 */
export function getSubItemsForTransaction(
  tx: Transaction,
  cachedMap?: StoredSubItemsMap
): SubItem[] {
  if (tx.subItems && tx.subItems.length > 0) {
    return tx.subItems;
  }

  const map = cachedMap || loadAllSubItems();

  // Try direct ID match
  if (tx.id && map[tx.id] && map[tx.id].length > 0) {
    return map[tx.id];
  }

  // Try signature match
  const sig = getTransactionSignature(tx);
  if (map[sig] && map[sig].length > 0) {
    return map[sig];
  }

  // Try memo parsing
  if (tx.memo) {
    const fromMemo = parseSubItemsFromMemo(tx.memo);
    if (fromMemo.length > 0) {
      return fromMemo;
    }
  }

  return [];
}

/**
 * Enrich transactions with saved or parsed sub-items
 */
export function enrichTransactionsWithSubItems(transactions: Transaction[]): Transaction[] {
  const map = loadAllSubItems();
  return transactions.map((tx) => {
    const subItems = getSubItemsForTransaction(tx, map);
    if (subItems.length > 0) {
      return { ...tx, subItems };
    }
    return tx;
  });
}
