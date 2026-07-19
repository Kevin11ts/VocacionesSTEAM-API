import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchemaChange1784498212423 implements MigrationInterface {
  name = 'SchemaChange1784498212423';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "saved_universities" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "careerName" character varying NOT NULL,
                "universityName" character varying NOT NULL,
                "location" character varying,
                "relationshipExplanation" text,
                "keyDates" text,
                "studyPlan" text,
                "officialWebsite" character varying,
                "latitude" double precision,
                "longitude" double precision,
                "rating" double precision,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid,
                CONSTRAINT "PK_ac59c93b6a8fea7d03b9984e544" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "saved_courses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "provider" character varying NOT NULL,
                "courseName" character varying NOT NULL,
                "durationHours" integer NOT NULL,
                "isFree" boolean NOT NULL,
                "description" text NOT NULL,
                "syllabus" text NOT NULL,
                "link" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid,
                CONSTRAINT "PK_dac95be180e38b3fcaa2395a0f3" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "user_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "darkMode" boolean NOT NULL DEFAULT false,
                "language" character varying NOT NULL DEFAULT 'Español',
                "pushEnabled" boolean NOT NULL DEFAULT true,
                "emailEnabled" boolean NOT NULL DEFAULT true,
                "emailMarketing" boolean NOT NULL DEFAULT false,
                "weeklySummary" boolean NOT NULL DEFAULT true,
                "newCareersAlerts" boolean NOT NULL DEFAULT true,
                "testReminders" boolean NOT NULL DEFAULT true,
                "communityMessages" boolean NOT NULL DEFAULT false,
                "notificationsConfiguredAt" TIMESTAMP WITH TIME ZONE,
                "userId" uuid,
                CONSTRAINT "REL_986a2b6d3c05eb4091bb8066f7" UNIQUE ("userId"),
                CONSTRAINT "PK_00f004f5922a0744d174530d639" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."users_role_enum" AS ENUM('student', 'admin')
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "password" character varying,
                "fullname" character varying NOT NULL,
                "role" "public"."users_role_enum" NOT NULL DEFAULT 'student',
                "avatarUrl" character varying,
                "title" character varying NOT NULL DEFAULT 'Explorador STEAM',
                "bio" text,
                "birthDate" character varying,
                "phone" character varying,
                "location" character varying,
                "github" character varying,
                "linkedin" character varying,
                "acceptedTermsVersion" character varying,
                "acceptedTermsAt" TIMESTAMP,
                "isEmailVerified" boolean NOT NULL DEFAULT false,
                "googleId" character varying,
                "failedLoginAttempts" integer NOT NULL DEFAULT '0',
                "lockUntil" TIMESTAMP,
                "isBanned" boolean NOT NULL DEFAULT false,
                "suspendedUntil" TIMESTAMP,
                "suspensionReason" text,
                "hashedRefreshToken" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "ai_recommendations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "locationInput" character varying NOT NULL,
                "universities" jsonb NOT NULL,
                "aiGeneralAdvice" text NOT NULL,
                "testId" uuid,
                CONSTRAINT "REL_eed172d5093a6891a6848231db" UNIQUE ("testId"),
                CONSTRAINT "PK_57aa33b4356a91e94e98bcd3f2d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "vocational_tests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "clientSubmissionId" uuid,
                "testName" character varying,
                "answers" jsonb NOT NULL,
                "profileScores" jsonb NOT NULL,
                "dominantTraits" character varying NOT NULL,
                "profile" jsonb,
                "completedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid,
                CONSTRAINT "PK_36c12f5423ce6b38dde836f8615" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_vocational_tests_client_submission" ON "vocational_tests" ("clientSubmissionId")
        `);
    await queryRunner.query(`
            CREATE TABLE "vocation_catalog" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "axis" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text NOT NULL,
                "skills" jsonb NOT NULL DEFAULT '[]',
                "icon" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c2d77bd142d4c3ba3fcb9390290" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "user_histories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "clientSubmissionId" uuid,
                "profileAppliedAt" TIMESTAMP WITH TIME ZONE,
                "userId" uuid NOT NULL,
                "activityType" character varying NOT NULL,
                "activityId" character varying NOT NULL,
                "results" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_75bd7cc95b4e5d7e557e81adffb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_user_histories_client_submission" ON "user_histories" ("clientSubmissionId")
        `);
    await queryRunner.query(`
            CREATE TABLE "universities" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "location" jsonb,
                "address" character varying,
                "website" character varying,
                "steamPrograms" jsonb,
                "programsVerifiedAt" TIMESTAMP,
                "programsVerificationSource" character varying,
                "costTier" character varying,
                "tuitionRange" character varying,
                "rating" double precision,
                "modality" character varying,
                "admissionDates" character varying,
                "aiEnrichedAt" TIMESTAMP,
                "aiEnrichmentStatus" character varying,
                "aiEnrichmentError" text,
                "aiEnrichmentSource" character varying,
                "googlePlaceId" character varying,
                "source" character varying,
                "institutionType" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8da52f2cee6b407559fdbabf59e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "university_match_cache" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "cacheKey" character varying NOT NULL,
                "aiAdjustments" jsonb NOT NULL,
                "provider" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_fd6a546a03f021f3d86d75245a0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_44007db78809ee13980d9b2ec3" ON "university_match_cache" ("userId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4c712f1f68b321ddb13dada9df" ON "university_match_cache" ("cacheKey")
        `);
    await queryRunner.query(`
            CREATE TABLE "support_tickets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "reference" character varying(32) NOT NULL,
                "userId" uuid NOT NULL,
                "category" character varying(30) NOT NULL,
                "subject" character varying(140) NOT NULL,
                "message" text NOT NULL,
                "status" character varying(20) NOT NULL DEFAULT 'open',
                "attachmentName" character varying(255),
                "attachmentMimeType" character varying(100),
                "attachmentSize" integer,
                "attachmentData" bytea,
                "adminReply" text,
                "repliedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_942e8d8f5df86100471d2324643" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_support_tickets_reference" ON "support_tickets" ("reference")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_support_tickets_user" ON "support_tickets" ("userId")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_support_tickets_status" ON "support_tickets" ("status")
        `);
    await queryRunner.query(`
            CREATE TABLE "options" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "text" character varying NOT NULL,
                "letter" character varying(1) NOT NULL,
                "steamTrait" character varying NOT NULL,
                "questionId" uuid,
                CONSTRAINT "PK_d232045bdb5c14d932fba18d957" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "questions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "text" character varying NOT NULL,
                "order" integer NOT NULL DEFAULT '1',
                "status" character varying NOT NULL DEFAULT 'activo',
                CONSTRAINT "PK_08a6d4b0f49ff300bf3a0ca60ac" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "push_subscriptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "endpoint" text NOT NULL,
                "p256dh" text NOT NULL,
                "auth" text NOT NULL,
                "userAgent" character varying(500),
                "failureCount" integer NOT NULL DEFAULT '0',
                "lastSuccessAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_757fc8f00c34f66832668dc2e53" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_push_subscriptions_user" ON "push_subscriptions" ("userId")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_push_subscriptions_endpoint" ON "push_subscriptions" ("endpoint")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."otp_codes_purpose_enum" AS ENUM('register', 'recovery', 'login')
        `);
    await queryRunner.query(`
            CREATE TABLE "otp_codes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "code" character varying NOT NULL,
                "purpose" "public"."otp_codes_purpose_enum" NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_9d0487965ac1837d57fec4d6a26" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_deliveries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "channel" character varying(20) NOT NULL,
                "type" character varying(40) NOT NULL,
                "status" character varying(20) NOT NULL,
                "dedupeKey" character varying(180),
                "recipient" character varying(255),
                "error" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_81daeff81f237bd384f7cfc4a4c" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_notification_deliveries_user" ON "notification_deliveries" ("userId")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_notification_deliveries_dedupe" ON "notification_deliveries" ("dedupeKey")
            WHERE "dedupeKey" IS NOT NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_configs" (
                "key" character varying(50) NOT NULL,
                "value" jsonb NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c4f19d9df5bb60cbe6670c16810" PRIMARY KEY ("key")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "notification_campaigns" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" character varying(120) NOT NULL,
                "message" text NOT NULL,
                "url" character varying(500),
                "category" character varying(40) NOT NULL,
                "channels" jsonb NOT NULL,
                "sentBy" uuid,
                "status" character varying(20) NOT NULL DEFAULT 'processing',
                "recipients" integer NOT NULL DEFAULT '0',
                "delivered" integer NOT NULL DEFAULT '0',
                "failed" integer NOT NULL DEFAULT '0',
                "sentAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6bd3e0649c6f3fb8caa63dd39ea" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "complementary_tests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "testId" character varying NOT NULL,
                "testName" character varying NOT NULL,
                "questions" jsonb NOT NULL DEFAULT '[]',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_08047f0c8091831965597bd07ed" UNIQUE ("testId"),
                CONSTRAINT "PK_c7851e4ab43d3ae611e4e0e7ea4" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "career_simulators" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "slug" character varying NOT NULL,
                "careerName" character varying NOT NULL,
                "steamArea" character varying NOT NULL,
                "estimatedDurationMinutes" integer NOT NULL,
                "difficulty" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'activo',
                "colorToken" character varying NOT NULL,
                "icon" character varying NOT NULL,
                "shortDescription" text NOT NULL,
                "tags" jsonb NOT NULL DEFAULT '[]',
                "steps" jsonb NOT NULL DEFAULT '[]',
                "completionConfig" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_9fccf8c30591d339cd16e32943a" UNIQUE ("slug"),
                CONSTRAINT "PK_88a580d3291de712cf43487b2c7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "career_catalog" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "axis" character varying NOT NULL,
                "careerName" character varying NOT NULL,
                "studyPlanHighlights" jsonb NOT NULL DEFAULT '[]',
                "careerFields" jsonb NOT NULL DEFAULT '[]',
                "relatedSimulatorSlug" character varying,
                "icon" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_8f237b1d44dbeab32e6200a2d44" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "calibration_results" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "clientSubmissionId" uuid,
                "profileAppliedAt" TIMESTAMP WITH TIME ZONE,
                "moduleId" character varying NOT NULL,
                "answers" jsonb NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid,
                CONSTRAINT "PK_7ce34f867376a1e3e76e6e83036" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_calibration_results_client_submission" ON "calibration_results" ("clientSubmissionId")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."calibration_decks_status_enum" AS ENUM('activo', 'inactivo')
        `);
    await queryRunner.query(`
            CREATE TABLE "calibration_decks" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "moduleId" character varying NOT NULL,
                "title" character varying NOT NULL,
                "subtitle" text,
                "icon" character varying NOT NULL DEFAULT 'sparkles',
                "order" integer NOT NULL DEFAULT '0',
                "status" "public"."calibration_decks_status_enum" NOT NULL DEFAULT 'activo',
                "cards" jsonb NOT NULL DEFAULT '[]',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_76540204cfc8919b3ea0569cde2" UNIQUE ("moduleId"),
                CONSTRAINT "PK_671086681441bf98d281e181f76" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "axis_meta" (
                "axis" character varying NOT NULL,
                "label" character varying NOT NULL,
                "adjective" character varying NOT NULL,
                "icon" character varying NOT NULL,
                "archetype" character varying NOT NULL,
                "strengthTitle" character varying NOT NULL,
                "strengthDesc" text NOT NULL,
                "workStyle" jsonb NOT NULL DEFAULT '[]',
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c782d0bd573f7ce42dab97cf998" PRIMARY KEY ("axis")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "algorithm_runs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "algorithm" character varying NOT NULL,
                "engineVersion" character varying,
                "profileVersion" character varying,
                "userId" uuid,
                "executionTimeMs" double precision NOT NULL,
                "breakdown" jsonb,
                "result" jsonb NOT NULL,
                "aiUsed" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e09b48f6da73786387b8e097e01" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_7701b88ba620172373efa6deaa" ON "algorithm_runs" ("algorithm")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_d38bd2e3c22f5dff0bcd8df3d6" ON "algorithm_runs" ("userId")
        `);
    await queryRunner.query(`
            CREATE TABLE "ai_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "studentName" character varying NOT NULL,
                "detectedProfile" character varying,
                "latency" double precision NOT NULL,
                "success" boolean NOT NULL,
                "errorMessage" text,
                "tokensConsumed" integer NOT NULL DEFAULT '0',
                "provider" character varying NOT NULL DEFAULT 'Groq',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ac5fbcd483f233f6d9a4cf0b49c" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "saved_universities"
            ADD CONSTRAINT "FK_bd1ddec4bb5536da5ff7677a6b3" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "saved_courses"
            ADD CONSTRAINT "FK_9749cf56333a2af8c611a452709" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_settings"
            ADD CONSTRAINT "FK_986a2b6d3c05eb4091bb8066f78" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "ai_recommendations"
            ADD CONSTRAINT "FK_eed172d5093a6891a6848231db1" FOREIGN KEY ("testId") REFERENCES "vocational_tests"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "vocational_tests"
            ADD CONSTRAINT "FK_7fc072fc461e5f7c30ca220e2b4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_histories"
            ADD CONSTRAINT "FK_d160dea7f99bef53820cafb645a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "support_tickets"
            ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "options"
            ADD CONSTRAINT "FK_46b668c49a6c4154d4643d875a5" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "push_subscriptions"
            ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notification_deliveries"
            ADD CONSTRAINT "notification_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "calibration_results"
            ADD CONSTRAINT "FK_e5012425b2b66c01ce5a5a64d1e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "calibration_results" DROP CONSTRAINT "FK_e5012425b2b66c01ce5a5a64d1e"
        `);
    await queryRunner.query(`
            ALTER TABLE "notification_deliveries" DROP CONSTRAINT "notification_deliveries_userId_fkey"
        `);
    await queryRunner.query(`
            ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_userId_fkey"
        `);
    await queryRunner.query(`
            ALTER TABLE "options" DROP CONSTRAINT "FK_46b668c49a6c4154d4643d875a5"
        `);
    await queryRunner.query(`
            ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_userId_fkey"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_histories" DROP CONSTRAINT "FK_d160dea7f99bef53820cafb645a"
        `);
    await queryRunner.query(`
            ALTER TABLE "vocational_tests" DROP CONSTRAINT "FK_7fc072fc461e5f7c30ca220e2b4"
        `);
    await queryRunner.query(`
            ALTER TABLE "ai_recommendations" DROP CONSTRAINT "FK_eed172d5093a6891a6848231db1"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_settings" DROP CONSTRAINT "FK_986a2b6d3c05eb4091bb8066f78"
        `);
    await queryRunner.query(`
            ALTER TABLE "saved_courses" DROP CONSTRAINT "FK_9749cf56333a2af8c611a452709"
        `);
    await queryRunner.query(`
            ALTER TABLE "saved_universities" DROP CONSTRAINT "FK_bd1ddec4bb5536da5ff7677a6b3"
        `);
    await queryRunner.query(`
            DROP TABLE "ai_logs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d38bd2e3c22f5dff0bcd8df3d6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7701b88ba620172373efa6deaa"
        `);
    await queryRunner.query(`
            DROP TABLE "algorithm_runs"
        `);
    await queryRunner.query(`
            DROP TABLE "axis_meta"
        `);
    await queryRunner.query(`
            DROP TABLE "calibration_decks"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."calibration_decks_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_calibration_results_client_submission"
        `);
    await queryRunner.query(`
            DROP TABLE "calibration_results"
        `);
    await queryRunner.query(`
            DROP TABLE "career_catalog"
        `);
    await queryRunner.query(`
            DROP TABLE "career_simulators"
        `);
    await queryRunner.query(`
            DROP TABLE "complementary_tests"
        `);
    await queryRunner.query(`
            DROP TABLE "notification_campaigns"
        `);
    await queryRunner.query(`
            DROP TABLE "notification_configs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_notification_deliveries_dedupe"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_notification_deliveries_user"
        `);
    await queryRunner.query(`
            DROP TABLE "notification_deliveries"
        `);
    await queryRunner.query(`
            DROP TABLE "otp_codes"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."otp_codes_purpose_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_push_subscriptions_endpoint"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_push_subscriptions_user"
        `);
    await queryRunner.query(`
            DROP TABLE "push_subscriptions"
        `);
    await queryRunner.query(`
            DROP TABLE "questions"
        `);
    await queryRunner.query(`
            DROP TABLE "options"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_support_tickets_status"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_support_tickets_user"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_support_tickets_reference"
        `);
    await queryRunner.query(`
            DROP TABLE "support_tickets"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4c712f1f68b321ddb13dada9df"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_44007db78809ee13980d9b2ec3"
        `);
    await queryRunner.query(`
            DROP TABLE "university_match_cache"
        `);
    await queryRunner.query(`
            DROP TABLE "universities"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_user_histories_client_submission"
        `);
    await queryRunner.query(`
            DROP TABLE "user_histories"
        `);
    await queryRunner.query(`
            DROP TABLE "vocation_catalog"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."UQ_vocational_tests_client_submission"
        `);
    await queryRunner.query(`
            DROP TABLE "vocational_tests"
        `);
    await queryRunner.query(`
            DROP TABLE "ai_recommendations"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."users_role_enum"
        `);
    await queryRunner.query(`
            DROP TABLE "user_settings"
        `);
    await queryRunner.query(`
            DROP TABLE "saved_courses"
        `);
    await queryRunner.query(`
            DROP TABLE "saved_universities"
        `);
  }
}
