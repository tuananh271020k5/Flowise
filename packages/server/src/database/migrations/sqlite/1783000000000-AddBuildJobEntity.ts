import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddBuildJobEntity1783000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "build_job" (
                "id" varchar PRIMARY KEY NOT NULL,
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
                "startedDate" datetime,
                "completedDate" datetime,
                "cancelledDate" datetime,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now')));`
        )
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_build_job_build_key" ON "build_job" ("buildKey");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_build_job_session_id" ON "build_job" ("sessionId");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_build_job_workspace_id" ON "build_job" ("workspaceId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "build_job";`)
    }
}
