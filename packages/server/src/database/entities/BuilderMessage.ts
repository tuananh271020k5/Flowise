/* eslint-disable */
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, Unique } from 'typeorm'

@Entity('builder_message')
@Unique(['sessionId', 'clientMessageId'])
export class BuilderMessage {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column()
    sessionId: string

    @Column()
    role: 'user' | 'assistant' | 'system'

    @Column()
    clientMessageId: string

    @Column({ type: 'text' })
    content: string

    @Column({ nullable: true, type: 'varchar' })
    specRevisionId?: string | null

    @CreateDateColumn()
    createdDate: Date
}
