-- Soporte real, Web Push y bitácora de notificaciones.
-- Seguro para ejecutar más de una vez en PostgreSQL.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS "notificationsConfiguredAt" timestamptz;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference varchar(32) NOT NULL,
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category varchar(30) NOT NULL,
  subject varchar(140) NOT NULL,
  message text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  "attachmentName" varchar(255),
  "attachmentMimeType" varchar(100),
  "attachmentSize" integer,
  "attachmentData" bytea,
  "adminReply" text,
  "repliedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_support_tickets_reference"
  ON support_tickets(reference);
CREATE INDEX IF NOT EXISTS "IDX_support_tickets_user" ON support_tickets("userId");
CREATE INDEX IF NOT EXISTS "IDX_support_tickets_status" ON support_tickets(status);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  "userAgent" varchar(500),
  "failureCount" integer NOT NULL DEFAULT 0,
  "lastSuccessAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_push_subscriptions_endpoint"
  ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS "IDX_push_subscriptions_user"
  ON push_subscriptions("userId");

CREATE TABLE IF NOT EXISTS notification_configs (
  key varchar(50) PRIMARY KEY,
  value jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel varchar(20) NOT NULL,
  type varchar(40) NOT NULL,
  status varchar(20) NOT NULL,
  "dedupeKey" varchar(180),
  recipient varchar(255),
  error text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notification_deliveries_dedupe"
  ON notification_deliveries("dedupeKey")
  WHERE "dedupeKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_notification_deliveries_user"
  ON notification_deliveries("userId");

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title varchar(120) NOT NULL,
  message text NOT NULL,
  url varchar(500),
  category varchar(40) NOT NULL,
  channels jsonb NOT NULL,
  "sentBy" uuid,
  status varchar(20) NOT NULL DEFAULT 'processing',
  recipients integer NOT NULL DEFAULT 0,
  delivered integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  "sentAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
