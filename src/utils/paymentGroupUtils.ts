import { PaymentMethodGroup, PaymentGroupBadgeInfo, PaymentMethodItem } from '../types/ledger';

export const ALL_PAYMENT_GROUPS: Array<{
  group: PaymentMethodGroup;
  char: '신' | '체' | '현' | '페' | '포';
  label: string;
  desc: string;
  colorClass: string;
  dotColor: string;
}> = [
  {
    group: '신용카드',
    char: '신',
    label: '신용카드',
    desc: '현대카드, 삼성카드, KB국민카드, 신한카드 등 신용카드',
    colorClass: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    dotColor: '#2563EB',
  },
  {
    group: '체크카드',
    char: '체',
    label: '체크카드',
    desc: '신한카드_체크, 국민체크, 토스체크 등 체크/직불카드',
    colorClass: 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200',
    dotColor: '#0891B2',
  },
  {
    group: '현금',
    char: '현',
    label: '현금/이체',
    desc: '현금, 계좌이체, 자동이체, 무통장입금 등',
    colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200',
    dotColor: '#059669',
  },
  {
    group: '페이',
    char: '페',
    label: '페이/간편결제',
    desc: '네이버페이, 카카오페이, 토스페이, 애플페이, 삼성페이 등',
    colorClass: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
    dotColor: '#9333EA',
  },
  {
    group: '포인트',
    char: '포',
    label: '포인트/상품권',
    desc: '네이버포인트, 해피머니, 도서상품권, 캐시, 머니, 마일리지 등',
    colorClass: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
    dotColor: '#D97706',
  },
];

// Global registry for user-defined payment methods (e.g. from Google Sheet '분류설정')
const registeredMethodMap = new Map<string, PaymentMethodGroup>();

export function registerPaymentMethods(methods?: PaymentMethodItem[]): void {
  if (!methods || !Array.isArray(methods)) return;
  methods.forEach((m) => {
    if (m && m.name && m.group && m.group !== '기타') {
      registeredMethodMap.set(m.name.trim().toLowerCase(), m.group);
    }
  });
}

/**
 * Clean payment method name by removing classification brackets/parentheses like (신), [체]
 */
export function cleanPaymentMethodName(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^\[(신|체|현|페|포|신용카드|체크카드|현금|페이|포인트)\]\s*/i, '')
    .replace(/\s*[\(\[]\s*(신|체|현|페|포|신용카드|체크카드|현금|페이|포인트|신용|체크)\s*[\)\]]$/i, '')
    .trim();
}

/**
 * Automatically determine the high-level payment group from payment method name
 * Checks: 1) explicitGroup, 2) registered sheet classification, 3) explicit suffix/prefix, 4) keywords
 */
