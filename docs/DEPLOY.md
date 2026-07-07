# 배포 & 실테스트 가이드 (C)

Supabase에 스키마를 올리고 `/ingest` 엣지 함수를 배포한 뒤,
실제 카드 문자를 한 번 쏴서 파이프라인이 도는지 확인한다.

## 0. 준비물
- Supabase 계정 (무료)
- 로컬에 Supabase CLI
  - macOS: `brew install supabase/tap/supabase`
  - npm:   `npm i -g supabase`

## 1. 프로젝트 생성
1. https://supabase.com → **New project**
2. Region 은 **Northeast Asia (Seoul)** 또는 Tokyo 권장 (지연 최소)
3. DB 비밀번호는 잘 보관

## 2. 스키마 & 시드 올리기
대시보드 → **SQL Editor** 에서 순서대로 실행:
1. `supabase/migrations/0001_initial_schema.sql` 전체 붙여넣기 → Run
2. `supabase/seed.sql` 전체 붙여넣기 → Run

Table Editor 에 `transactions / categories / budgets / ingest_log` 가 보이면 성공.

## 3. 엣지 함수 배포
프로젝트 ref 는 대시보드 URL `https://supabase.com/dashboard/project/<REF>` 의 `<REF>`.

```bash
supabase login
supabase link --project-ref <REF>       # config.toml 의 project_id 자동 반영

# /ingest 공유 시크릿 설정 (아무 긴 랜덤 문자열)
supabase secrets set INGEST_SECRET="$(openssl rand -hex 24)"
# 방금 값 확인해서 어딘가 적어둘 것 (단축어에 넣어야 함)
supabase secrets list

supabase functions deploy ingest
```

> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 엣지 함수 런타임에 **자동 주입**되므로
> 따로 설정할 필요 없다. `INGEST_SECRET` 만 넣으면 된다.
> JWT 검증은 `config.toml` 의 `verify_jwt = false` 로 꺼져 있다(단축어가 JWT 대신
> `x-ingest-secret` 헤더로 인증하기 때문).

## 4. 실테스트 (curl)
`<REF>` 와 `<SECRET>` 를 채워서:

```bash
curl -i -X POST "https://<REF>.supabase.co/functions/v1/ingest" \
  -H "x-ingest-secret: <SECRET>" \
  -H "content-type: text/plain; charset=utf-8" \
  --data '신한카드(9051)승인 현*우 2,000원(일시불)07/07 11:20 바나프레소   누적3,080,251원'
```

기대 응답:
```json
{ "ok": true, "transaction_id": "...", "merchant": "바나프레소", "amount": 2000, "card": "shinhan_personal", "canceled": false }
```

취소 문자도 테스트:
```bash
curl -s -X POST "https://<REF>.supabase.co/functions/v1/ingest" \
  -H "x-ingest-secret: <SECRET>" -H "content-type: text/plain; charset=utf-8" \
  --data '신한카드(9051)취소 현*우 3,000원(일시불)07/07 09:42 (주)더스윙 누적3,076,181원'
```
→ `transactions` 에 `amount = -3000`, `is_canceled = true` 로 들어가야 한다.

## 5. 확인
대시보드 → Table Editor → `transactions` 에 행이 생겼는지,
`ingest_log` 에 원문과 `parsed=true` 가 찍혔는지 확인.

## 6. (다음) iOS 단축어 연결
개인 자동화 "메시지 받을 때" → 보낸사람=신한/하나 문자번호 →
"URL의 콘텐츠 가져오기": 위 curl 과 동일하게 POST(`x-ingest-secret` 헤더 + 문자 본문).
→ "즉시 실행" 켜두면 자동으로 적재된다. (상세 가이드는 별도 작성 예정)
