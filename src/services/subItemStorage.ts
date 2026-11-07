import { SubItem, Transaction } from '../types/ledger';

const STORAGE_KEY = 'smart_money_subitems_store_v2';

interface StoredSubItemsMap {
  [key: string]: SubItem[];
}

/**
 * Generate stable content signature based on business attributes (date, description, amount)
 */
export function getContentSignature(tx: {
  date?: string;
  description?: string;
  amount?: number;
}): string {
  const d = tx.date || '';
  const desc = (tx.description || '').trim();
  const amt = tx.amount || 0;
  return `${d}_${desc}_${amt}`;
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
  return getContentSignature(tx);
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
  tx: { id?: string; date?: string; description?: string; amount?: number; sheetTitle?: string },
  subItems: SubItem[]
): void {
  if (!tx.id) return;
  const map = loadAllSubItems();

  if (!subItems || subItems.length === 0) {
    delete map[tx.id];
  } else {
    map[tx.id] = subItems;
  }

  saveAllSubItems(map);
}

/**
 * Robustly parse a single sub-item chunk into a SubItem object.
 * Handles:
 * - With commas: "우유 2,500원", "계란 30구 8,900원", "우유 (2,500원)", "우유: 2,500원"
 * - Without commas: "우유 2500원", "빵 3000원", "라면 4500"
 * - Quantity: "우유 2개 5,000원", "신선란 1개 8,900원"
 * - Categories: "(식비) 우유 2,500원" or "우유 (식비) 2,500원"
 * - Currency symbols: "₩2,500", "2,500원", "2500"
 */
