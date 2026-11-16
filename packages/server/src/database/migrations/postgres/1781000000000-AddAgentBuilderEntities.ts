import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentBuilderEntities1781000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. builder_session
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS builder_session (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "workspaceId" varchar NOT NULL,
                "organizationId" varchar NOT NULL,
                "userId" varchar NOT NULL,
                "title" varchar NOT NULL DEFAULT 'Trợ lý mới',
                "state" varchar NOT NULL DEFAULT 'collecting',
                "currentSpecRevisionId" varchar,
                "currentRevisionNo" integer NOT NULL DEFAULT 0,
                "buildIntent" text,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_builder_session" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_builder_session_workspaceId" ON builder_session ("workspaceId");`)

        // 2. builder_message
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS builder_message (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "role" varchar NOT NULL,
                "clientMessageId" varchar NOT NULL,
                "content" text NOT NULL,
                "specRevisionId" varchar,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_builder_message" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_builder_message_session_client_id" ON builder_message ("sessionId", "clientMessageId");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_builder_message_sessionId" ON builder_message ("sessionId");`)

        // 3. agent_spec_revision
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS agent_spec_revision (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "revisionNo" integer NOT NULL,
                "spec" text NOT NULL,
                "assumptions" text NOT NULL,
                "missingFields" text NOT NULL,
                "reasonCodes" text NOT NULL,
                "specReady" boolean NOT NULL DEFAULT false,
                "buildReady" boolean NOT NULL DEFAULT false,
                "testReady" boolean NOT NULL DEFAULT false,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_agent_spec_revision" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_spec_revision_session_no" ON agent_spec_revision ("sessionId", "revisionNo");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_spec_revision_sessionId" ON agent_spec_revision ("sessionId");`)

        // 4. agent_draft_revision
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS agent_draft_revision (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "specRevisionId" varchar NOT NULL,
                "buildKey" varchar NOT NULL,
                "flowId" varchar NOT NULL,
                "planId" varchar NOT NULL,
                "templateId" varchar NOT NULL,
                "templateVersion" varchar NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_agent_draft_revision" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_draft_revision_buildKey" ON agent_draft_revision ("buildKey");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_draft_revision_sessionId" ON agent_draft_revision ("sessionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_draft_revision_flowId" ON agent_draft_revision ("flowId");`)

        // 5. build_job
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS build_job (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "specRevisionId" varchar NOT NULL,
                "buildKey" varchar NOT NULL,
                "state" varchar NOT NULL DEFAULT 'pending',
                "attempts" integer NOT NULL DEFAULT 0,
                "maxAttempts" integer NOT NULL DEFAULT 3,
                "flowId" varchar,
                "error" text,
                "cancelReason" text,
                "timeoutMs" integer NOT NULL DEFAULT 30000,
                "startedDate" timestamp,
                "completedDate" timestamp,
                "cancelledDate" timestamp,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                "updatedDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_build_job" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_build_job_buildKey" ON build_job ("buildKey");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_build_job_sessionId" ON build_job ("sessionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_build_job_workspaceId" ON build_job ("workspaceId");`)

        // 6. builder_audit_log
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS builder_audit_log (
                id uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessionId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" varchar,
                "action" varchar NOT NULL,
                "status" varchar NOT NULL,
                "targetRevisionNo" integer,
                "flowId" varchar,
                "metadata" text,
                "createdDate" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_builder_audit_log" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_builder_audit_log_sessionId" ON builder_audit_log ("sessionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_builder_audit_log_workspaceId" ON builder_audit_log ("workspaceId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_builder_audit_log_userId" ON builder_audit_log ("userId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_builder_audit_log_action" ON builder_audit_log ("action");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS builder_audit_log CASCADE;`)
        await queryRunner.query(`DROP TABLE IF EXISTS build_job CASCADE;`)
        await queryRunner.query(`DROP TABLE IF EXISTS agent_draft_revision CASCADE;`)
        await queryRunner.query(`DROP TABLE IF EXISTS agent_spec_revision CASCADE;`)
        await queryRunner.query(`DROP TABLE IF EXISTS builder_message CASCADE;`)
        await queryRunner.query(`DROP TABLE IF EXISTS builder_session CASCADE;`)
    }
}
