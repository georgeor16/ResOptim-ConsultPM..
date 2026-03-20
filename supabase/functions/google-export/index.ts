/**
 * google-export Edge Function
 *
 * Creates or updates a Google Slides presentation or Google Docs document
 * with the exported Gantt chart image and allocation data table.
 *
 * Request body (JSON):
 *   format       — 'google_slides' | 'google_docs'
 *   imageBase64  — base64-encoded PNG of the Gantt chart
 *   tableData    — array of { member, project, fte, period } rows
 *   title        — document/presentation title (used when creating new)
 *   periodLabel  — human-readable period string for the slide/doc header
 *   existingId   — optional; if set, appends to this file instead of creating new
 *
 * Returns:
 *   { url, id }  — URL to open the created/updated file
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_OAUTH_FUNCTION_URL  — URL of the google-oauth function (for refresh)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface TableRow {
  member: string;
  project: string;
  fte: string;
  period: string;
}

interface ExportRequest {
  format: 'google_slides' | 'google_docs';
  imageBase64: string;
  tableData: TableRow[];
  title: string;
  periodLabel: string;
  existingId?: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

async function getValidAccessToken(
  userId: string,
  adminSupabase: ReturnType<typeof createClient>,
  authHeader: string
): Promise<string | null> {
  const { data: row } = await adminSupabase
    .from('user_google_tokens')
    .select('access_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (!row) return null;

  // If token expires within 60 seconds, refresh
  if (new Date(row.expires_at).getTime() - Date.now() < 60_000) {
    const oauthFnUrl = Deno.env.get('GOOGLE_OAUTH_FUNCTION_URL');
    if (!oauthFnUrl) return null;
    const refreshRes = await fetch(`${oauthFnUrl}?action=refresh`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    });
    if (!refreshRes.ok) return null;

    // Re-fetch after refresh
    const { data: fresh } = await adminSupabase
      .from('user_google_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single();
    return fresh?.access_token ?? null;
  }

  return row.access_token;
}

// ── Slides helpers ────────────────────────────────────────────────────────────

async function createSlidesPresentation(
  accessToken: string,
  title: string,
  imageBase64: string,
  tableData: TableRow[],
  periodLabel: string
): Promise<{ id: string; url: string }> {
  const SLIDES_API = 'https://slides.googleapis.com/v1/presentations';
  const DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files';

  // 1. Upload image to Drive so Slides can reference it by URL
  const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  const uploadRes = await fetch(`${DRIVE_API}?uploadType=media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'image/png',
    },
    body: imageBytes,
  });
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  const driveFile = await uploadRes.json() as { id: string };

  // Make image publicly readable so Slides can fetch it
  await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  const imageUrl = `https://drive.google.com/uc?id=${driveFile.id}`;

  // 2. Create blank presentation
  const createRes = await fetch(SLIDES_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) throw new Error(`Slides create failed: ${await createRes.text()}`);
  const presentation = await createRes.json() as { presentationId: string; slides: Array<{ objectId: string }> };
  const presentationId = presentation.presentationId;
  const slideId = presentation.slides[0].objectId;

  // 3. Build batchUpdate requests: title text, chart image, allocation table
  const titleBoxId = 'title_box';
  const imageId = 'gantt_image';
  const tableId = 'alloc_table';
  const cols = 4;
  const rows = Math.min(tableData.length + 1, 20); // header + up to 19 data rows

  const requests = [
    // Title text box
    {
      createShape: {
        objectId: titleBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slideId,
          size: { height: { magnitude: 1200000, unit: 'EMU' }, width: { magnitude: 8000000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 600000, translateY: 400000, unit: 'EMU' },
        },
      },
    },
    {
      insertText: { objectId: titleBoxId, text: `${title}\n${periodLabel}` },
    },
    // Gantt chart image
    {
      createImage: {
        objectId: imageId,
        url: imageUrl,
        elementProperties: {
          pageObjectId: slideId,
          size: { height: { magnitude: 2700000, unit: 'EMU' }, width: { magnitude: 8400000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 300000, translateY: 1700000, unit: 'EMU' },
        },
      },
    },
    // Allocation table (if there's data)
    ...(tableData.length > 0 ? [{
      createTable: {
        objectId: tableId,
        elementProperties: {
          pageObjectId: slideId,
          size: { height: { magnitude: 1500000, unit: 'EMU' }, width: { magnitude: 8400000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 300000, translateY: 4500000, unit: 'EMU' },
        },
        rows,
        columns: cols,
      },
    }] : []),
  ];

  const batchRes = await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) throw new Error(`Slides batchUpdate failed: ${await batchRes.text()}`);

  // 4. Fill table cells with header + data rows
  if (tableData.length > 0) {
    const headers = ['Member', 'Project', 'FTE %', 'Period'];
    const cellRequests: unknown[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const text = r === 0
          ? headers[c]
          : (Object.values(tableData[r - 1])[c] as string) ?? '';
        cellRequests.push({
          insertText: {
            objectId: tableId,
            cellLocation: { rowIndex: r, columnIndex: c },
            text,
            insertionIndex: 0,
          },
        });
      }
    }
    await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: cellRequests }),
    });
  }

  return {
    id: presentationId,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

async function appendToSlides(
  accessToken: string,
  presentationId: string,
  imageBase64: string,
  tableData: TableRow[],
  title: string,
  periodLabel: string
): Promise<{ id: string; url: string }> {
  const SLIDES_API = 'https://slides.googleapis.com/v1/presentations';
  const DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files';

  // Upload image
  const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  const uploadRes = await fetch(`${DRIVE_API}?uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
    body: imageBytes,
  });
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  const driveFile = await uploadRes.json() as { id: string };
  await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  const imageUrl = `https://drive.google.com/uc?id=${driveFile.id}`;

  // Add a new slide at the end
  const newSlideId = `slide_${Date.now()}`;
  const addSlideRes = await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ createSlide: { objectId: newSlideId, slideLayoutReference: { predefinedLayout: 'BLANK' } } }],
    }),
  });
  if (!addSlideRes.ok) throw new Error(`Add slide failed: ${await addSlideRes.text()}`);

  const titleBoxId = `tb_${Date.now()}`;
  const imageId = `img_${Date.now()}`;

  const requests = [
    {
      createShape: {
        objectId: titleBoxId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: newSlideId,
          size: { height: { magnitude: 1200000, unit: 'EMU' }, width: { magnitude: 8000000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 600000, translateY: 400000, unit: 'EMU' },
        },
      },
    },
    { insertText: { objectId: titleBoxId, text: `${title}\n${periodLabel}` } },
    {
      createImage: {
        objectId: imageId,
        url: imageUrl,
        elementProperties: {
          pageObjectId: newSlideId,
          size: { height: { magnitude: 2700000, unit: 'EMU' }, width: { magnitude: 8400000, unit: 'EMU' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 300000, translateY: 1700000, unit: 'EMU' },
        },
      },
    },
  ];

  await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (tableData.length > 0) {
    const tableObjId = `tbl_${Date.now()}`;
    const cols = 4;
    const rows = Math.min(tableData.length + 1, 20);
    await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          createTable: {
            objectId: tableObjId,
            elementProperties: {
              pageObjectId: newSlideId,
              size: { height: { magnitude: 1500000, unit: 'EMU' }, width: { magnitude: 8400000, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 300000, translateY: 4500000, unit: 'EMU' },
            },
            rows,
            columns: cols,
          },
        }],
      }),
    });

    const headers = ['Member', 'Project', 'FTE %', 'Period'];
    const cellReqs: unknown[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const text = r === 0
          ? headers[c]
          : (Object.values(tableData[r - 1])[c] as string) ?? '';
        cellReqs.push({
          insertText: {
            objectId: tableObjId,
            cellLocation: { rowIndex: r, columnIndex: c },
            text,
            insertionIndex: 0,
          },
        });
      }
    }
    await fetch(`${SLIDES_API}/${presentationId}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: cellReqs }),
    });
  }

  return {
    id: presentationId,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

// ── Docs helpers ──────────────────────────────────────────────────────────────

async function createDocsDocument(
  accessToken: string,
  title: string,
  imageBase64: string,
  tableData: TableRow[],
  periodLabel: string
): Promise<{ id: string; url: string }> {
  const DOCS_API = 'https://docs.googleapis.com/v1/documents';
  const DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files';

  // 1. Upload image to Drive
  const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  const uploadRes = await fetch(`${DRIVE_API}?uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
    body: imageBytes,
  });
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  const driveFile = await uploadRes.json() as { id: string };
  await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  // 2. Create the document
  const createRes = await fetch(DOCS_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) throw new Error(`Docs create failed: ${await createRes.text()}`);
  const doc = await createRes.json() as { documentId: string };
  const documentId = doc.documentId;

  // 3. Build batchUpdate: heading, period label, inline image, table
  const cols = 4;
  const dataRows = Math.min(tableData.length, 19);
  const totalRows = dataRows + 1; // header row

  const requests: unknown[] = [
    // Insert heading
    { insertText: { location: { index: 1 }, text: `${title}\n` } },
    {
      updateParagraphStyle: {
        range: { startIndex: 1, endIndex: title.length + 1 },
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
      },
    },
    // Period label
    { insertText: { location: { index: title.length + 2 }, text: `${periodLabel}\n\n` } },
    // Inline image
    {
      insertInlineImage: {
        location: { index: title.length + 2 + periodLabel.length + 3 },
        uri: `https://drive.google.com/uc?id=${driveFile.id}`,
        objectSize: {
          height: { magnitude: 200, unit: 'PT' },
          width: { magnitude: 480, unit: 'PT' },
        },
      },
    },
    // Newline after image
    { insertText: { location: { index: title.length + 2 + periodLabel.length + 4 }, text: '\n\n' } },
  ];

  // Table (if data present)
  if (tableData.length > 0) {
    const tableInsertIndex = title.length + 2 + periodLabel.length + 6;
    requests.push({
      insertTable: {
        rows: totalRows,
        columns: cols,
        location: { index: tableInsertIndex },
      },
    });
  }

  const batchRes = await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) throw new Error(`Docs batchUpdate failed: ${await batchRes.text()}`);

  // 4. Fill table cells — fetch updated doc to get cell indices
  if (tableData.length > 0) {
    const docRes = await fetch(`${DOCS_API}/${documentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const docContent = await docRes.json() as {
      body: { content: Array<{ table?: { tableRows: Array<{ tableCells: Array<{ content: Array<{ startIndex: number }> }> }> } }> }
    };

    const tableElement = docContent.body.content.find(e => e.table);
    const headers = ['Member', 'Project', 'FTE %', 'Period'];
    if (tableElement?.table) {
      const cellRequests: unknown[] = [];
      tableElement.table.tableRows.forEach((row, rIdx) => {
        row.tableCells.forEach((cell, cIdx) => {
          const cellIndex = cell.content[0]?.startIndex;
          if (cellIndex === undefined) return;
          const text = rIdx === 0
            ? headers[cIdx]
            : (Object.values(tableData[rIdx - 1])[cIdx] as string) ?? '';
          if (text) {
            cellRequests.push({ insertText: { location: { index: cellIndex }, text } });
          }
        });
      });
      if (cellRequests.length > 0) {
        await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: cellRequests }),
        });
      }
    }
  }

  return {
    id: documentId,
    url: `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

async function appendToDocs(
  accessToken: string,
  documentId: string,
  imageBase64: string,
  tableData: TableRow[],
  title: string,
  periodLabel: string
): Promise<{ id: string; url: string }> {
  const DOCS_API = 'https://docs.googleapis.com/v1/documents';
  const DRIVE_API = 'https://www.googleapis.com/upload/drive/v3/files';

  // Fetch current doc to find end index
  const docRes = await fetch(`${DOCS_API}/${documentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!docRes.ok) throw new Error(`Docs fetch failed: ${await docRes.text()}`);
  const docContent = await docRes.json() as { body: { content: Array<{ endIndex?: number }> } };
  const endIndex = docContent.body.content.reduce((max, el) => Math.max(max, el.endIndex ?? 0), 0) - 1;

  // Upload image
  const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
  const uploadRes = await fetch(`${DRIVE_API}?uploadType=media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/png' },
    body: imageBytes,
  });
  if (!uploadRes.ok) throw new Error(`Drive upload failed: ${await uploadRes.text()}`);
  const driveFile = await uploadRes.json() as { id: string };
  await fetch(`https://www.googleapis.com/drive/v3/files/${driveFile.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  const separator = `\n\n${title}\n${periodLabel}\n\n`;
  const requests: unknown[] = [
    { insertText: { location: { index: endIndex }, text: separator } },
    {
      insertInlineImage: {
        location: { index: endIndex + separator.length },
        uri: `https://drive.google.com/uc?id=${driveFile.id}`,
        objectSize: { height: { magnitude: 200, unit: 'PT' }, width: { magnitude: 480, unit: 'PT' } },
      },
    },
    { insertText: { location: { index: endIndex + separator.length + 1 }, text: '\n\n' } },
  ];

  if (tableData.length > 0) {
    const cols = 4;
    const rows = Math.min(tableData.length + 1, 20);
    requests.push({
      insertTable: {
        rows,
        columns: cols,
        location: { index: endIndex + separator.length + 3 },
      },
    });
  }

  const batchRes = await fetch(`${DOCS_API}/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!batchRes.ok) throw new Error(`Docs append batchUpdate failed: ${await batchRes.text()}`);

  return {
    id: documentId,
    url: `https://docs.google.com/document/d/${documentId}/edit`,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return err('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Missing Authorization header', 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return err('Server misconfiguration', 500);
  }

  // Verify Supabase JWT
  const userSupabase = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: userErr } = await userSupabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userErr || !user) return err('Unauthorized', 401);

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey);
  const accessToken = await getValidAccessToken(user.id, adminSupabase, authHeader);
  if (!accessToken) return err('No Google connection found. Connect your Google account first.', 403);

  let body: ExportRequest;
  try {
    body = await req.json() as ExportRequest;
  } catch {
    return err('Invalid JSON body');
  }

  const { format, imageBase64, tableData, title, periodLabel, existingId } = body;
  if (!imageBase64 || !format) return err('Missing required fields');

  try {
    let result: { id: string; url: string };

    if (format === 'google_slides') {
      result = existingId
        ? await appendToSlides(accessToken, existingId, imageBase64, tableData ?? [], title, periodLabel)
        : await createSlidesPresentation(accessToken, title, imageBase64, tableData ?? [], periodLabel);
    } else if (format === 'google_docs') {
      result = existingId
        ? await appendToDocs(accessToken, existingId, imageBase64, tableData ?? [], title, periodLabel)
        : await createDocsDocument(accessToken, title, imageBase64, tableData ?? [], periodLabel);
    } else {
      return err('Unsupported format');
    }

    return json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`Export failed: ${message}`, 502);
  }
});