export function parseSingleSubItemChunk(chunk: string, idx: number): SubItem | null {
  let text = chunk.trim();
  if (!text) return null;

  // 1. Extract optional unit price notes first e.g. "(개당 2,500원)" or "(단가 2500)"
  let explicitUnitPrice: number | undefined;
  const unitMatch = text.match(/\((?:개당|단가)\s*([0-9,]+)\s*원?\)/i);
  if (unitMatch) {
    explicitUnitPrice = parseInt(unitMatch[1].replace(/,/g, ''), 10) || undefined;
    text = text.replace(unitMatch[0], ' ').trim();
  }

  // 2. Extract optional category in parentheses e.g. "(식비)", "(생활용품)", "(외식)"
  let category: string | undefined;
  const catMatch = text.match(/\((?!개당|단가|수량|[0-9])([가-힣a-zA-Z0-9_\/]{1,10})\)/);
  if (catMatch) {
    category = catMatch[1].trim();
    text = text.replace(catMatch[0], ' ').trim();
  }

  // 3. Extract quantity e.g. "2개", "3ea", "1박스", "2봉"
  let quantity = 1;
  const qtyMatch = text.match(/(?:^|\s|[:(])([0-9]+)\s*(?:개|ea|EA|봉|팩|박스|병|캔|줄|개입)(?:$|\s|[:)])/i);
  if (qtyMatch) {
    quantity = Math.max(1, parseInt(qtyMatch[1], 10) || 1);
    // Remove the quantity token from text so it doesn't get confused with amount
    text = text.replace(qtyMatch[0], ' ').trim();
  }

  // 4. Extract amount:
  // Match number with optional commas followed by '원' or standing as a price number
  let amount = 0;

  // Case 4A: Trailing or embedded number with '원' or '₩' (e.g. "2,500원", "2500원", "₩ 2,500")
  const wonMatch = text.match(/(?:₩\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)\s*원/i);
  if (wonMatch) {
    amount = parseInt(wonMatch[1].replace(/,/g, ''), 10) || 0;
    text = text.replace(wonMatch[0], ' ').trim();
  } else {
    // Case 4B: Colon or space separated price at end of string e.g. "품목명: 2,500" or "품목명 2,500" or "품목명 (2,500)"
    const endNumMatch = text.match(/(?:[:\s\(]+)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})(?:\s*\)?)$/);
    if (endNumMatch) {
      amount = parseInt(endNumMatch[1].replace(/,/g, ''), 10) || 0;
      text = text.substring(0, text.length - endNumMatch[0].length).trim();
    } else {
      // Case 4C: Any number with commas (e.g. 2,500)
      const commaNumMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})+)/);
      if (commaNumMatch) {
        amount = parseInt(commaNumMatch[1].replace(/,/g, ''), 10) || 0;
        text = text.replace(commaNumMatch[0], ' ').trim();
      } else {
        // Case 4D: Last standalone integer >= 100
        const allNums = [...text.matchAll(/\b([0-9]{3,})\b/g)];
        if (allNums.length > 0) {
          const lastNum = allNums[allNums.length - 1];
          amount = parseInt(lastNum[1], 10) || 0;
          text = text.replace(lastNum[0], ' ').trim();
        }
      }
    }
  }

  // Clean name part: remove stray symbols, colons, brackets
  const cleanName = text
    .replace(/^[:\-•\*\s]+/, '')
    .replace(/[:\-•\*\s]+$/, '')
    .replace(/^\(|\)$/g, '')
    .trim();

  if (!cleanName && amount <= 0) return null;

  const finalName = cleanName || `품목 ${idx + 1}`;
  const finalUnitPrice = explicitUnitPrice !== undefined
    ? explicitUnitPrice
    : (quantity > 0 && amount > 0 ? Math.round(amount / quantity) : amount);

  return {
    id: `sub_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: finalName,
    amount,
    quantity,
    unitPrice: finalUnitPrice,
    category,
  };
}

/**
 * Parse sub-items from any text (memo string or dedicated '세부품목' column)
 * Supports both comma and non-comma numbers ("2,500원", "2500원", "2,500", "2500")
 * Supports bracketed ([세부품목: ...]) and unbracketed raw column formats.
 */
export function parseSubItemsFromMemo(memo?: string): SubItem[] {
  if (!memo) return [];
  const trimmed = memo.trim();
  if (!trimmed) return [];

  // Check JSON format first
  const jsonMatch = trimmed.match(/\[subItems:\s*(\[.*?\])\s*\]/);
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

  // Check bracketed format: [세부: ...] or [세부품목: ...] or [세부내역: ...]
  const bracketMatch = trimmed.match(/\[(?:세부|세부품목|세부내역):\s*([^\]]+)\]/i);
  const targetText = bracketMatch ? bracketMatch[1] : trimmed;

  // If text was not bracketed, check if it looks like sub-item content
  // (e.g. contains '|', newlines, or patterns like "X원", numbers with item names)
  if (!bracketMatch) {
    const hasPricePattern = /[0-9,]+\s*원|[0-9]{1,3}(?:,[0-9]{3})+|\b[0-9]{3,}\b/.test(targetText);
    const hasSeparator = /[|\n;]/.test(targetText);
    if (!hasPricePattern && !hasSeparator) {
      return [];
    }
  }

  // Split into individual item chunks by pipe, newline, semicolon, or comma
  // When comma is used, make sure not to split numbers like "2,500"
  const chunks = targetText
    .split(/(?:\||\n|;|(?:,\s*(?=[^0-9])))/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const items: SubItem[] = [];
  chunks.forEach((chunk, idx) => {
    const item = parseSingleSubItemChunk(chunk, idx);
    if (item && (item.amount > 0 || item.name)) {
      items.push(item);
    }
  });

  return items;
}

/**
 * Format sub-items for the dedicated Google Sheets [세부품목] column
 * Example output: "우유 2,500원 | 빵 3,000원 | 사과 2개 5,000원"
 */
export function formatSubItemsForColumn(subItems?: SubItem[]): string {
  if (!subItems || subItems.length === 0) return '';
  return subItems
    .filter((s) => s.name || (s.amount && s.amount > 0))
    .map((s) => {
      const catPart = s.category ? `(${s.category})` : '';
      const qtyPart = s.quantity && s.quantity > 1 ? ` ${s.quantity}개` : '';
      const amtPart = `${(s.amount || 0).toLocaleString('ko-KR')}원`;
      return `${s.name.trim()}${catPart ? ` ${catPart}` : ''}${qtyPart} ${amtPart}`.trim();
    })
    .join(' | ');
}

/**
 * Cleanly strip system tags ([정기예산], [특별지출], [세부품목: ...]) from memo string
 * Leaves only the user's authentic personal notes.
 */
export function stripTagsFromMemo(memo?: string): string {
  if (!memo) return '';
  return memo
    .replace(/\[(?:세부|세부품목|세부내역):[^\]]*\]/gi, '')
    .replace(/\[subItems:\s*\[.*?\]\s*\]/gi, '')
    .replace(/\[(?:정기예산|고정지출|정기지출)\]/gi, '')
    .replace(/\[(?:특별지출|비정기지출)\]/gi, '')
    .trim();
}

/**
 * Format sub-items into a concise string for Google Sheet memo (backward compatibility fallback)
 */
export function serializeSubItemsToMemo(
  baseMemo: string | undefined,
  subItems?: SubItem[]
): string {
  // Strip existing sub-item tags from base memo
  const cleanMemo = stripTagsFromMemo(baseMemo);

  if (!subItems || subItems.length === 0) {
    return cleanMemo;
  }

  const itemsSummary = formatSubItemsForColumn(subItems);
  const subTag = `[세부품목: ${itemsSummary}]`;
  return cleanMemo ? `${subTag} ${cleanMemo}` : subTag;
}

/**
 * Retrieve sub-items for a transaction from memo or storage.
 * Google Sheet row data is strictly authoritative: if a row from Google Sheets
 * does not have sub-items in its sub-items column or memo, it will NEVER borrow
 * sub-items from another row via shifted row indices or content signatures!
 */
export function getSubItemsForTransaction(
  tx: Transaction,
  cachedMap?: StoredSubItemsMap
): SubItem[] {
  // 1. Authoritative: already parsed from the Google Sheet subItems column
  if (tx.subItems && tx.subItems.length > 0) {
    return tx.subItems;
  }

  // 2. Authoritative: parse from transaction's own memo tag if present
  if (tx.memo) {
    const fromMemo = parseSubItemsFromMemo(tx.memo);
    if (fromMemo.length > 0) {
      return fromMemo;
    }
  }

  // 3. If loaded from Google Sheets (has sheetTitle and rowIndex), the row in Google Sheets
  // is the single source of truth. If it had no sub-items, do NOT copy from another row!
  if (tx.sheetTitle && tx.rowIndex && tx.rowIndex >= 2) {
    return [];
  }

  // 4. For local/pending unsynced transactions only, check local storage by ID
  const map = cachedMap || loadAllSubItems();
  if (tx.id && map[tx.id] && map[tx.id].length > 0) {
    return map[tx.id];
  }

  return [];
}

/**
 * Enrich transactions with saved or parsed sub-items
 */
export function enrichTransactionsWithSubItems(transactions: Transaction[]): Transaction[] {
  const map = loadAllSubItems();

  const enriched = transactions.map((tx) => {
    const subItems = getSubItemsForTransaction(tx, map);


    const isRecurring =
      tx.isRecurring !== undefined
        ? tx.isRecurring
        : Boolean(
            tx.memo &&
              (tx.memo.includes('[정기예산]') ||
                tx.memo.includes('[고정지출]') ||
                tx.memo.includes('[정기지출]'))
          );
    const isSpecial =
      tx.isSpecial !== undefined
        ? tx.isSpecial
        : Boolean(
            tx.memo &&
              (tx.memo.includes('[특별지출]') ||
                tx.memo.includes('[비정기지출]'))
          );
    const cleanMemo = stripTagsFromMemo(tx.memo);
    return {
      ...tx,
      memo: cleanMemo || undefined,
      subItems: subItems.length > 0 ? subItems : tx.subItems,
      isRecurring,
      isSpecial,
    };
  });

  return enriched;
}
