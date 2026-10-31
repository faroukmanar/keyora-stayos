ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservation_quote;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservation_rate_plan;
ALTER TABLE reservations DROP COLUMN IF EXISTS rate_plan_id;
ALTER TABLE reservations DROP COLUMN IF EXISTS quote_id;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS discount_codes;
DROP TABLE IF EXISTS taxes_fees;
DROP TABLE IF EXISTS rate_plan_calendar;
ALTER TABLE rate_plans
  DROP CONSTRAINT IF EXISTS rate_plan_cancellation,
  DROP CONSTRAINT IF EXISTS rate_plan_stay_window,
  DROP COLUMN IF EXISTS cancellation_policy_id,
  DROP COLUMN IF EXISTS stop_sell,
  DROP COLUMN IF EXISTS closed_to_departure,
  DROP COLUMN IF EXISTS closed_to_arrival,
  DROP COLUMN IF EXISTS max_stay,
  DROP COLUMN IF EXISTS min_stay;
DROP TABLE IF EXISTS cancellation_policies;
