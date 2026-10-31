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
 * Create a new household budget Google Sheet in Drive
 */
export async function createHouseholdSpreadsheet(
  title: string,
  accessToken: string
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const currentMonth = new Date().getMonth() + 1;
  const initialSheets = [];

  // Generate 12 months tabs: "1월", "2월", ... "12월"
  for (let m = 1; m <= 12; m++) {
    initialSheets.push({
      properties: {
        title: `${m}월`,
        gridProperties: {
          rowCount: 200,
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
                { userEnteredValue: { stringValue: '내용' } },
                { userEnteredValue: { stringValue: '금액' } },
                { userEnteredValue: { stringValue: '결제수단' } },
                { userEnteredValue: { stringValue: '메모' } },
              ],
            },
          ],
        },
      ],
    });
  }

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title,
      },
      sheets: initialSheets,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || '새 가계부 스프레드시트 생성 실패');
  }

  const data = await res.json();
  return {
    id: data.spreadsheetId,
    name: data.properties?.title || title,
    webViewLink: data.spreadsheetUrl,
  };
}
