import { StatusCodes } from 'http-status-codes'
import { DataSource, Repository } from 'typeorm'
import { BuildJob } from '../../../database/entities/BuildJob'
import { getRunningExpressApp } from '../../../utils/getRunningExpressApp'
import { AdapterError, BuildPipelineError } from '../errors/builderErrors'
import collectorService from '../collectorService'

const getActiveDataSource = (customDataSource?: DataSource): DataSource => {
    if (customDataSource) return customDataSource
    const app = getRunningExpressApp()
    if (app?.AppDataSource) return app.AppDataSource
    throw new Error('Database DataSource is not initialized')
}

export interface CreateBuildJobParams {
    sessionId: string
    workspaceId: string
    specRevisionId: string
    customBuildKey?: string
    timeoutMs?: number
}

/**
 * Trình quản lý vòng đời tác vụ build (BuildJob Lifecycle Manager) (PH2-T09).
 * Quản lý trạng thái, timeout, retry attempts và hủy tác vụ (superseded/cancellation).
 */
export class BuildJobManager {
    constructor(private customDataSource?: DataSource) {}

    private get jobRepo(): Repository<BuildJob> {
        return getActiveDataSource(this.customDataSource).getRepository(BuildJob)
    }

    /**
     * Tạo mới hoặc lấy job hiện có theo buildKey, tự động hủy các job đang chạy bị superseded.
     */
    async createOrGetJob(params: CreateBuildJobParams): Promise<{ job: BuildJob; isNew: boolean }> {
        const { sessionId, workspaceId, specRevisionId, customBuildKey, timeoutMs } = params
        const buildKey = customBuildKey || `${sessionId}:${specRevisionId}`

        // Kiểm tra xem đã có job cho buildKey này chưa
        const existingJob = await this.jobRepo.findOneBy({ buildKey })
        if (existingJob) {
            return { job: existingJob, isNew: false }
        }

        // Tự động hủy các job cũ đang pending hoặc running của cùng session nếu bị thay thế
        const runningJobs = await this.jobRepo.find({
            where: { sessionId }
        })

        for (const activeJob of runningJobs) {
            if (activeJob.state === 'running' || activeJob.state === 'pending') {
                if (activeJob.specRevisionId !== specRevisionId) {
                    await this.cancelJob(activeJob.id, workspaceId, 'superseded by newer revision')
                }
            }
        }

        const newJob = this.jobRepo.create({
            sessionId,
            workspaceId,
            specRevisionId,
            buildKey,
            state: 'pending',
            attempts: 0,
            maxAttempts: 3,
            timeoutMs: timeoutMs || 30000
        })

        const savedJob = await this.jobRepo.save(newJob)
        return { job: savedJob, isNew: true }
    }

    /**
     * Bắt đầu thực thi job.
     */
    async startJob(jobId: string, workspaceId: string): Promise<BuildJob> {
        const job = await this.getJobById(jobId, workspaceId)

        if (job.state === 'cancelled') {
            throw new BuildPipelineError('JOB_CANCELLED', 'Tác vụ build đã bị hủy trước khi bắt đầu', StatusCodes.CONFLICT)
        }

        if (job.attempts >= job.maxAttempts) {
            throw new BuildPipelineError('MAX_ATTEMPTS_EXCEEDED', `Tác vụ build đã vượt quá số lần thử tối đa (${job.maxAttempts})`)
        }

        job.state = 'running'
        job.attempts += 1
        job.startedDate = new Date()

        return this.jobRepo.save(job)
    }

    /**
     * Hoàn thành tác vụ build thành công.
     */
    async completeJob(jobId: string, workspaceId: string, flowId: string): Promise<BuildJob> {
        const job = await this.getJobById(jobId, workspaceId)

        job.state = 'completed'
        job.flowId = flowId
        job.completedDate = new Date()

        return this.jobRepo.save(job)
    }

    /**
     * Đánh dấu tác vụ build thất bại.
     */
    async failJob(jobId: string, workspaceId: string, errorMessage: string): Promise<BuildJob> {
        const job = await this.getJobById(jobId, workspaceId)

        job.state = 'failed'
        job.error = errorMessage
        job.completedDate = new Date()

        collectorService.broadcastSSE(job.sessionId, {
            type: 'build_failed',
            data: {
                jobId: job.id,
                buildKey: job.buildKey,
                error: errorMessage
            },
            timestamp: new Date().toISOString()
        })

        return this.jobRepo.save(job)
    }

    /**
     * Hủy tác vụ build (bởi người dùng hoặc do revision mới thay thế).
     */
    async cancelJob(jobId: string, workspaceId: string, reason = 'cancelled by user'): Promise<BuildJob> {
        const job = await this.getJobById(jobId, workspaceId)

        if (job.state === 'completed') {
            throw new BuildPipelineError('CANNOT_CANCEL_COMPLETED', 'Không thể hủy tác vụ đã hoàn tất', StatusCodes.BAD_REQUEST)
        }

        job.state = 'cancelled'
        job.cancelReason = reason
        job.cancelledDate = new Date()

        const saved = await this.jobRepo.save(job)

        collectorService.broadcastSSE(job.sessionId, {
            type: 'message',
            data: {
                eventType: 'build_cancelled',
                jobId: job.id,
                reason
            },
            timestamp: new Date().toISOString()
        })

        return saved
    }

    /**
     * Đọc thông tin job theo ID và bảo đảm cách ly workspace (403 Forbidden).
     */
    async getJobById(jobId: string, workspaceId: string): Promise<BuildJob> {
        const job = await this.jobRepo.findOneBy({ id: jobId })
        if (!job) {
            throw new AdapterError('BUILD_JOB_NOT_FOUND', `Tác vụ build ${jobId} không tồn tại`, StatusCodes.NOT_FOUND)
        }

        if (job.workspaceId !== workspaceId) {
            throw new AdapterError('WORKSPACE_MISMATCH', 'Từ chối quyền truy cập: Khác workspace', StatusCodes.FORBIDDEN)
        }

        return job
    }

    /**
     * Kiểm tra tác vụ có bị quá thời gian (timeout) không.
     */
    isJobTimedOut(job: BuildJob): boolean {
        if (job.state !== 'running' || !job.startedDate) return false
        const elapsed = Date.now() - new Date(job.startedDate).getTime()
        return elapsed > job.timeoutMs
    }
}

export default new BuildJobManager()
