/**
 * Deterministic OCR → Parser for lottery tickets.
 * - If `ocrText` is provided, uses it.
 * - Else, if `photoDataUri` is provided, runs Google Cloud Vision `documentTextDetection`.
 * - Parses per the user's rulebook and returns an array of:
 *   { fecha, track, numeros, straight, box, combo, notas }
 */

import { z } from 'genkit';

// ---- Input schema (internal only; NOT exported at runtime) ----
const InterpretLotteryTicketInputSchema = z.object({
  ocrText: z.string().optional(),
  photoDataUri: z.string().optional(),     // data URL base64
  serverNowISO: z.string().optional(),     // for NY default track
  headerHint: z.string().optional(),       // optional segmentation hints
  bodyHint: z.string().optional(),
  footerHint: z.string().optional(),
});

// ---- Output validation (internal) ----
const ParsedBetSchema = z.object({
  fecha: z.string(),
  track: z.string(),
  numeros: z.string(),
  straight: z.number(),
  box: z.number(),
  combo: z.number(),
  notas: z.string(),
});
const InterpretLotteryTicketOutputSchema = z.array(ParsedBetSchema);

// ---- Track map & helpers ----
const TRACK_MAP: Record<string, string> = {
  'MIDDAY': 'New York Midday',
  'NYS': 'New York Night',
  'BK-DAY': 'Brooklyn Midday',
  'BK-TV': 'Brooklyn Night (TV)',
  'NY': 'New York Horses (single)',
  'NJ-DAY': 'New Jersey Midday',
  'NJ-NIGHT': 'New Jersey Evening',
  'CONN-DAY': 'Connecticut Midday',
  'CONN-NIGHT': 'Connecticut Evening',
  'FLA-MIDDAY': 'Florida Midday',
  'FLA-NIGHT': 'Florida Evening',
  'GEORGIA-DAY': 'Georgia Day',
  'GEORGIA-EVE': 'Georgia Eve',
  'PENN-DAY': 'Pennsylvania Day',
  'PENN-EVE': 'Pennsylvania Eve',
  'VENEZUELA': 'Venezuela (2 dígitos)',
  'STO DGO': 'Santo Domingo (RD)',
};

const CHECKMARKS = /[✔✓☑xX]/;

function nowFrom(serverNowISO?: string): Date {
  return serverNowISO ? new Date(serverNowISO) : new Date();
}
function yyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function defaultNYTrackByTime(d: Date): string {
  const hour = d.getHours();
  return hour < 15 ? 'New York Midday' : 'New York Night';
}
function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
function linesOf(text?: string): string[] {
  return (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}

// Date parsing (Section 2)
function parseDateCandidate(s: string, today: Date): string | null {
  const mdy = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  const ymd = s.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  let candidate: Date | null = null;

  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    candidate = new Date(y, m - 1, d);
  } else if (mdy) {
    let [, mm, dd, yy] = mdy;
    let y = parseInt(yy, 10);
    if (y < 100) y += 2000;
    candidate = new Date(y, parseInt(mm, 10) - 1, parseInt(dd, 10));
  }

  if (!candidate) return null;

  // Only accept if today or future (never past)
  const todayYmd = yyyyMmDd(today);
  const candYmd = yyyyMmDd(candidate);
  return (candYmd >= todayYmd) ? candYmd : null;
}

// Track detection (Section 3)
function detectTrack(headerText: string, fallbackDate: Date): string {
  const header = headerText.toUpperCase();
  const headerLines = linesOf(headerText);

  // First pass: checkmarks + known abbreviation
  for (const ln of headerLines) {
    if (!CHECKMARKS.test(ln)) continue;
    for (const key of Object.keys(TRACK_MAP)) {
      if (ln.toUpperCase().includes(key)) return TRACK_MAP[key];
    }
  }

  // Second pass: plain abbreviation present
  for (const key of Object.keys(TRACK_MAP)) {
    if (header.includes(key)) return TRACK_MAP[key];
  }

  // Special inference
  if (header.includes('GEORGIA')) {
    if (header.includes('EVE') || header.includes('NIGHT')) return TRACK_MAP['GEORGIA-EVE'];
    return TRACK_MAP['GEORGIA-DAY'];
  }
  if (header.includes('PENN')) {
    if (header.includes('EVE') || header.includes('NIGHT')) return TRACK_MAP['PENN-EVE'];
    return TRACK_MAP['PENN-DAY'];
  }

  // No marks visible → default NY by time
  return defaultNYTrackByTime(fallbackDate);
}

