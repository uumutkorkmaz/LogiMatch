// İletişim bilgisi sızıntısı tespiti (DOMAIN §9, uç durum #17).
// Saf fonksiyon: metindeki telefon/e-posta/IBAN/URL/mesajlaşma uygulaması/anahtar kelime ve
// karşı tarafın maskeli kimliğini bulur, bulunan parçaları "[gizlendi]" ile maskeler.

export type LeakType =
  | 'PHONE'
  | 'EMAIL'
  | 'IBAN'
  | 'URL'
  | 'MESSENGER'
  | 'KEYWORD'
  | 'IDENTITY';

export interface LeakFinding {
  type: LeakType;
  match: string;
  start: number;
  end: number;
}

export interface LeakResult {
  hasLeak: boolean;
  findings: LeakFinding[];
  masked: string;
}

export interface LeakOptions {
  /** Karşı tarafın maskeli bilgileri: unvan, plaka, şoför adı… (en az 4 karakter). */
  identityTerms?: readonly string[];
}

export const MASK_TOKEN = '[gizlendi]';

const SEP = String.raw`[\s.\-()/]*`;
const D = (n: number) => `(?:${SEP}\\d){${n}}`;

// TR cep (5xx) ve sabit hat (2xx-4xx): opsiyonel +90 / 90 / 0 ön eki; rakamlar arası ayraç serbest.
// Baştaki trunk sıfırı "o/O" ile yazılmış olabilir.
const PHONE_TR = new RegExp(
  String.raw`(?<![\d])(?:\+?${SEP}9${SEP}0${SEP}|[0oO]${SEP})?[2-5]` + D(9) + String.raw`(?![\d])`,
  'g',
);
// Uluslararası: + ile başlayan 10-14 hane.
const PHONE_INTL = new RegExp(String.raw`\+${SEP}\d` + `(?:${SEP}\\d){9,13}` + String.raw`(?!\d)`, 'g');

const EMAIL = new RegExp(
  String.raw`[\p{L}\d._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\(\s*et\s*\)|\[\s*et\s*\])\s*[\p{L}\d-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+nokta\s+)\s*[\p{L}\d-]+)*\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+nokta\s+)\s*(?:com|net|org|tr|io|biz|info|edu|gov|de|eu)\b`,
  'giu',
);
const IBAN = new RegExp(String.raw`\bTR\s*\d{2}(?:[\s-]*\d){22}\b`, 'gi');
const URL = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com\.tr|com|net|org|io|biz)\b(?:\/\S*)?/gi;
const MESSENGER =
  /(?<![\p{L}\d])(?:whats\s?app|whatsap|watsap|vatsap|wp|wa\.me\/?\S*|telegram|t\.me\/?\S*|signal|viber|bip)(?![\p{L}\d])/giu;
// Telefon gibi görünen ama olmayan parçalar: tarih, saat, referans no, birimli tutar/ölçü.
const SAFE_SPANS = [
  /(?<![\d./-])\d{1,2}[./]\d{1,2}[./]\d{2,4}(?![\d./-])/g,
  /(?<!\d)\d{1,2}:\d{2}(?!\d)/g,
  /\b(?:LD|TP|SH|INV)-\d{4}-\d{4,8}\b/gi,
  /(?<![\d.])\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?\s*(?:tl|₺|try|eur|€|usd|\$|kg|ton|km)(?![\p{L}])/giu,
];

const KEYWORDS = [
  'numaram',
  'numaramı',
  'numaran',
  'numaranı',
  'telefonum',
  'telefonumu',
  'beni ara',
  'ara beni',
  'arayın beni',
  'dm at',
  'mail at',
  'maile yaz',
  'dışarıdan',
  'dışarıda anlaş',
  'platform dışı',
  'komisyonsuz',
  'komisyon vermeden',
  'direkt anlaş',
  'direk anlaş',
];

// Türkçe sayı kelimeleri → rakam (ör. "sıfır beş yüz otuz iki" → "0532").
const ONES: Record<string, number> = {
  sıfır: 0,
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
};
const TENS: Record<string, number> = {
  on: 10,
  yirmi: 20,
  otuz: 30,
  kırk: 40,
  elli: 50,
  altmış: 60,
  yetmiş: 70,
  seksen: 80,
  doksan: 90,
};
const NUMBER_WORD = new RegExp(
  `^(?:${[...Object.keys(ONES), ...Object.keys(TENS), 'yüz'].join('|')}|\\d+)$`,
  'u',
);

