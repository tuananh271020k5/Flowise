/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

export type BuildJobState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Entity theo dõi vòng đời tác vụ build của Agent Builder (PH2-T09).
 * Quản lý trạng thái, timeout, retry attempts và hủy tác vụ (superseded).
 */
@Entity('build_job')
export class BuildJob {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column()
    sessionId: string

    @Index()
    @Column()
    workspaceId: string

    @Index()
    @Column()
    specRevisionId: string

    @Index({ unique: true })
    @Column({ unique: true })
    buildKey: string

    @Column({ default: 'pending' })
    state: BuildJobState

    @Column({ type: 'integer', default: 0 })
    attempts: number

    @Column({ type: 'integer', default: 3 })
    maxAttempts: number

    @Index()
    @Column({ nullable: true, type: 'varchar' })
    flowId?: string | null

    @Column({ nullable: true, type: 'text' })
    error?: string | null

    @Column({ nullable: true, type: 'text' })
    cancelReason?: string | null

    @Column({ type: 'integer', default: 30000 })
    timeoutMs: number

    @Column({ nullable: true, type: 'datetime' })
    startedDate?: Date | null

    @Column({ nullable: true, type: 'datetime' })
    completedDate?: Date | null

    @Column({ nullable: true, type: 'datetime' })
    cancelledDate?: Date | null

    @CreateDateColumn()
    createdDate: Date

    @UpdateDateColumn()
    updatedDate: Date
}