// Game caps (Section 5.4)
function capsFor(numeros: string): { straight: number; box: number; combo: number } {
  const isPale = /^\d{2}-\d{2}$/.test(numeros);
  const len = isPale ? 2 : numeros.replace(/[^0-9]/g, '').length;

  if (isPale || len === 2) return { straight: 100, box: 100, combo: 100 };
  if (len === 1) return { straight: 600, box: 0, combo: 0 }; // SingleAction
  if (len === 4) return { straight: 10, box: 62, combo: 10 }; // Win4
  // default to Peak3
  return { straight: 35, box: 105, combo: 35 };
}

// Normalize amount tokens to dollars without inventing decimals (Section 5)
function parseAmountToken(tok: string): number | null {
  let t = tok.trim();

  // Remove currency symbols and spaces
  t = t.replace(/[$]/g, '').trim();

  // cents like "50c"
  const c = t.match(/^(\d+(?:\.\d+)?)\s*[cC]\b/);
  if (c) {
    const v = parseFloat(c[1]);
    return isFinite(v) ? +(v / 100).toFixed(2) : null;
  }

  // pure number or decimal
  const n = t.match(/^\d+(?:\.\d+)?$/);
  if (n) {
    const v = parseFloat(n[0]);
    return isFinite(v) ? +v.toFixed(2) : null;
  }

  // leading dot ".50"
  const ld = t.match(/^\.(\d{1,2})$/);
  if (ld) {
    const v = parseFloat(`0.${ld[1]}`);
    return isFinite(v) ? +v.toFixed(2) : null;
  }

  return null;
}

// Decide $ vs cents if ambiguous and cap-aware (Section 5.4)
function adjustByCaps(value: number, cap: number): number {
  if (value > cap) {
    const centsCandidate = +(value / 100).toFixed(2);
    if (centsCandidate <= cap) return centsCandidate;
  }
  return value;
}

// 0–9 round-down expansion (Section 6.1)
function expandRoundDown(a: string, b: string): string[] | null {
  if (!/^\d{1,4}$/.test(a) || !/^\d{1,4}$/.test(b)) return null;
  const pad = Math.max(a.length, b.length);
  const A = a.padStart(pad, '0');
  const B = b.padStart(pad, '0');

  // All equal except one position goes 0 -> 9
  let diffIdx = -1;
  for (let i = 0; i < pad; i++) {
    if (A[i] !== B[i]) {
      if (A[i] === '0' && B[i] === '9' && diffIdx === -1) diffIdx = i;
      else return null;
    }
  }
  if (diffIdx >= 0) {
    const out: string[] = [];
    for (let d = 0; d <= 9; d++) {
      const arr = A.split('');
      arr[diffIdx] = String(d);
      out.push(arr.join(''));
    }
    return out;
  }

  // Special case: "000" -> "999" (generate 000,111,...,999)
  if (/^0+$/.test(A) && /^9+$/.test(B) && A.length === B.length) {
    const out: string[] = [];
    for (let d = 0; d <= 9; d++) {
      out.push(String(d).repeat(A.length));
    }
    return out;
  }

  return null;
}

