-- Idempotencia para la cola offline de la PWA.
-- Seguro para ejecutar más de una vez en PostgreSQL.
ALTER TABLE vocational_tests
  ADD COLUMN IF NOT EXISTS "clientSubmissionId" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vocational_tests_client_submission"
  ON vocational_tests ("clientSubmissionId")
  WHERE "clientSubmissionId" IS NOT NULL;

ALTER TABLE calibration_results
  ADD COLUMN IF NOT EXISTS "clientSubmissionId" uuid,
  ADD COLUMN IF NOT EXISTS "profileAppliedAt" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_calibration_results_client_submission"
  ON calibration_results ("clientSubmissionId")
  WHERE "clientSubmissionId" IS NOT NULL;

ALTER TABLE user_histories
  ADD COLUMN IF NOT EXISTS "clientSubmissionId" uuid,
  ADD COLUMN IF NOT EXISTS "profileAppliedAt" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_histories_client_submission"
  ON user_histories ("clientSubmissionId")
  WHERE "clientSubmissionId" IS NOT NULL;
