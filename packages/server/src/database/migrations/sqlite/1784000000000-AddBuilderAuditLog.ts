import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddBuilderAuditLog1784000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "builder_audit_log" (
                "id" varchar PRIMARY KEY NOT NULL,
                "sessionId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "userId" varchar,
                "action" varchar NOT NULL,
                "status" varchar NOT NULL,
                "targetRevisionNo" integer,
                "flowId" varchar,
                "metadata" text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_builder_audit_log_session_id" ON "builder_audit_log" ("sessionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_builder_audit_log_workspace_id" ON "builder_audit_log" ("workspaceId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_builder_audit_log_user_id" ON "builder_audit_log" ("userId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_builder_audit_log_action" ON "builder_audit_log" ("action");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "builder_audit_log";`)
    }
}