// Palé normalization (Section 6.2)
function normalizePale(s: string): string | null {
  const m = s.match(/^\s*(\d{2})\s*[xX+\-]\s*(\d{2})\s*$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

// ---- Parse a body line ----
type LineParse = {
  bets: { numeros: string; source: string }[];
  amounts: { straight?: number; box?: number; combo?: number; hasDivision?: boolean; raw?: string }[];
  broadcastToAll?: boolean;
};

function parseBodyLine(line: string): LineParse {
  const out: LineParse = { bets: [], amounts: [] };

  const hasToAll = /\bto\s+all\b/i.test(line);
  if (hasToAll) out.broadcastToAll = true;

  // Palé first
  const paleMatches = line.match(/\b\d{2}\s*[xX+\-]\s*\d{2}\b/g) ?? [];
  for (const pm of paleMatches) {
    const n = normalizePale(pm);
    if (n) out.bets.push({ numeros: n, source: pm });
  }

  // Remove Palé to avoid double counting
  let rest = line;
  for (const pm of paleMatches) rest = rest.replace(pm, ' ');

  // Ranges: "033 - 933", "120 to 129"
  const rangeRegex = /\b(\d{1,4})\s*(?:to|a|–|—|-|→)\s*(\d{1,4})\b/ig;
  let rm: RegExpExecArray | null;
  while ((rm = rangeRegex.exec(rest))) {
    const a = rm[1], b = rm[2];
    const expanded = expandRoundDown(a, b);
    if (expanded) {
      for (const e of expanded) out.bets.push({ numeros: e, source: `${a}-${b}` });
    } else {
      out.bets.push({ numeros: a, source: 'rangoNoExpandido' });
    }
  }
  rest = rest.replace(rangeRegex, ' ');

  // Standalone numbers (1–4 digits)
  const numRegex = /\b\d{1,4}\b/g;
  const nums = rest.match(numRegex) ?? [];
  for (const n of nums) out.bets.push({ numeros: n, source: n });

  // Amounts on line
  const comboRe = /\b(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\s*[cC]\b/g;
  let cm: RegExpExecArray | null;
  while ((cm = comboRe.exec(line))) {
    const val = parseAmountToken(cm[1]);
    if (val !== null) out.amounts.push({ combo: val, raw: cm[0] });
  }

  const divRe = /\b(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\s*(?:[\/÷]|—|–|-|\|\¯)\s*(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = divRe.exec(line))) {
    const right = parseAmountToken(dm[2]);
    if (right !== null) out.amounts.push({ box: right, hasDivision: true, raw: dm[0] });
  }

  const amtRe = /\b(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\b(?!\s*[cC])/g;
  let am: RegExpExecArray | null;
  while ((am = amtRe.exec(line))) {
    const token = am[0];
    if (/\b[cC]\b/.test(line.slice(am.index, am.index + token.length + 2))) continue;
    const val = parseAmountToken(token);
    if (val !== null) out.amounts.push({ straight: val, raw: token });
  }

  return out;
}

function capsForNumeros(n: string) {
  const isPale = /^\d{2}-\d{2}$/.test(n);
  const len = isPale ? 2 : n.replace(/[^0-9]/g, '').length;
  if (isPale || len === 2) return { straight: 100, box: 100, combo: 100 };
  if (len === 1) return { straight: 600, box: 0, combo: 0 };
  if (len === 4) return { straight: 10, box: 62, combo: 10 };
  return { straight: 35, box: 105, combo: 35 };
}

function resolveAmounts(
  numeros: string,
  amts: LineParse['amounts']
): { straight: number; box: number; combo: number; notas: string } {
  const caps = capsForNumeros(numeros);
  let straight: number | null = null;
  let box: number | null = null;
  let combo: number | null = null;

  const comboHit = amts.find(a => typeof a.combo === 'number');
  if (comboHit) combo = adjustByCaps(comboHit.combo!, caps.combo);

  const boxHit = amts.find(a => a.hasDivision && typeof a.box === 'number');
  if (boxHit) {
    box = adjustByCaps(boxHit.box!, caps.box);
    return { straight: 0, box: box ?? 0, combo: 0, notas: '' };
  }

  if (combo === null) {
    const stHit = amts.find(a => typeof a.straight === 'number');
    if (stHit) straight = adjustByCaps(stHit.straight!, caps.straight);
  }
  return { straight: straight ?? 0, box: box ?? 0, combo: combo ?? 0, notas: '' };
}

function validateNumeros(numeros: string) {
  if (/^\d{2}-\d{2}$/.test(numeros)) return { ok: true, normalized: numeros };
  if (!/^\d{1,4}$/.test(numeros)) return { ok: false, notas: 'ilegible' };
  return { ok: true, normalized: numeros };
}

// ---- OCR via Google Cloud Vision (dynamic import) ----
async function runVisionOcrFromDataUrl(photoDataUri?: string): Promise<string> {
  if (!photoDataUri) return '';
  try {
    const commaIdx = photoDataUri.indexOf(',');
    const b64 = commaIdx >= 0 ? photoDataUri.slice(commaIdx + 1) : photoDataUri;
    const buffer = Buffer.from(b64, 'base64');

    // Dynamic import to avoid ESM/CJS friction
    const vision = await import('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient();
    const [result] = await client.documentTextDetection({ image: { content: buffer } });
    const text = result?.fullTextAnnotation?.text ?? '';
    console.log('[interpretLotteryTicket] OCR chars:', text.length);
    return text;
  } catch (err) {
    console.error('[interpretLotteryTicket] Vision OCR failed:', err);
    return '';
  }
}

// ---- The only export (async function) ----
export async function interpretLotteryTicket(input: unknown): Promise<
  Array<{ fecha: string; track: string; numeros: string; straight: number; box: number; combo: number; notas: string }>
> {
  const parsed = InterpretLotteryTicketInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error('[interpretLotteryTicket] Invalid input:', parsed.error);
    return [];
  }
  const i = parsed.data;

  const now = nowFrom(i.serverNowISO);
  const todayYmd = yyyyMmDd(now);

  // Resolve OCR text
  let ocrText = (i.ocrText ?? '').trim();
  if (!ocrText && i.photoDataUri) {
    ocrText = await runVisionOcrFromDataUrl(i.photoDataUri);
  }
  if (!ocrText) {
    console.warn('[interpretLotteryTicket] Empty OCR text; returning []');
    return [];
  }

  // Build raw text, allow optional header/body/footer hints
  const rawText = clean([i.headerHint, i.bodyHint, i.footerHint, ocrText].filter(Boolean).join('\n'));
  const allLines = linesOf(rawText);
  const headerLines = linesOf(i.headerHint ?? allLines.slice(0, Math.max(1, Math.floor(allLines.length * 0.25))).join('\n'));
  const footerLines = linesOf(i.footerHint ?? allLines.slice(Math.floor(allLines.length * 0.75)).join('\n'));
  const bodyLines = linesOf(i.bodyHint ?? allLines.join('\n'));

  // Track & date
  const track = detectTrack(headerLines.join('\n'), now);
  let fecha = todayYmd;
  const footerJoined = footerLines.join(' ');
  const dateFound = parseDateCandidate(footerJoined, now);
  if (dateFound) fecha = dateFound;

  const out: Array<{ fecha: string; track: string; numeros: string; straight: number; box: number; combo: number; notas: string }> = [];
  let broadcastAmounts: LineParse['amounts'] | null = null;

  for (const rawLine of bodyLines) {
    if (!rawLine) continue;
    const line = clean(rawLine);
    if (/TOTAL|SUBTOTAL|BALANCE/i.test(line)) continue;

    const parsedLine = parseBodyLine(line);

    if (parsedLine.broadcastToAll) {
      broadcastAmounts = parsedLine.amounts.length ? parsedLine.amounts : broadcastAmounts;
      continue; // directive line
    }

    const effectiveAmounts = parsedLine.amounts.length ? parsedLine.amounts : (broadcastAmounts ?? []);

    for (const bet of parsedLine.bets) {
      let numeros = bet.numeros;

      // Validate/normalize numeros
      const v = validateNumeros(numeros);
      if (!v.ok) {
        out.push({ fecha, track, numeros, straight: 0, box: 0, combo: 0, notas: v.notas ?? 'ilegible' });
        continue;
      }
      numeros = v.normalized!;

      // Resolve amounts with exclusivity & caps
      const { straight, box, combo, notas } = resolveAmounts(numeros, effectiveAmounts);

      out.push({ fecha, track, numeros, straight, box, combo, notas });
    }
  }

  console.log('[interpretLotteryTicket] Parsed bets:', out.length);

  try {
    return InterpretLotteryTicketOutputSchema.parse(out);
  } catch (e) {
    console.error('[interpretLotteryTicket] Output validation failed:', e);
    return [];
  }
}
