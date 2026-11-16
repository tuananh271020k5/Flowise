/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm'

export type AuditActionType =
    | 'SESSION_CREATED'
    | 'REVISION_CREATED'
    | 'BUILD_EXECUTED'
    | 'EVALUATION_RUN'
    | 'ROLLBACK_EXECUTED'
    | 'AGENT_PUBLISHED'
    | 'AGENT_UNPUBLISHED'
    | 'DATA_RETENTION_PURGE'

export type AuditStatusType = 'SUCCESS' | 'FAILED' | 'REJECTED'

/**
 * Bản ghi kiểm toán (Audit Log) theo dõi toàn bộ hành vi trọng yếu của Agent Builder (PH5-T02).
 * Hỗ trợ truy vết, kiểm soát tuân thủ và phân quyền cách ly theo workspace.
 */
@Entity('builder_audit_log')
export class BuilderAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column()
    sessionId: string

    @Index()
    @Column()
    workspaceId: string

    @Index()
    @Column({ nullable: true })
    userId?: string

    @Index()
    @Column()
    action: AuditActionType

    @Column()
    status: AuditStatusType

    @Column({ nullable: true })
    targetRevisionNo?: number

    @Column({ nullable: true })
    flowId?: string

    @Column({ nullable: true, type: 'text' })
    metadata?: string // JSON string chứa chi tiết kiểm toán (lý do, tỷ lệ pass, ghi chú...)

    @CreateDateColumn()
    createdDate: Date
}
