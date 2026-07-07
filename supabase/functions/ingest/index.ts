// Supabase Edge Function: /ingest
// iOS 단축어가 카드 승인 문자를 이 엔드포인트로 POST 한다.
//   - 원문을 먼저 ingest_log에 적재 (파싱 실패해도 유실 방지)
//   - 파싱 성공 시 transactions 에 저장 (source='sms')
// 요청 형식:
//   POST /functions/v1/ingest
//   헤더:  x-ingest-secret: <INGEST_SECRET>
//   본문:  text/plain (문자 전체)  또는  application/json { "text": "..." }
//
// 필요한 환경변수(Supabase Edge Function Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INGEST_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSms } from "../_shared/parser.ts";

// deno-lint-ignore no-explicit-any
const env = (Deno as any).env;

const supabase = createClient(
  env.get("SUPABASE_URL")!,
  env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const INGEST_SECRET = env.get("INGEST_SECRET");

async function readBody(req: Request): Promise<string> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return (j.text ?? j.body ?? j.message ?? "").toString();
  }
  return (await req.text()).toString();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  // 공유 시크릿 검증 (단축어에 노출되는 anon 키만으로는 쓰기 불가하게)
  if (INGEST_SECRET && req.headers.get("x-ingest-secret") !== INGEST_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const raw = (await readBody(req)).trim();
  if (!raw) return json({ error: "empty body" }, 400);

  // 1) 원문 먼저 적재
  const { data: logRow, error: logErr } = await supabase
    .from("ingest_log")
    .insert({ source: "sms", raw_text: raw })
    .select("id")
    .single();
  if (logErr) return json({ error: `log insert failed: ${logErr.message}` }, 500);

  // 2) 파싱
  const parsed = parseSms(raw);
  if (!parsed) {
    await supabase
      .from("ingest_log")
      .update({ parsed: false, error: "no matching card pattern" })
      .eq("id", logRow.id);
    return json({ ok: false, reason: "unparsed", log_id: logRow.id }, 200);
  }

  // 3) 거래 저장
  //   취소 건은 지출을 상쇄하도록 amount 를 음수로 저장 (합계가 자동으로 net 값이 됨).
  //   original_amount 는 액면가(양수) 유지 + is_canceled 플래그로 목록 표시.
  const signedAmount = parsed.isCanceled
    ? -parsed.originalAmount
    : parsed.originalAmount;
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      occurred_at: parsed.occurredAt,
      merchant: parsed.merchant,
      original_amount: parsed.originalAmount,
      amount: signedAmount,
      type: "expense",
      card: parsed.card,
      adjustment: "none",
      is_canceled: parsed.isCanceled,
      source: "sms",
      raw_text: parsed.raw,
      memo: parsed.payType,
    })
    .select("id")
    .single();

  if (txErr) {
    await supabase
      .from("ingest_log")
      .update({ parsed: false, error: `tx insert failed: ${txErr.message}` })
      .eq("id", logRow.id);
    return json({ error: `tx insert failed: ${txErr.message}` }, 500);
  }

  await supabase
    .from("ingest_log")
    .update({ parsed: true, transaction_id: tx.id })
    .eq("id", logRow.id);

  return json({
    ok: true,
    transaction_id: tx.id,
    merchant: parsed.merchant,
    amount: parsed.originalAmount,
    card: parsed.card,
    canceled: parsed.isCanceled,
  }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
