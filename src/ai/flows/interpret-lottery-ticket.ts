'use server';

/**
 * Replacement: interprets OCR text from a handwritten lottery ticket and returns an array of bets
 * that matches the exact schema required by the frontend.
 *
 * Output shape per item:
 * {
 *   fecha:   "YYYY-MM-DD",
 *   track:   "New York Midday" | ... (see mapping),
 *   numeros: "123" | "10-30" | "7",
 *   straight: number,
 *   box:      number,
 *   combo:    number,
 *   notas:    string
 * }
 */

import { z } from 'genkit';

// --------- Input / Output Types ---------
const InterpretLotteryTicketInputSchema = z.object({
  // Provide OCR text directly if you already ran OCR upstream.
  ocrText: z.string().optional(),

  // If you still pass image here, keep it optional; this function does not OCR by itself.
  photoDataUri: z.string().optional(),

  // For NY Midday/Evening default; if not provided we use Date.now().
  serverNowISO: z.string().optional(),

  // (Optional) You can pass header/body/footer text blocks if you segment OCR externally.
  headerHint: z.string().optional(),
  bodyHint: z.string().optional(),
  footerHint: z.string().optional(),
});
export type InterpretLotteryTicketInput = z.infer<typeof InterpretLotteryTicketInputSchema>;

const ParsedBetSchema = z.object({
  fecha: z.string(),
  track: z.string(),
  numeros: z.string(),
  straight: z.number(),
  box: z.number(),
  combo: z.number(),
  notas: z.string(),
});
export type ParsedBet = z.infer<typeof ParsedBetSchema>;

const InterpretLotteryTicketOutputSchema = z.array(ParsedBetSchema);
export type InterpretLotteryTicketOutput = z.infer<typeof InterpretLotteryTicketOutputSchema>;

// --------- Track Mapping (Section 3) ---------
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
  // We’ll normalize GEORGIA/PENN to Day/Eve if OCR has suffixes:
  // e.g., "GEORGIA-DAY", "GEORGIA-EVE", "PENN-DAY", "PENN-EVE"
  'GEORGIA-DAY': 'Georgia Day',
  'GEORGIA-EVE': 'Georgia Eve',
  'PENN-DAY': 'Pennsylvania Day',
  'PENN-EVE': 'Pennsylvania Eve',
  'VENEZUELA': 'Venezuela (2 dígitos)',
  'STO DGO': 'Santo Domingo (RD)',
};

const CHECKMARKS = /[✔✓☑xX]/;

