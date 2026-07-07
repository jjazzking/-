# 가계부 (iOS)

아이폰용 개인 가계부 앱. 카드 승인 문자와 카드사 CSV에서 거래를 모아
카테고리·예산으로 관리한다.

## 구조

```
데이터 유입
 ├─ 실시간:  카드 승인 문자 → iOS 단축어 → POST → 파서 → Supabase
 └─ 백필:    카드사 CSV/엑셀 → 임포터 → 파서 → Supabase

저장:  Supabase (Postgres)
파싱:  문자/CSV 공통 파서 → {일시, 사용처, 금액, 카드, 취소여부}
앱:    SwiftUI (iOS) — 조회 / 카테고리 지정 / 예산·진행률
```

## 핵심 데이터 모델

- `transactions` — 거래 원장. `original_amount`(원본)와 `amount`(실제 반영액)를 분리.
- `categories` — 지출/수입 카테고리 (`is_income`).
- `budgets` — 카테고리별 월 예산 금액 (진행률·추천예산 계산은 앱에서).
- `ingest_log` — 유입 원문 로깅 (파싱 실패 추적).

### 금액 조정 규칙 (`adjustment`)
| 값 | 의미 | 계산 |
|----|------|------|
| `none` | 조정 없음 | `amount = original_amount` |
| `edited` | 사용자가 직접 수정 | `amount` 수동 입력 |
| `dutch` | 더치페이 분할 | `amount = original_amount / split_count` (또는 직접 입력) |
| `corp_cap` | 법카 2만원 캡 | `amount = max(original_amount - 20000, 0)` — 2만원은 회사부담, 초과분만 내 지출 |

## 개발 상태

- [x] DB 스키마 (`supabase/migrations/0001_initial_schema.sql`)
- [x] 기본 카테고리 시드 (`supabase/seed.sql`)
- [x] 문자 파서 신한/하나 (`supabase/functions/_shared/parser.ts`) — 실샘플 2종 통과
- [x] `/ingest` 엣지 함수 (`supabase/functions/ingest/index.ts`)
- [ ] 취소/할부 문자 대응 — *샘플 대기 중*
- [ ] CSV 임포터
- [ ] iOS 단축어 구성 가이드
- [ ] SwiftUI 앱

## Supabase 셋업 (본인 계정에서)

1. [supabase.com](https://supabase.com) 프로젝트 생성 (무료 티어)
2. SQL Editor에서 `supabase/migrations/0001_initial_schema.sql` 실행
3. 이어서 `supabase/seed.sql` 실행 (기본 카테고리)
4. Project Settings → API 에서 `Project URL`, `anon key` 복사 → `.env`에 설정 (커밋 금지)

> RLS(행 수준 보안)는 배포 전 반드시 설정. 마이그레이션 하단 주석 참고.
