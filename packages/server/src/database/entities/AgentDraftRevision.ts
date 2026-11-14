/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm'

/**
 * Bản ghi ánh xạ và phiên bản draft được sinh ra từ AgentSpecRevision (PH2-T08).
 * Đảm bảo tính bất biến (immutable) và idempotency cho quá trình build.
 */
@Entity('agent_draft_revision')
export class AgentDraftRevision {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column()
    sessionId: string

    @Index()
    @Column()
    specRevisionId: string

    @Index({ unique: true })
    @Column({ unique: true })
    buildKey: string // format: `${sessionId}:${specRevisionId}` hoặc custom key

    @Index()
    @Column()
    flowId: string // Trỏ tới ChatFlow.id

    @Column()
    planId: string

    @Column()
    templateId: string

    @Column()
    templateVersion: string

    @CreateDateColumn()
    createdDate: Date
}
