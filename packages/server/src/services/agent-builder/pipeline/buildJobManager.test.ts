jest.mock('flowise-components', () => ({}))
jest.mock('../../../utils/getRunningExpressApp', () => ({ getRunningExpressApp: jest.fn() }))
jest.mock('../../../utils/logger', () => ({
    __esModule: true,
    default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { StatusCodes } from 'http-status-codes'
import { BuildJob } from '../../../database/entities/BuildJob'
import { BuildJobManager } from './buildJobManager'
import collectorService from '../collectorService'

function createMockRepository<T extends { id?: string }>() {
    const store = new Map<string, T>()
    let idCounter = 1

    return {
        create: jest.fn((dto: any) => ({
            id: `job-${idCounter++}`,
            createdDate: new Date(),
            updatedDate: new Date(),
            ...dto
        })),
        save: jest.fn(async (entity: any) => {
            if (!entity.id) {
                entity.id = `job-${idCounter++}`
            }
            if (!entity.createdDate) {
                entity.createdDate = new Date()
            }
            entity.updatedDate = new Date()
            store.set(entity.id, { ...entity })
            return { ...entity }
        }),
        findOneBy: jest.fn(async (query: any) => {
            for (const item of store.values()) {
                const match = Object.entries(query).every(([k, v]) => (item as any)[k] === v)
                if (match) return { ...item }
            }
            return null
        }),
        find: jest.fn(async (opts?: any) => {
            let items = Array.from(store.values())
            if (opts?.where) {
                items = items.filter((item) => Object.entries(opts.where).every(([k, v]) => (item as any)[k] === v))
            }
            return items.map((i) => ({ ...i }))
        }),
        clear: () => store.clear()
    }
}

describe('BuildJobManager Lifecycle (PH2-T09)', () => {
    let mockJobRepo: ReturnType<typeof createMockRepository<BuildJob>>
    let mockDataSource: any
    let manager: BuildJobManager

    beforeEach(() => {
        mockJobRepo = createMockRepository<BuildJob>()
        mockDataSource = {
            getRepository: jest.fn().mockImplementation((entity) => {
                if (entity === BuildJob) return mockJobRepo
                throw new Error(`Unexpected entity ${entity?.name}`)
            })
        }
        manager = new BuildJobManager(mockDataSource)
        jest.spyOn(collectorService, 'broadcastSSE').mockImplementation(jest.fn())
    })

    describe('createOrGetJob & Superseding', () => {
        it('tạo mới build job với trạng thái pending ban đầu', async () => {
            const { job, isNew } = await manager.createOrGetJob({
                sessionId: 'sess-1',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            expect(isNew).toBe(true)
            expect(job.id).toBeDefined()
            expect(job.state).toBe('pending')
            expect(job.attempts).toBe(0)
            expect(job.maxAttempts).toBe(3)
            expect(job.buildKey).toBe('sess-1:rev-1')
        })

        it('trả về job hiện có nếu cùng buildKey (Idempotency)', async () => {
            const first = await manager.createOrGetJob({
                sessionId: 'sess-1',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            const second = await manager.createOrGetJob({
                sessionId: 'sess-1',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            expect(second.isNew).toBe(false)
            expect(second.job.id).toBe(first.job.id)
        })

        it('tự động hủy job cũ đang pending hoặc running khi có revision mới thay thế (superseded)', async () => {
            const oldJob = await manager.createOrGetJob({
                sessionId: 'sess-1',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            await manager.startJob(oldJob.job.id, 'ws-1')
            const runningOld = await manager.getJobById(oldJob.job.id, 'ws-1')
            expect(runningOld.state).toBe('running')

            // Tạo job cho revision mới (rev-2)
            const newJob = await manager.createOrGetJob({
                sessionId: 'sess-1',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-2'
            })

            expect(newJob.isNew).toBe(true)

            // Kiểm tra job cũ đã bị chuyển thành cancelled
            const supersededOld = await manager.getJobById(oldJob.job.id, 'ws-1')
            expect(supersededOld.state).toBe('cancelled')
            expect(supersededOld.cancelReason).toContain('superseded')
        })
    })

    describe('Job Execution Lifecycle: start, complete, fail, cancel', () => {
        it('chuyển trạng thái running và tăng attempts khi startJob', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-2',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            const started = await manager.startJob(job.id, 'ws-1')
            expect(started.state).toBe('running')
            expect(started.attempts).toBe(1)
            expect(started.startedDate).toBeDefined()
        })

        it('từ chối startJob nếu job đã bị hủy (cancelled)', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-3',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            await manager.cancelJob(job.id, 'ws-1', 'Cancelled by test')

            await expect(manager.startJob(job.id, 'ws-1')).rejects.toMatchObject({
                statusCode: StatusCodes.CONFLICT
            })
        })

        it('từ chối startJob nếu vượt quá maxAttempts', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-4',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            job.attempts = 3
            await mockJobRepo.save(job)

            await expect(manager.startJob(job.id, 'ws-1')).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST,
                message: expect.stringContaining('vượt quá số lần thử tối đa')
            })
        })

        it('hoàn thành job thành công với completeJob', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-5',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            await manager.startJob(job.id, 'ws-1')
            const completed = await manager.completeJob(job.id, 'ws-1', 'flow-123')

            expect(completed.state).toBe('completed')
            expect(completed.flowId).toBe('flow-123')
            expect(completed.completedDate).toBeDefined()
        })

        it('đánh dấu failed và phát sự kiện SSE khi failJob', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-6',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            await manager.startJob(job.id, 'ws-1')
            const failed = await manager.failJob(job.id, 'ws-1', 'Lỗi biên dịch test')

            expect(failed.state).toBe('failed')
            expect(failed.error).toBe('Lỗi biên dịch test')
            expect(collectorService.broadcastSSE).toHaveBeenCalledWith('sess-6', expect.objectContaining({ type: 'build_failed' }))
        })

        it('hủy bỏ job với cancelJob và từ chối hủy khi đã hoàn thành', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-7',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })

            const cancelled = await manager.cancelJob(job.id, 'ws-1', 'User stopped')
            expect(cancelled.state).toBe('cancelled')
            expect(cancelled.cancelReason).toBe('User stopped')

            // Thử hoàn thành rồi hủy
            const { job: job2 } = await manager.createOrGetJob({
                sessionId: 'sess-8',
                workspaceId: 'ws-1',
                specRevisionId: 'rev-1'
            })
            await manager.completeJob(job2.id, 'ws-1', 'flow-xyz')

            await expect(manager.cancelJob(job2.id, 'ws-1')).rejects.toMatchObject({
                statusCode: StatusCodes.BAD_REQUEST,
                message: expect.stringContaining('Không thể hủy tác vụ đã hoàn tất')
            })
        })
    })

    describe('Workspace Isolation & Timeout check', () => {
        it('từ chối truy cập job từ workspace khác (Negative Auth: 403 Forbidden)', async () => {
            const { job } = await manager.createOrGetJob({
                sessionId: 'sess-9',
                workspaceId: 'ws-alpha',
                specRevisionId: 'rev-1'
            })

            await expect(manager.getJobById(job.id, 'ws-beta')).rejects.toMatchObject({
                statusCode: StatusCodes.FORBIDDEN
            })
        })

        it('xác định chính xác timeout qua isJobTimedOut', () => {
            const timedOutJob: BuildJob = {
                id: 'j-timeout',
                sessionId: 's-1',
                workspaceId: 'ws-1',
                specRevisionId: 'r-1',
                buildKey: 's-1:r-1',
                state: 'running',
                attempts: 1,
                maxAttempts: 3,
                timeoutMs: 5000,
                startedDate: new Date(Date.now() - 10000), // Bắt đầu 10 giây trước (timeout là 5s)
                createdDate: new Date(),
                updatedDate: new Date()
            }

            expect(manager.isJobTimedOut(timedOutJob)).toBe(true)

            const activeJob: BuildJob = {
                ...timedOutJob,
                startedDate: new Date() // Vừa mới bắt đầu
            }
            expect(manager.isJobTimedOut(activeJob)).toBe(false)
        })
    })
})
