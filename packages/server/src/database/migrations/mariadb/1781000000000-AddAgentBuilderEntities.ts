import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAgentBuilderEntities1781000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. builder_session
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`builder_session\` (
                \`id\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`organizationId\` varchar(255) NOT NULL,
                \`userId\` varchar(255) NOT NULL,
                \`title\` varchar(255) NOT NULL DEFAULT 'Trợ lý mới',
                \`state\` varchar(32) NOT NULL DEFAULT 'collecting',
                \`currentSpecRevisionId\` varchar(36),
                \`currentRevisionNo\` int NOT NULL DEFAULT 0,
                \`buildIntent\` text,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)
        await queryRunner.query(`CREATE INDEX \`IDX_builder_session_workspaceId\` ON \`builder_session\` (\`workspaceId\`);`)

        // 2. builder_message
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`builder_message\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(36) NOT NULL,
                \`role\` varchar(32) NOT NULL,
                \`clientMessageId\` varchar(255) NOT NULL,
                \`content\` text NOT NULL,
                \`specRevisionId\` varchar(36),
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX \`IDX_builder_message_session_client_id\` ON \`builder_message\` (\`sessionId\`, \`clientMessageId\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_builder_message_sessionId\` ON \`builder_message\` (\`sessionId\`);`)

        // 3. agent_spec_revision
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`agent_spec_revision\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(36) NOT NULL,
                \`revisionNo\` int NOT NULL,
                \`spec\` text NOT NULL,
                \`assumptions\` text NOT NULL,
                \`missingFields\` text NOT NULL,
                \`reasonCodes\` text NOT NULL,
                \`specReady\` tinyint(1) NOT NULL DEFAULT 0,
                \`buildReady\` tinyint(1) NOT NULL DEFAULT 0,
                \`testReady\` tinyint(1) NOT NULL DEFAULT 0,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX \`IDX_agent_spec_revision_session_no\` ON \`agent_spec_revision\` (\`sessionId\`, \`revisionNo\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_agent_spec_revision_sessionId\` ON \`agent_spec_revision\` (\`sessionId\`);`)

        // 4. agent_draft_revision
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`agent_draft_revision\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(36) NOT NULL,
                \`specRevisionId\` varchar(36) NOT NULL,
                \`buildKey\` varchar(255) NOT NULL,
                \`flowId\` varchar(36) NOT NULL,
                \`planId\` varchar(255) NOT NULL,
                \`templateId\` varchar(255) NOT NULL,
                \`templateVersion\` varchar(32) NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX \`IDX_agent_draft_revision_buildKey\` ON \`agent_draft_revision\` (\`buildKey\`);`
        )
        await queryRunner.query(`CREATE INDEX \`IDX_agent_draft_revision_sessionId\` ON \`agent_draft_revision\` (\`sessionId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_agent_draft_revision_flowId\` ON \`agent_draft_revision\` (\`flowId\`);`)

        // 5. build_job
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`build_job\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`specRevisionId\` varchar(36) NOT NULL,
                \`buildKey\` varchar(255) NOT NULL,
                \`state\` varchar(32) NOT NULL DEFAULT 'pending',
                \`attempts\` int NOT NULL DEFAULT 0,
                \`maxAttempts\` int NOT NULL DEFAULT 3,
                \`flowId\` varchar(36),
                \`error\` text,
                \`cancelReason\` text,
                \`timeoutMs\` int NOT NULL DEFAULT 30000,
                \`startedDate\` datetime(6),
                \`completedDate\` datetime(6),
                \`cancelledDate\` datetime(6),
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)
        await queryRunner.query(`CREATE UNIQUE INDEX \`IDX_build_job_buildKey\` ON \`build_job\` (\`buildKey\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_build_job_sessionId\` ON \`build_job\` (\`sessionId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_build_job_workspaceId\` ON \`build_job\` (\`workspaceId\`);`)

        // 6. builder_audit_log
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`builder_audit_log\` (
                \`id\` varchar(36) NOT NULL,
                \`sessionId\` varchar(36) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`userId\` varchar(255),
                \`action\` varchar(64) NOT NULL,
                \`status\` varchar(32) NOT NULL,
                \`targetRevisionNo\` int,
                \`flowId\` varchar(36),
                \`metadata\` text,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
        `)
        await queryRunner.query(`CREATE INDEX \`IDX_builder_audit_log_sessionId\` ON \`builder_audit_log\` (\`sessionId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_builder_audit_log_workspaceId\` ON \`builder_audit_log\` (\`workspaceId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_builder_audit_log_userId\` ON \`builder_audit_log\` (\`userId\`);`)
        await queryRunner.query(`CREATE INDEX \`IDX_builder_audit_log_action\` ON \`builder_audit_log\` (\`action\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`builder_audit_log\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`build_job\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`agent_draft_revision\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`agent_spec_revision\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`builder_message\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`builder_session\`;`)
    }
}
