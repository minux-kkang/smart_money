export interface CategoryMonthlyData {
  category: string;
  annualTotal: number;
  monthly: number[]; // Index 0 = 1월, ..., Index 11 = 12월
}

export interface YearDashboardData {
  year: number;
  totalIncome: number;
  totalExpense: number;
  categories: CategoryMonthlyData[];
}

export const USER_2026_DATA: YearDashboardData = {
  year: 2026,
  totalIncome: 236119629,
  totalExpense: 134417104,
  categories: [
    { category: '식비', annualTotal: 2790578, monthly: [57500, 130000, 187500, 347920, 488970, 181750, 333800, 428833, 548355, 85950, 0, 0] },
    { category: '외식', annualTotal: 4159011, monthly: [19600, 60400, 414020, 705380, 610670, 536186, 638790, 557895, 495270, 120800, 0, 0] },
    { category: '간식', annualTotal: 2630180, monthly: [23500, 0, 129600, 383750, 292350, 384700, 382540, 413900, 448790, 171050, 0, 0] },
    { category: '생활용품', annualTotal: 23338161, monthly: [178220, 621142, 528040, 956740, 5320190, 6835160, 3918785, 1431340, 2596694, 951850, 0, 0] },
    { category: '의류/잡화', annualTotal: 917785, monthly: [0, 5800, 25900, 0, 319100, 90680, 476305, 0, 0, 0, 0, 0] },
    { category: '교육', annualTotal: 1950350, monthly: [70000, 168000, 587000, 494000, 139000, 167500, 94000, 181850, 49000, 0, 0, 0] },
    { category: '용돈', annualTotal: 3485160, monthly: [319200, 300000, 343200, 386400, 406800, 406360, 475600, 409800, 384800, 53000, 0, 0] },
    { category: '관리비_수도', annualTotal: 0, monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { category: '관리비_전기', annualTotal: 0, monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { category: '관리비_온수', annualTotal: 0, monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { category: '관리비_기타', annualTotal: 2671290, monthly: [0, 0, 456950, 351730, 304030, 294470, 313480, 384880, 565750, 0, 0, 0] },
    { category: '통신비', annualTotal: 1418838, monthly: [0, 0, 80290, 570940, 128840, 126160, 109420, 191158, 172430, 39600, 0, 0] },
    { category: '보험료', annualTotal: 4143573, monthly: [270237, 270237, 471787, 471377, 471377, 471377, 284827, 689597, 526327, 216430, 0, 0] },
    { category: '구독', annualTotal: 821305, monthly: [24040, 24040, 116230, 177973, 124049, 91670, 90040, 91083, 70530, 11650, 0, 0] },
    { category: '렌탈', annualTotal: 637294, monthly: [262094, 46900, 46900, 46900, 46900, 46900, 46900, 46900, 46900, 0, 0, 0] },
    { category: '교통비', annualTotal: 1394304, monthly: [125600, 134100, 223550, 36200, 77230, 114400, 113550, 96600, 407674, 65400, 0, 0] },
    { category: '자동차관리', annualTotal: 6413413, monthly: [92400, 7900, 77300, 169700, 108920, 455900, 1680134, 1883646, 1928533, 8980, 0, 0] },
    { category: '의료비', annualTotal: 2905820, monthly: [60800, 39120, 3400, 382000, 43250, 1533000, 605500, 43300, 195450, 0, 0, 0] },
    { category: '여행비', annualTotal: 24048573, monthly: [2284140, 288120, 0, 0, 1200, 0, 406940, 4896764, 16084020, 87389, 0, 0] },
    { category: '취미', annualTotal: 807700, monthly: [0, 28000, 32000, 309400, 85000, 199000, 104300, 45000, 5000, 0, 0, 0] },
    { category: '골프', annualTotal: 285800, monthly: [0, 0, 0, 231800, 54000, 0, 0, 0, 0, 0, 0, 0] },
    { category: '경조사', annualTotal: 50000, monthly: [0, 0, 0, 0, 50000, 0, 0, 0, 0, 0, 0, 0] },
    { category: '세금/공과금', annualTotal: 1180140, monthly: [309990, 650, 650, 610, 570, 670, 460870, 710, 404810, 610, 0, 0] },
    { category: '대출_원금', annualTotal: 45999837, monthly: [1948634, 1944420, 5313357, 4473772, 6346121, 7951386, 7375995, 5739189, 2847441, 2059522, 0, 0] },
    { category: '대출_이자', annualTotal: 2290992, monthly: [279560, 250415, 246171, 275350, 266138, 277218, 234863, 230000, 230000, 1277, 0, 0] },
    { category: '미용', annualTotal: 77000, monthly: [0, 21000, 38000, 0, 0, 18000, 0, 0, 0, 0, 0, 0] },
  ],
};

export const USER_CATEGORIES = USER_2026_DATA.categories.map((c) => c.category);

/**
 * Detailed real merchant descriptions mapped by category
 */
export const CATEGORY_SAMPLE_DESCRIPTIONS: Record<string, string[]> = {
  '식비': ['이마트 역삼점 장보기', '쿠팡 로켓프레시(계란/우유)', '동네 정육점 삼겹살', '홈플러스 익스프레스'],
  '외식': ['스타벅스 강남점', '배달의민족 교촌치킨', '동네 삼겹살 회식', '김밥천국 점심', '파리바게뜨 빵'],
  '간식': ['메가커피 아이스라떼', '배스킨라빈스 파인트', '올리브영 간식', '투썸플레이스 케이크'],
  '생활용품': ['다이소 생활용품', '쿠팡 롤화장지/세탁세제', '이케아 수납함', '모던하우스 침구'],
  '의류/잡화': ['유니클로 기본티셔츠', '무신사 봄신상 의류', '자라 봄자켓'],
  '교육': ['영어학원 정기 수강료', '어린이집 보육료', '교보문고 수험서'],
  '용돈': ['개인 체크카드 용돈', '월 정기 생활 용돈'],
  '관리비_기타': ['아파트 통합 관리비', '도시가스 난방요금'],
  '통신비': ['SKT 5G 스마트폰 요금', 'KT 인터넷/올레TV 결합'],
  '보험료': ['삼성화재 실손의료비보험', '현대해상 운전자보험', 'KB손해보험'],
  '구독': ['넷플릭스 프리미엄', '유튜브 프리미엄', '쿠팡 와우 멤버십', '스포티파이'],
  '렌탈': ['코웨이 정수기 렌탈', 'LG 퓨리케어 공기청정기'],
  '교통비': ['지하철/버스 티머니 교통카드', '카카오 T 택시', 'KTX 열차 승차권'],
  '자동차관리': ['GS칼텍스 주유소', '엔진오일 교체', '하이패스 통행료 충전', '자동차 보험/정기검사'],
  '의료비': ['이비인후과 진료 및 약국', '치과 정기 스케일링', '내과 감기약 처방'],
  '여행비': ['제주도 항공권 및 숙박', '호텔 뷔페/식사', '여행지 렌터카 및 주유'],
  '취미': ['알라딘 도서 구매', '클라이밍 1회권', '원데이 클래스'],
  '골프': ['스크린골프 라운딩', '골프 연습장 정기권'],
  '경조사': ['지인 결혼식 축의금', '가족 생신 선물'],
  '세금/공과금': ['자동차세 정기분', '주민세 납부', '재산세 납부'],
  '대출_원금': ['주택담보대출 원금 자동이체'],
  '대출_이자': ['주택담보대출 이자 자동이체'],
  '미용': ['준오헤어 컷트/펌', '동네 미용실 클리닉'],
};

/**
 * Generate rich, realistic granular monthly transactions (40~55 daily receipt rows)
 * based on the user's category breakdown and realistic daily expenditures
 */
export function generateUserMonthlyTransactions(monthIndex: number): any[] {
  const monthNum = monthIndex + 1;
  const monthStr = `${monthNum}월`;
  const mPrefix = `2026-${String(monthNum).padStart(2, '0')}`;
  const result: any[] = [];
  let rowId = 2;

  // 1. Regular Monthly Income
  result.push({
    id: `user-inc-${monthNum}-1`,
    date: `${mPrefix}-05`,
    type: 'income',
    category: '급여',
    description: `${monthNum}월 정기 급여 입금`,
    amount: 3850000,
    paymentMethod: '국민은행',
    memo: '회사 급여 이체',
    rowIndex: rowId++,
    sheetTitle: monthStr,
  });

  if (monthIndex % 3 === 0) {
    result.push({
      id: `user-inc-${monthNum}-2`,
      date: `${mPrefix}-18`,
      type: 'income',
      category: '기타수입',
      description: '중고물품 당근 거래',
      amount: 45000,
      paymentMethod: '현금',
      memo: '생활용품 정리',
      rowIndex: rowId++,
      sheetTitle: monthStr,
    });
  }

  // 2. Granular Daily Expenses for each category
  USER_2026_DATA.categories.forEach((cat) => {
    const totalAmt = cat.monthly[monthIndex];
    if (totalAmt <= 0) return;

    const samples = CATEGORY_SAMPLE_DESCRIPTIONS[cat.category] || [`${cat.category} 지출`];

    // Determine how many itemized transactions to break this category into
    let pieces = 1;
    if (['식비', '외식', '간식'].includes(cat.category)) {
      pieces = Math.min(Math.max(Math.round(totalAmt / 35000), 3), 7);
    } else if (['생활용품'].includes(cat.category)) {
      pieces = Math.min(Math.max(Math.round(totalAmt / 150000), 2), 5);
    } else if (['교통비', '자동차관리'].includes(cat.category)) {
      pieces = Math.min(Math.max(Math.round(totalAmt / 40000), 2), 4);
    } else if (['의료비', '취미', '의류/잡화'].includes(cat.category)) {
      pieces = Math.min(Math.max(Math.round(totalAmt / 60000), 1), 3);
    }

    // Distribute amounts across pieces
    let remaining = totalAmt;
    for (let p = 0; p < pieces; p++) {
      const isLast = p === pieces - 1;
      let pieceAmt: number;

      if (isLast) {
        pieceAmt = remaining;
      } else {
        const avg = Math.round(remaining / (pieces - p));
        // Add natural variation (+/- 25%)
        const factor = 0.75 + ((p * 17) % 50) / 100;
        pieceAmt = Math.min(Math.max(Math.round(avg * factor), 1000), remaining - 1000 * (pieces - p - 1));
        remaining -= pieceAmt;
      }

      if (pieceAmt <= 0) continue;

      // Calculate realistic day of the month (1 ~ 28)
      const day = Math.min(Math.max(Math.floor((p + 1) * (26 / pieces)) + (cat.category.length % 3), 1), 28);
      const dayStr = String(day).padStart(2, '0');
      const desc = samples[(p + monthIndex) % samples.length];

      let payment = '현대카드';
      if (
        cat.category.includes('대출') ||
        cat.category.includes('보험') ||
        cat.category.includes('관리비') ||
        cat.category.includes('통신비') ||
        cat.category.includes('렌탈')
      ) {
        payment = '자동이체';
      } else if (cat.category === '용돈') {
        payment = '계좌이체';
      } else if (['식비', '외식', '간식'].includes(cat.category)) {
        payment = p % 2 === 0 ? '신한카드' : '네이버페이';
      } else if (['교통비'].includes(cat.category)) {
        payment = p % 2 === 0 ? '티머니' : '카카오페이';
      }

      let subItems: any[] | undefined = undefined;
      if (desc.includes('쿠팡 로켓프레시') && pieceAmt >= 20000) {
        const item1 = 8900;
        const item2 = 6450;
        const remainingItem = Math.max(pieceAmt - (item1 + item2), 1000);
        subItems = [
          { id: `sub-${monthNum}-${p}-1`, name: '무항생제 신선란 30구', amount: item1, category: '식비' },
          { id: `sub-${monthNum}-${p}-2`, name: '서울우유 2.3L', amount: item2, category: '식비' },
          { id: `sub-${monthNum}-${p}-3`, name: '제주 삼다수 2L 6병', amount: remainingItem, category: '식비' },
        ];
      } else if (desc.includes('쿠팡 롤화장지/세탁세제') && pieceAmt >= 25000) {
        const item1 = Math.round(pieceAmt * 0.55);
        const item2 = pieceAmt - item1;
        subItems = [
          { id: `sub-${monthNum}-${p}-1`, name: '크리넥스 3겹 화장지 30롤', amount: item1, category: '생활용품' },
          { id: `sub-${monthNum}-${p}-2`, name: '퍼실 딥클린 세탁세제 2.7L', amount: item2, category: '생활용품' },
        ];
      } else if (desc.includes('이마트') && pieceAmt >= 30000) {
        const item1 = Math.round(pieceAmt * 0.5);
        const item2 = Math.round(pieceAmt * 0.3);
        const item3 = pieceAmt - item1 - item2;
        subItems = [
          { id: `sub-${monthNum}-${p}-1`, name: '한우 등심 300g', amount: item1, category: '식비' },
          { id: `sub-${monthNum}-${p}-2`, name: '신선 채소 및 양파', amount: item2, category: '식비' },
          { id: `sub-${monthNum}-${p}-3`, name: '신라면 5개입 멀티팩', amount: item3, category: '간식' },
        ];
      }

      result.push({
        id: `user-2026-${monthNum}-${cat.category}-${p}`,
        date: `${mPrefix}-${dayStr}`,
        type: 'expense',
        category: cat.category,
        description: desc,
        amount: pieceAmt,
        paymentMethod: payment,
        memo: subItems
          ? `[세부품목: ${subItems.map((s) => `${s.name} ${s.amount.toLocaleString()}원`).join(' | ')}]`
          : `${monthStr} ${cat.category} 세부 지출`,
        rowIndex: rowId++,
        sheetTitle: monthStr,
        subItems,
        createdAt: 1000 + rowId,
      });
    }
  });

  // Sort descending by date, with later entries on top when dates are equal
  return result.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return (b.createdAt ?? b.rowIndex ?? 0) - (a.createdAt ?? a.rowIndex ?? 0);
  });
}

/**
 * Generate complete full-year granular transactions (1월 ~ 12월)
 * Ensures 1월 ~ 9월 are never lost or wiped out when viewing 10월
 */
export function generateUserAllTransactions(): any[] {
  const all: any[] = [];
  for (let m = 0; m < 12; m++) {
    const mTx = generateUserMonthlyTransactions(m);
    all.push(...mTx);
  }
  return all.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return (b.createdAt ?? b.rowIndex ?? 0) - (a.createdAt ?? a.rowIndex ?? 0);
  });
}


