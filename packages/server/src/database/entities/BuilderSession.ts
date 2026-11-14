/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

@Entity('builder_session')
export class BuilderSession {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column()
    workspaceId: string

    @Column()
    organizationId: string

    @Column()
    userId: string

    @Column({ default: 'Trợ lý mới' })
    title: string

    @Column({ default: 'collecting' })
    state: string // 'collecting' | 'ready' | 'building' | 'testing' | 'completed'

    @Column({ nullable: true, type: 'varchar' })
    currentSpecRevisionId?: string | null

    @Column({ type: 'integer', default: 0 })
    currentRevisionNo: number

    @CreateDateColumn()
    createdDate: Date

    @UpdateDateColumn()
    updatedDate: Date
}
