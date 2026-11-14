import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentBuilderEntities1781000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "builder_session" (
                "id" varchar PRIMARY KEY NOT NULL,
                "workspaceId" varchar NOT NULL,
                "organizationId" varchar NOT NULL,
                "userId" varchar NOT NULL,
                "title" varchar NOT NULL DEFAULT 'Trợ lý mới',
                "state" varchar NOT NULL DEFAULT 'collecting',
                "currentSpecRevisionId" varchar,
                "currentRevisionNo" integer NOT NULL DEFAULT 0,
                "buildIntent" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "builder_message" (
                "id" varchar PRIMARY KEY NOT NULL,
                "sessionId" varchar NOT NULL,
                "role" varchar NOT NULL,
                "clientMessageId" varchar NOT NULL,
                "content" text NOT NULL,
                "specRevisionId" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "idx_builder_message_session_client_id" ON "builder_message" ("sessionId", "clientMessageId");`
        )
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "agent_spec_revision" (
                "id" varchar PRIMARY KEY NOT NULL,
                "sessionId" varchar NOT NULL,
                "revisionNo" integer NOT NULL,
                "spec" text NOT NULL,
                "assumptions" text NOT NULL,
                "missingFields" text NOT NULL,
                "reasonCodes" text NOT NULL,
                "specReady" boolean NOT NULL DEFAULT 0,
                "buildReady" boolean NOT NULL DEFAULT 0,
                "testReady" boolean NOT NULL DEFAULT 0,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_spec_revision_session_no" ON "agent_spec_revision" ("sessionId", "revisionNo");`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "agent_spec_revision";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "builder_message";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "builder_session";`)
    }
}
