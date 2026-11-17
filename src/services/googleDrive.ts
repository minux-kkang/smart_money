import { SpreadsheetFile } from '../types/ledger';

/**
 * List spreadsheet files from Google Drive
 */
export async function listSpreadsheets(
  accessToken: string,
  searchQuery: string = ''
): Promise<SpreadsheetFile[]> {
  try {
    let q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    if (searchQuery.trim()) {
      // Escape single quotes in search query
      const sanitized = searchQuery.replace(/'/g, "\\'");
      q += ` and name contains '${sanitized}'`;
    }

    const params = new URLSearchParams({
      q,
      fields: 'files(id, name, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: '30',
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error?.message || `Google Drive 요청 실패 (${res.status})`);
    }

    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
    }));
  } catch (error) {
    console.error('Failed to list spreadsheets:', error);
    throw error;
  }
}

/**
 * Create a new perpetual multi-year household budget Google Sheet in Drive
 */
export async function createHouseholdSpreadsheet(
  title: string,
  accessToken: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const currentYear = new Date().getFullYear();
  const yearTabTitle = String(currentYear);

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title.trim() || '스마트 만년 가계부',
      },
      sheets: [
        {
          properties: {
            title: '📊 연도별 요약',
            gridProperties: {
              rowCount: 80,
              columnCount: 12,
              frozenRowCount: 3,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                { values: [{ userEnteredValue: { stringValue: '📊 스마트 만년 가계부 — 연도별 종합 요약' } }] },
                { values: [{ userEnteredValue: { stringValue: '※ 각 연도 탭([2026], [2027] 등)의 데이터가 변경되면 아래 수식이 실시간 자동 계산됩니다.' } }] },
                {
                  values: [
                    { userEnteredValue: { stringValue: '연도' } },
                    { userEnteredValue: { stringValue: '연도 탭' } },
                    { userEnteredValue: { stringValue: '총 수입' } },
                    { userEnteredValue: { stringValue: '총 지출' } },
                    { userEnteredValue: { stringValue: '순수지 (수입-지출)' } },
                    { userEnteredValue: { stringValue: '고정지출 (정)' } },
                    { userEnteredValue: { stringValue: '특별지출 (특)' } },
                    { userEnteredValue: { stringValue: '거래 건수' } },
                  ],
                },
                {
                  values: [
                    { userEnteredValue: { stringValue: `${currentYear}년` } },
                    { userEnteredValue: { stringValue: yearTabTitle } },
                    { userEnteredValue: { formulaValue: `=SUMIF('${yearTabTitle}'!B:B,"수입",'${yearTabTitle}'!E:E)` } },
                    { userEnteredValue: { formulaValue: `=SUMIF('${yearTabTitle}'!B:B,"지출",'${yearTabTitle}'!E:E)` } },
                    { userEnteredValue: { formulaValue: '=C4-D4' } },
                    { userEnteredValue: { formulaValue: `=SUMIFS('${yearTabTitle}'!E:E,'${yearTabTitle}'!B:B,"지출",'${yearTabTitle}'!G:G,"정")` } },
                    { userEnteredValue: { formulaValue: `=SUMIFS('${yearTabTitle}'!E:E,'${yearTabTitle}'!B:B,"지출",'${yearTabTitle}'!G:G,"특")` } },
                    { userEnteredValue: { formulaValue: `=MAX(0,COUNTA('${yearTabTitle}'!A:A)-1)` } },
                  ],
                },
              ],
            },
          ],
        },
        {
          properties: {
            title: yearTabTitle,
            gridProperties: {
              rowCount: 1000,
              columnCount: 10,
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: '날짜' } },
                    { userEnteredValue: { stringValue: '구분' } },
                    { userEnteredValue: { stringValue: '분류' } },
                    { userEnteredValue: { stringValue: '내용/사용처' } },
                    { userEnteredValue: { stringValue: '금액' } },
                    { userEnteredValue: { stringValue: '결제수단' } },
                    { userEnteredValue: { stringValue: '지출유형' } },
                    { userEnteredValue: { stringValue: '세부품목' } },
                    { userEnteredValue: { stringValue: '비고' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          properties: {
            title: '⚙️ 분류설정',
            gridProperties: {
              rowCount: 120,
              columnCount: 6,
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: '지출 카테고리' } },
                    { userEnteredValue: { stringValue: '수입 카테고리' } },
                    { userEnteredValue: { stringValue: '이체 카테고리' } },
                    { userEnteredValue: { stringValue: '결제 수단' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || '새 만년 가계부 스프레드시트 생성 실패');
  }

  const data = await res.json();
  return {
    id: data.spreadsheetId,
    name: data.properties?.title || title,
    webViewLink: data.spreadsheetUrl,
  };
}
