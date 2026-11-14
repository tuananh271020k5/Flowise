/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, Unique } from 'typeorm'

@Entity('agent_spec_revision')
@Unique(['sessionId', 'revisionNo'])
export class AgentSpecRevision {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column()
    sessionId: string

    @Column({ type: 'integer' })
    revisionNo: number

    @Column({ type: 'text' })
    spec: string // JSON-serialized AgentSpec

    @Column({ type: 'text' })
    assumptions: string // JSON-serialized string[]

    @Column({ type: 'text' })
    missingFields: string // JSON-serialized string[]

    @Column({ type: 'text' })
    reasonCodes: string // JSON-serialized string[]

    @Column({ default: false })
    specReady: boolean

    @Column({ default: false })
    buildReady: boolean

    @Column({ default: false })
    testReady: boolean

    @CreateDateColumn()
    createdDate: Date
}
