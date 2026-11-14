import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import sessionService from '../../services/agent-builder/sessionService'
import buildPipelineService from '../../services/agent-builder/pipeline/buildPipelineService'
import evaluationRunnerService from '../../services/agent-builder/pipeline/evaluationRunnerService'
import { AgentSpec } from '../../services/agent-builder/types'

const getWorkspaceId = (req: Request): string => {
    return req.user?.activeWorkspaceId || (req.body?.workspaceId as string) || (req.query?.workspaceId as string) || 'default'
}

const getOrganizationId = (req: Request): string => {
    return req.user?.activeOrganizationId || 'default'
}

const getUserId = (req: Request): string => {
    return req.user?.id || 'default'
}

const createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const organizationId = getOrganizationId(req)
        const userId = getUserId(req)
        const { title, initialGoal } = req.body || {}

        const snapshot = await sessionService.createSession({
            workspaceId,
            organizationId,
            userId,
            title,
            initialGoal
        })

        return res.status(StatusCodes.CREATED).json(snapshot)
    } catch (error) {
        next(error)
    }
}

const getSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const snapshot = await sessionService.getSessionById(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(snapshot)
    } catch (error) {
        next(error)
    }
}

const addMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        if (!req.body) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Request body is required')
        }
        const workspaceId = getWorkspaceId(req)
        const response = await sessionService.addMessage(req.params.id, workspaceId, req.body)
        return res.status(StatusCodes.OK).json(response)
    } catch (error) {
        next(error)
    }
}

const getRevisions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const revisions = await sessionService.getRevisions(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(revisions)
    } catch (error) {
        next(error)
    }
}

const subscribeEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        await sessionService.subscribeEvents(req.params.id, workspaceId, res)
    } catch (error) {
        next(error)
    }
}

const buildSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const { specRevisionId, customBuildKey } = req.body || {}

        const result = await buildPipelineService.executeBuild({
            sessionId: req.params.id,
            workspaceId,
            specRevisionId,
            customBuildKey
        })

        return res.status(result.isExisting ? StatusCodes.OK : StatusCodes.CREATED).json(result)
    } catch (error) {
        next(error)
    }
}

const getDraftHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const history = await buildPipelineService.getDraftHistory(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(history)
    } catch (error) {
        next(error)
    }
}

const cancelBuild = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Build Job ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const { reason } = req.body || {}
        const cancelled = await buildPipelineService.cancelBuild(req.params.id, workspaceId, reason)
        return res.status(StatusCodes.OK).json(cancelled)
    } catch (error) {
        next(error)
    }
}

const getBuildJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Build Job ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const job = await buildPipelineService.getBuildJob(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(job)
    } catch (error) {
        next(error)
    }
}

const runTestSuite = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const snapshot = await sessionService.getSessionById(req.params.id, workspaceId)
        if (!snapshot.currentSpecRevision) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session does not have a valid spec revision')
        }

        const spec: AgentSpec = JSON.parse(snapshot.currentSpecRevision.spec)
        const drafts = await buildPipelineService.getDraftHistory(req.params.id, workspaceId)
        if (!drafts || drafts.length === 0) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Chưa có bản draft nào được tạo cho phiên này')
        }

        const latestDraft = drafts[drafts.length - 1]
        const result = await evaluationRunnerService.runTestSuite({
            flowId: latestDraft.flowId,
            workspaceId,
            examples: spec.evaluationExamples || [],
            maxExamples: req.body?.maxExamples || 10
        })

        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

export default {
    createSession,
    getSessionById,
    addMessage,
    getRevisions,
    subscribeEvents,
    buildSession,
    getDraftHistory,
    cancelBuild,
    getBuildJob,
    runTestSuite
}