function wordsToDigits(tokens: string[]): string {
  let out = '';
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/^\d+$/.test(t)) {
      out += t;
      i++;
      continue;
    }
    if (t === 'sıfır') {
      out += '0';
      i++;
      continue;
    }
    // [birler]? yüz? [onlar]? [birler]?  → tek sayı
    let value = 0;
    let consumed = false;
    if (ONES[t] !== undefined && tokens[i + 1] === 'yüz') {
      value += ONES[t] * 100;
      i += 2;
      consumed = true;
    } else if (t === 'yüz') {
      value += 100;
      i++;
      consumed = true;
    }
    const tt = tokens[i];
    if (tt !== undefined && TENS[tt] !== undefined) {
      value += TENS[tt];
      i++;
      consumed = true;
    }
    const to = tokens[i];
    if (to !== undefined && ONES[to] !== undefined && to !== 'sıfır') {
      value += ONES[to];
      i++;
      consumed = true;
    }
    if (!consumed) {
      i++;
      continue;
    }
    out += String(value);
  }
  return out;
}

/** Sayı kelimesi dizilerini bulur; rakama çevrildiğinde telefon içeriyorsa span döner. */
function findSpelledPhones(lower: string): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const tokenRe = /[\p{L}\d]+/gu;
  const tokens: { text: string; start: number; end: number }[] = [];
  for (const m of lower.matchAll(tokenRe)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  let runStart = -1;
  const flush = (endIdx: number) => {
    if (runStart < 0) return;
    const run = tokens.slice(runStart, endIdx);
    runStart = -1;
    if (run.length < 4 || run.every((t) => /^\d+$/.test(t.text))) return;
    const digits = wordsToDigits(run.map((t) => t.text));
    if (/(?:90|0)?[2-5]\d{9}/.test(digits)) {
      findings.push({
        type: 'PHONE',
        match: lower.slice(run[0]!.start, run.at(-1)!.end),
        start: run[0]!.start,
        end: run.at(-1)!.end,
      });
    }
  };
  tokens.forEach((t, idx) => {
    if (NUMBER_WORD.test(t.text)) {
      if (runStart < 0) runStart = idx;
    } else {
      flush(idx);
    }
  });
  flush(tokens.length);
  return findings;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collect(re: RegExp, text: string, type: LeakType, into: LeakFinding[]): void {
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    into.push({ type, match: m[0], start: m.index, end: m.index + m[0].length });
  }
}

export function detectContactLeaks(text: string, options: LeakOptions = {}): LeakResult {
  // tr küçük harfe çevirme uzunluğu korur (İ→i, I→ı); indeksler orijinal metinle aynı kalır.
  const lower = text.toLocaleLowerCase('tr-TR');
  const safeLower = lower.length === text.length ? lower : text.toLowerCase();
  const findings: LeakFinding[] = [];

  collect(IBAN, text, 'IBAN', findings);
  collect(EMAIL, text, 'EMAIL', findings);
  collect(URL, text, 'URL', findings);
  collect(PHONE_TR, text, 'PHONE', findings);
  collect(PHONE_INTL, text, 'PHONE', findings);
  collect(MESSENGER, safeLower, 'MESSENGER', findings);
  if (safeLower === lower) findings.push(...findSpelledPhones(lower));

  for (const kw of KEYWORDS) {
    collect(new RegExp(`(?<![\\p{L}])${escapeRe(kw)}(?![\\p{L}])`, 'gu'), safeLower, 'KEYWORD', findings);
  }
  for (const term of options.identityTerms ?? []) {
    const t = term.trim();
    if (t.length < 4) continue;
    const flexible = escapeRe(t.toLocaleLowerCase('tr-TR')).replace(/\s+/g, '\\s*');
    collect(new RegExp(flexible, 'gu'), safeLower, 'IDENTITY', findings);
  }

  const safe: [number, number][] = [];
  for (const re of SAFE_SPANS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) safe.push([m.index, m.index + m[0].length]);
  }
  const overlapsSafe = (f: LeakFinding) => safe.some(([s, e]) => f.start < e && s < f.end);
  const candidates = findings.filter((f) => f.type !== 'PHONE' || !overlapsSafe(f));

  // IBAN'ın içindeki rakamlar telefon gibi de yakalanabilir: kapsanan bulguları ele.
  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const unique: LeakFinding[] = [];
  for (const f of candidates) {
    const last = unique.at(-1);
    if (last && f.start >= last.start && f.end <= last.end) continue;
    unique.push(f);
  }

  return { hasLeak: unique.length > 0, findings: unique, masked: mask(text, unique) };
}

function mask(text: string, findings: readonly LeakFinding[]): string {
  if (findings.length === 0) return text;
  // Anahtar kelimeler maskelenmez (cümle anlamı korunur); yalnızca iletişim verisi gizlenir.
  const spans = findings
    .filter((f) => f.type !== 'KEYWORD')
    .map((f) => [f.start, f.end] as const)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  let out = '';
  let cursor = 0;
  for (const [s, e] of merged) {
    out += text.slice(cursor, s) + MASK_TOKEN;
    cursor = e;
  }
  return out + text.slice(cursor);
}
