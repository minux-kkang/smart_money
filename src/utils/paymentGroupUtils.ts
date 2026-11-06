import { PaymentMethodGroup, PaymentGroupBadgeInfo } from '../types/ledger';

export const ALL_PAYMENT_GROUPS: Array<{
  group: PaymentMethodGroup;
  char: '신' | '체' | '현' | '페' | '기';
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
    group: '기타',
    char: '기',
    label: '기타/포인트',
    desc: '상품권, 포인트, 머니, 기타 결제 수단',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200',
    dotColor: '#64748B',
  },
];

/**
 * Automatically determine the high-level payment group from payment method name
 */
export function getPaymentMethodGroup(
  name?: string,
  explicitGroup?: PaymentMethodGroup
): PaymentMethodGroup {
  if (explicitGroup) return explicitGroup;
  if (!name || !name.trim()) return '기타';

  const clean = name.trim().toLowerCase();

  // 1. Check for Debit / Check Card first (takes precedence over generic '카드')
  if (clean.includes('체크') || clean.includes('check')) {
    return '체크카드';
  }

  // 2. Check for Pay / Simple Payment
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

  // 3. Check for Cash / Account Transfer / Auto Debit
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

  // 4. Check for Credit Card / Banks / Card companies
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

  return '기타';
}

/**
 * Returns single-character badge metadata for a payment method
 */
export function getPaymentGroupBadge(
  name?: string,
  explicitGroup?: PaymentMethodGroup
): PaymentGroupBadgeInfo | null {
  if (!name || !name.trim() || name.trim() === '-') return null;

  const group = getPaymentMethodGroup(name, explicitGroup);

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
    default:
      return {
        group: '기타',
        char: '기',
        label: '기타결제',
        colorClass: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200',
        badgeBg: 'bg-slate-100',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-300',
      };
  }
}