export function getPaymentMethodGroup(
  name?: string,
  explicitGroup?: PaymentMethodGroup
): PaymentMethodGroup | undefined {
  if (explicitGroup && explicitGroup !== '기타') return explicitGroup;
  if (!name || !name.trim() || name.trim() === '-') return undefined;

  const trimmed = name.trim();
  const clean = trimmed.toLowerCase();

  // 1. Check user-registered classification from Google Sheet or Category Management
  const registered = registeredMethodMap.get(clean);
  if (registered) return registered;

  // 2. Check explicit bracket/parenthesis notation e.g. [신] 현대카드, 현대카드(신), 현대카드[신]
  if (
    clean.startsWith('[신]') ||
    clean.startsWith('[신용]') ||
    /\s*[\(\[]\s*(신|신용|신용카드)\s*[\)\]]$/i.test(trimmed)
  ) {
    return '신용카드';
  }
  if (
    clean.startsWith('[체]') ||
    clean.startsWith('[체크]') ||
    /\s*[\(\[]\s*(체|체크|체크카드)\s*[\)\]]$/i.test(trimmed)
  ) {
    return '체크카드';
  }
  if (
    clean.startsWith('[현]') ||
    clean.startsWith('[현금]') ||
    /\s*[\(\[]\s*(현|현금|이체|계좌)\s*[\)\]]$/i.test(trimmed)
  ) {
    return '현금';
  }
  if (
    clean.startsWith('[페]') ||
    clean.startsWith('[페이]') ||
    /\s*[\(\[]\s*(페|페이|간편결제)\s*[\)\]]$/i.test(trimmed)
  ) {
    return '페이';
  }
  if (
    clean.startsWith('[포]') ||
    clean.startsWith('[포인트]') ||
    /\s*[\(\[]\s*(포|포인트|상품권|머니|캐시)\s*[\)\]]$/i.test(trimmed)
  ) {
    return '포인트';
  }

  // 3. Keyword matching: Debit / Check Card (higher precedence than generic '카드')
  if (clean.includes('체크') || clean.includes('check') || clean.includes('직불')) {
    return '체크카드';
  }

  // 4. Keyword matching: Pay / Simple Payment
  if (
    clean.includes('페이') ||
    clean.includes('pay') ||
    clean.includes('토스') ||
    clean.includes('toss') ||
    clean.includes('카카오') ||
    clean.includes('네이버') ||
    clean.includes('애플') ||
    clean.includes('apple') ||
    clean.includes('삼성페이') ||
    clean.includes('제로페이') ||
    clean.includes('페이코') ||
    clean.includes('payco')
  ) {
    return '페이';
  }

  // 5. Keyword matching: Points / Gift Vouchers / Cash / Money
  if (
    clean.includes('포인트') ||
    clean.includes('point') ||
    clean.includes('상품권') ||
    clean.includes('머니') ||
    clean.includes('캐시') ||
    clean.includes('쿠폰') ||
    clean.includes('마일리지') ||
    clean.includes('해피머니') ||
    clean.includes('문화상품권') ||
    clean.includes('도서문화')
  ) {
    return '포인트';
  }

  // 6. Keyword matching: Cash / Account Transfer / Auto Debit
  if (
    clean.includes('현금') ||
    clean.includes('cash') ||
    clean.includes('이체') ||
    clean.includes('계좌') ||
    clean.includes('무통장') ||
    clean.includes('자동이체') ||
    clean.includes('통장') ||
    clean.includes('출금') ||
    clean.includes('입금')
  ) {
    return '현금';
  }

  // 7. Keyword matching: Credit Card / Banks / Card companies
  if (
    clean.includes('신용') ||
    clean.includes('credit') ||
    clean.includes('카드') ||
    clean.includes('card') ||
    clean.includes('현대') ||
    clean.includes('삼성') ||
    clean.includes('국민') ||
    clean.includes('kb') ||
    clean.includes('신한') ||
    clean.includes('롯데') ||
    clean.includes('비씨') ||
    clean.includes('bc') ||
    clean.includes('하나') ||
    clean.includes('우리') ||
    clean.includes('농협') ||
    clean.includes('nh') ||
    clean.includes('씨티') ||
    clean.includes('기업') ||
    clean.includes('ibk')
  ) {
    return '신용카드';
  }

  return undefined;
}

/**
 * Returns single-character badge metadata for a payment method ([신], [체], [현], [페], [포])
 * If unmatched or unknown, returns null so no weird '(기)' badge appears!
 */
export function getPaymentGroupBadge(
  name?: string,
  explicitGroup?: PaymentMethodGroup
): PaymentGroupBadgeInfo | null {
  if (!name || !name.trim() || name.trim() === '-') return null;

  const group = getPaymentMethodGroup(name, explicitGroup);
  if (!group || group === '기타') return null;

  switch (group) {
    case '신용카드':
      return {
        group,
        char: '신',
        label: '신용카드',
        colorClass: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
        badgeBg: 'bg-blue-100',
        badgeText: 'text-blue-800',
        badgeBorder: 'border-blue-300',
      };
    case '체크카드':
      return {
        group,
        char: '체',
        label: '체크카드',
        colorClass: 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200',
        badgeBg: 'bg-cyan-100',
        badgeText: 'text-cyan-800',
        badgeBorder: 'border-cyan-300',
      };
    case '현금':
      return {
        group,
        char: '현',
        label: '현금/이체',
        colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200',
        badgeBg: 'bg-emerald-100',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-300',
      };
    case '페이':
      return {
        group,
        char: '페',
        label: '페이/간편결제',
        colorClass: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
        badgeBg: 'bg-purple-100',
        badgeText: 'text-purple-800',
        badgeBorder: 'border-purple-300',
      };
    case '포인트':
      return {
        group,
        char: '포',
        label: '포인트/상품권',
        colorClass: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
        badgeBg: 'bg-amber-100',
        badgeText: 'text-amber-800',
        badgeBorder: 'border-amber-300',
      };
    default:
      return null;
  }
}
