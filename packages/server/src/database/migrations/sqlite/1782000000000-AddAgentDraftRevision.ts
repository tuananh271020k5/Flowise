import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentDraftRevision1782000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "agent_draft_revision" (
                "id" varchar PRIMARY KEY NOT NULL,
                "sessionId" varchar NOT NULL,
                "specRevisionId" varchar NOT NULL,
                "buildKey" varchar NOT NULL,
                "flowId" varchar NOT NULL,
                "planId" varchar NOT NULL,
                "templateId" varchar NOT NULL,
                "templateVersion" varchar NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "idx_agent_draft_revision_build_key" ON "agent_draft_revision" ("buildKey");`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_draft_revision_session_id" ON "agent_draft_revision" ("sessionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agent_draft_revision_flow_id" ON "agent_draft_revision" ("flowId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "agent_draft_revision";`)
    }
}
