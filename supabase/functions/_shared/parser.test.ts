import { parseSms } from "./parser.ts";

// 수신 시점 고정 (연도 추론 검증용): 2026-07-07 KST 오전
const REF = new Date("2026-07-07T02:30:00Z"); // = 2026-07-07 11:30 KST

const cases: Array<{ label: string; sms: string; expect: Record<string, unknown> }> = [
  {
    label: "신한 일시불",
    sms: "신한카드(9051)승인 현*우 2,000원(일시불)07/07 11:20 바나프레소   누적3,080,251원",
    expect: {
      card: "shinhan_personal",
      cardLast4: "9051",
      originalAmount: 2000,
      payType: "일시불",
      occurredAt: "2026-07-07T11:20:00+09:00",
      merchant: "바나프레소",
      isCanceled: false,
    },
  },
  {
    label: "하나 일시불(법인)",
    sms: "하나9986 승인 현*우 19,400원 일시불 07/06 18:05  우아한형제들 가능액2,980,600원",
    expect: {
      card: "hana_corp",
      cardLast4: "9986",
      originalAmount: 19400,
      payType: "일시불",
      occurredAt: "2026-07-06T18:05:00+09:00",
      merchant: "우아한형제들",
      isCanceled: false,
    },
  },
];

let failed = 0;
for (const c of cases) {
  const got = parseSms(c.sms, REF);
  if (!got) {
    console.error(`❌ ${c.label}: 파싱 실패 (null)`);
    failed++;
    continue;
  }
  const mismatches: string[] = [];
  for (const [k, v] of Object.entries(c.expect)) {
    if ((got as Record<string, unknown>)[k] !== v) {
      mismatches.push(`  ${k}: 기대=${JSON.stringify(v)} 실제=${JSON.stringify((got as Record<string, unknown>)[k])}`);
    }
  }
  if (mismatches.length) {
    console.error(`❌ ${c.label}:\n${mismatches.join("\n")}`);
    failed++;
  } else {
    console.log(`✅ ${c.label} → ${got.merchant} ${got.originalAmount}원 @ ${got.occurredAt}`);
  }
}

console.log(failed === 0 ? "\n모든 케이스 통과" : `\n${failed}건 실패`);
if (failed > 0) process.exit(1);