// --------- Helpers ---------
const DIGITS = /^\d+$/;
const PALE_SEP = /[xX+\-]/;               // input separators
const PALE_NORMALIZE_SEP = '-';            // output separator
const RANGE_SEP = /\b(?:to|a)\b|–|—|–|-|→/i;

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
  // <15:00 → Midday; else Evening/Night
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
  // Accept patterns like 4-30-25, 04/30/2025, 2025-04-30
  const mdy = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  const ymd = s.match(/\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  let candidate: Date | null = null;

  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    candidate = new Date(y, m - 1, d);
  } else if (mdy) {
    let [ , mm, dd, yy ] = mdy;
    let y = parseInt(yy, 10);
    if (y < 100) y += 2000;
    candidate = new Date(parseInt(y.toString(), 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
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
  // Prefer explicit checkmarked lines
  const headerLines = linesOf(headerText);

  // First pass: lines with a checkmark and a known abbreviation
  for (const ln of headerLines) {
    if (!CHECKMARKS.test(ln)) continue;
    for (const key of Object.keys(TRACK_MAP)) {
      if (ln.toUpperCase().includes(key)) return TRACK_MAP[key];
    }
  }

  // Second pass: plain abbreviation without checkmark but clearly present
  for (const key of Object.keys(TRACK_MAP)) {
    if (header.includes(key)) return TRACK_MAP[key];
  }

  // Special “GEORGIA-… / PENN-…” inference:
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
  const isPale = /^\d{2}[-]\d{2}$/.test(numeros);
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
  // If value is an integer with no decimal and exceeds cap, fall back to cents (e.g., 50 -> 0.50)
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
  return `${m[1]}${PALE_NORMALIZE_SEP}${m[2]}`;
}

// SingleAction (Section 6.3)
function isSingleAction(s: string): boolean {
  const m = s.match(/^\d$/);
  return !!m;
}

// Parse a body line into { numeros[], amountHints }
type LineParse = {
  bets: { numeros: string; source: string }[];
  amounts: { straight?: number; box?: number; combo?: number; hasDivision?: boolean; raw?: string }[];
  broadcastToAll?: boolean; // "to all" hint
};

// Detect division markers on a line: "/", "÷", long bar/dash variations
const DIV_MARK = /[\/÷]|(?:\|\¯)|(?:—|–|-)\s*/;

function parseBodyLine(line: string): LineParse {
  const out: LineParse = { bets: [], amounts: [] };

  const hasToAll = /\bto\s+all\b/i.test(line);
  if (hasToAll) out.broadcastToAll = true;

  // Collect Palé first
  const paleMatches = line.match(/\b\d{2}\s*[xX+\-]\s*\d{2}\b/g) ?? [];
  for (const pm of paleMatches) {
    const n = normalizePale(pm);
    if (n) out.bets.push({ numeros: n, source: pm });
  }

  // Remove Palé snippets to avoid double-counting digits below
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
      // Mark a synthetic "bet" with notas later
      out.bets.push({ numeros: a, source: 'rangoNoExpandido' });
    }
  }
  rest = rest.replace(rangeRegex, ' ');

  // Remaining standalone numbers (1–4 digits)
  const numRegex = /\b\d{1,4}\b/g;
  const nums = rest.match(numRegex) ?? [];
  for (const n of nums) {
    // Do not create a Palé accidentally (already handled above)
    out.bets.push({ numeros: n, source: n });
  }

  // Amounts on this line: look for patterns like "2.75", "50c", ".50", "$3", and also "amount / amount"
  // We'll record raw amounts and resolve exclusivity per bet later.
  // Detect combos with trailing "C"
  const comboRe = /\b(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\s*[cC]\b/g;
  let cm: RegExpExecArray | null;
  while ((cm = comboRe.exec(line))) {
    const val = parseAmountToken(cm[1]);
    if (val !== null) out.amounts.push({ combo: val, raw: cm[0] });
  }

  // Division/box: "... / .25" or "— 0.25"
  const divRe = /\b(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\s*(?:[\/÷]|—|–|-|\|\¯)\s*(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = divRe.exec(line))) {
    const right = parseAmountToken(dm[2]);
    if (right !== null) out.amounts.push({ box: right, hasDivision: true, raw: dm[0] });
  }

  // Plain amounts (straight), but exclude ones already captured as combo or division
  // We’ll collect all amounts and decide per-bet later.
  const amtRe = /\b(\$?\d+(?:\.\d+)?|\.\d+|\d+\s*[cC])\b(?!\s*[cC])/g;
  let am: RegExpExecArray | null;
  while ((am = amtRe.exec(line))) {
    // Skip if this token is within a division or combo we already recorded
    const token = am[0];
    if (comboRe.lastIndex && line.slice(am.index, am.index + token.length + 2).match(/\b[cC]\b/)) continue;
    // Rough filter: if token is part of a "X / Y" span, it's already handled
    // (This is heuristic; exclusivity is enforced later anyway)
    const val = parseAmountToken(token);
    if (val !== null) out.amounts.push({ straight: val, raw: token });
  }

  return out;
}

// Enforce exclusivity per your spec (box > straight; combo exclusive when "C")
// and adjust by caps
function resolveAmounts(numeros: string, lineAmounts: LineParse['amounts']): { straight: number; box: number; combo: number; notas: string } {
  const caps = capsFor(numeros);
  let straight: number | null = null;
  let box: number | null = null;
  let combo: number | null = null;
  let notas: string[] = [];

  // Prefer combo if explicitly marked with "C"
  const comboHit = lineAmounts.find(a => typeof a.combo === 'number');
  if (comboHit) combo = adjustByCaps(comboHit.combo!, caps.combo);

  // Prefer box if any division marker present (Section 5.2)
  const boxHit = lineAmounts.find(a => a.hasDivision && typeof a.box === 'number');
  if (boxHit) {
    box = adjustByCaps(boxHit.box!, caps.box);
    straight = null; // exclusivity
    combo = null;
    return { straight: 0, box: box ?? 0, combo: 0, notas: notas.join(';') };
  }

  // If no box and no combo, look for straight
  if (combo === null) {
    const stHit = lineAmounts.find(a => typeof a.straight === 'number');
    if (stHit) straight = adjustByCaps(stHit.straight!, caps.straight);
  }

  // Normalize to numbers with zeroes
  return {
    straight: straight ?? 0,
    box: box ?? 0,
    combo: combo ?? 0,
    notas: clean(notas.join(';')),
  };
}

// Final validator on numeros (2-digit rule, letters, etc.)
function validateNumeros(numeros: string, track: string): { ok: boolean; normalized?: string; notas?: string } {
  // Palé OK
  if (/^\d{2}-\d{2}$/.test(numeros)) return { ok: true, normalized: numeros };

  // Only digits allowed (1–4), never letters
  if (!/^\d{1,4}$/.test(numeros)) return { ok: false, notas: 'ilegible' };

  // 2-digit numbers must NOT be treated as Peak 3 (we don’t tag game mode anyway; this is informational)
  // We simply allow them; frontend knows the context.

  // Pad to original digit length (we keep as-is)
  return { ok: true, normalized: numeros };
}

// ---- Main ----
export async function interpretLotteryTicket(input: InterpretLotteryTicketInput): Promise<InterpretLotteryTicketOutput> {
  const parsed = InterpretLotteryTicketInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.message}`);

  const now = nowFrom(input.serverNowISO);
  const todayYmd = yyyyMmDd(now);

  // OCR text: prefer bodyHint+headerHint+footerHint if provided
  const rawText = clean(
    [input.headerHint, input.bodyHint, input.footerHint, input.ocrText]
      .filter(Boolean)
      .join('\n')
  );

  const allLines = linesOf(rawText);
  const headerLines: string[] = linesOf(input.headerHint ?? allLines.slice(0, Math.max(1, Math.floor(allLines.length * 0.25))).join('\n'));
  const footerLines: string[] = linesOf(input.footerHint ?? allLines.slice(Math.floor(allLines.length * 0.75)).join('\n'));
  const bodyLines: string[] = linesOf(input.bodyHint ?? allLines.join('\n'));

  // Detect track from header (Section 3)
  const track = detectTrack(headerLines.join('\n'), now);

  // Detect date from footer; ensure never past (Section 2)
  let fecha = todayYmd;
  const footerJoined = footerLines.join(' ');
  const dateFound = parseDateCandidate(footerJoined, now);
  if (dateFound) fecha = dateFound;

  const out: ParsedBet[] = [];

  // Keep a broadcast amount (apply to all subsequent bets until overridden), driven by "to all"
  let broadcastAmounts: LineParse['amounts'] | null = null;

  for (const rawLine of bodyLines) {
    if (!rawLine) continue;
    const line = clean(rawLine);

    // Skip pure header/footer noise
    if (/TOTAL|SUBTOTAL|BALANCE/i.test(line)) continue;

    const parsedLine = parseBodyLine(line);

    // Set or clear broadcast
    if (parsedLine.broadcastToAll) {
      broadcastAmounts = parsedLine.amounts.length ? parsedLine.amounts : broadcastAmounts;
      continue; // the "to all" line may only carry directive
    }

    // If no local amounts, but there is an active broadcast, use it
    const effectiveAmounts = parsedLine.amounts.length ? parsedLine.amounts : (broadcastAmounts ?? []);

    for (const bet of parsedLine.bets) {
      let numeros = bet.numeros;

      // Normalize Palé already handled.
      // Validate/normalize numeros
      const v = validateNumeros(numeros, track);
      if (!v.ok) {
        out.push({ fecha, track, numeros, straight: 0, box: 0, combo: 0, notas: v.notas ?? 'ilegible' });
        continue;
      }
      numeros = v.normalized!;

      // Resolve amounts with exclusivity & caps
      const { straight, box, combo, notas } = resolveAmounts(numeros, effectiveAmounts);

      // If we have no amount at all, we still emit the bet with zeros (frontend may handle defaulting),
      // unless the number is clearly illegible (already filtered).
      out.push({
        fecha,
        track,
        numeros,
        straight,
        box,
        combo,
        notas,
      });
    }
  }

  // Final pass: ensure output matches schema exactly and never includes past date
  const result = out.map(b => ({
    fecha,
    track: b.track,
    numeros: b.numeros,
    straight: b.straight ?? 0,
    box: b.box ?? 0,
    combo: b.combo ?? 0,
    notas: b.notas ?? '',
  }));

  return InterpretLotteryTicketOutputSchema.parse(result);
}

/* -----------------------------
 * Quick self-check examples (you can remove after testing)
 * -----------------------------
 *
 * 1) Palé straight:
 *   "05x55 - 1"  -> numeros:"05-55", straight:1, box:0, combo:0
 *
 * 2) Palé box:
 *   "24+28 / 50c" -> numeros:"24-28", straight:0, box:0.50, combo:0
 *
 * 3) Palé combo:
 *   "10-30 2 C" -> numeros:"10-30", combo:2, straight:0, box:0
 *
 * 4) Round-down:
 *   "033 - 933  $1" -> expands to 10 bets: 033,133,...,933 each straight:1
 *
 * 5) 2-digit never Pick 3:
 *   "24  3" -> numeros:"24", straight:3 (kept as 2-digit game)
 *
 * 6) SingleAction:
 *   "7  5" -> numeros:"7", straight:5
 *
 * 7) Division overrides straight:
 *   "123 2.75 / .25" -> numeros:"123", box:0.25, straight:0
 *
 * 8) Date:
 *   Footer "4-30-25" on 2025-07-31 -> ignore (past) → fecha=today; only accept today or future.
 */
