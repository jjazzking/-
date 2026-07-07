// 카드 승인 문자 파서 (신한 개인 / 하나 법인)
// 문자든 CSV든 최종적으로 이 형태로 정규화한다.

export type CardId = "shinhan_personal" | "hana_corp";

export interface ParsedTransaction {
  card: CardId;
  cardLast4: string;
  name: string | null;
  originalAmount: number; // 원본 승인 금액 (원)
  payType: string | null; // 일시불 / 할부N개월 등
  occurredAt: string; // ISO8601 (+09:00 KST)
  merchant: string | null; // 사용처
  isCanceled: boolean; // 취소 건 여부
  raw: string; // 원본 문자
}

// 신한: 신한카드(9051)승인 현*우 2,000원(일시불)07/07 11:20 바나프레소   누적3,080,251원
const SHINHAN_RE =
  /신한카드\((\d{4})\)\s*(승인|취소)\s*(\S+?)\s+([\d,]+)원\s*\(([^)]*)\)\s*(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+(.+?)\s+누적[\d,]+원/;

// 하나: 하나9986 승인 현*우 19,400원 일시불 07/06 18:05  우아한형제들 가능액2,980,600원
const HANA_RE =
  /하나(\d{4})\s*(승인|취소)\s*(\S+?)\s+([\d,]+)원\s+(\S+)\s+(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+(.+?)\s+가능액[\d,]+원/;

function toAmount(s: string): number {
  return Number(s.replace(/,/g, ""));
}

// MM/DD 만 오므로 수신 시점 기준으로 연도를 추론한다.
// 파싱된 날짜가 기준시점보다 크게 미래면(연말→연초 경계) 전년으로 본다.
export function buildKstTimestamp(
  month: number,
  day: number,
  hour: number,
  minute: number,
  reference: Date = new Date(),
): string {
  const kstNow = new Date(reference.getTime() + 9 * 3600 * 1000);
  let year = kstNow.getUTCFullYear();

  const candidateUtcMs =
    Date.UTC(year, month - 1, day, hour, minute) - 9 * 3600 * 1000;
  if (candidateUtcMs - reference.getTime() > 2 * 24 * 3600 * 1000) {
    year -= 1;
  }

  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}T${p(hour)}:${p(minute)}:00+09:00`;
}

export function parseSms(
  raw: string,
  reference: Date = new Date(),
): ParsedTransaction | null {
  const text = raw.trim();

  let m = text.match(SHINHAN_RE);
  if (m) {
    return {
      card: "shinhan_personal",
      cardLast4: m[1],
      isCanceled: m[2] === "취소",
      name: m[3] ?? null,
      originalAmount: toAmount(m[4]),
      payType: m[5] || null,
      occurredAt: buildKstTimestamp(+m[6], +m[7], +m[8], +m[9], reference),
      merchant: m[10]?.trim() || null,
      raw: text,
    };
  }

  m = text.match(HANA_RE);
  if (m) {
    return {
      card: "hana_corp",
      cardLast4: m[1],
      isCanceled: m[2] === "취소",
      name: m[3] ?? null,
      originalAmount: toAmount(m[4]),
      payType: m[5] || null,
      occurredAt: buildKstTimestamp(+m[6], +m[7], +m[8], +m[9], reference),
      merchant: m[10]?.trim() || null,
      raw: text,
    };
  }

  return null;
}
