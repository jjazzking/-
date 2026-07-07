-- 기본 카테고리 시드 (원하는 대로 앱에서 수정/추가 가능)
-- 지출 카테고리
insert into categories (name, icon, is_income, sort_order) values
  ('식비',      '🍚', false, 10),
  ('카페/간식', '☕', false, 20),
  ('교통',      '🚌', false, 30),
  ('생활/마트', '🛒', false, 40),
  ('쇼핑',      '🛍️', false, 50),
  ('문화/여가', '🎬', false, 60),
  ('의료/건강', '💊', false, 70),
  ('통신/구독', '📱', false, 80),
  ('주거/공과금','🏠', false, 90),
  ('기타',      '💸', false, 100)
on conflict (name, is_income) do nothing;

-- 수입 카테고리
insert into categories (name, icon, is_income, sort_order) values
  ('급여',   '💰', true, 10),
  ('용돈',   '🎁', true, 20),
  ('환급/정산', '↩️', true, 30),
  ('기타수입', '➕', true, 100)
on conflict (name, is_income) do nothing;
