import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import sessionService from '../../services/agent-builder/sessionService'
import buildPipelineService from '../../services/agent-builder/pipeline/buildPipelineService'
import evaluationRunnerService from '../../services/agent-builder/pipeline/evaluationRunnerService'
import knowledgeStoreService from '../../services/agent-builder/knowledge/knowledgeStoreService'
import publishService from '../../services/agent-builder/pipeline/publishService'
import builderAuditService from '../../services/agent-builder/audit/builderAuditService'
import rateLimiter from '../../services/agent-builder/security/rateLimiter'
import retentionService from '../../services/agent-builder/security/retentionService'
import builderLogger from '../../services/agent-builder/observability/builderLogger'
import metricsService from '../../services/agent-builder/observability/metricsService'
import tokenUsageService from '../../services/agent-builder/cost/tokenUsageService'
import recoveryService from '../../services/agent-builder/recovery/recoveryService'
import backupRestoreService from '../../services/agent-builder/backup/backupRestoreService'
import zeroDowntimeService from '../../services/agent-builder/deployment/zeroDowntimeService'
import apiConnectorService from '../../services/agent-builder/api-connectors/apiConnectorService'
import sqlExecutorService from '../../services/agent-builder/sql/sqlExecutorService'
import customToolSandboxService from '../../services/agent-builder/custom-tools/customToolSandboxService'
import builderWebhookService from '../../services/agent-builder/webhooks/builderWebhookService'
import builderMcpService from '../../services/agent-builder/mcp/builderMcpService'
import workspaceMcpRegistryService from '../../services/agent-builder/mcp/workspaceMcpRegistryService'
import nativeToolCatalogService from '../../services/agent-builder/tools/nativeToolCatalogService'
import { AgentSpec } from '../../services/agent-builder/types'
import modelSettingsService from '../../services/agent-builder/modelSettingsService'
import { predictDraft } from '../../services/agent-builder/runtimePredictionService'
import documentUploadService, { DOCUMENT_LIMITS } from '../../services/agent-builder/knowledge/documentUploadService'
import { DocumentStoreFileChunk } from '../../database/entities/DocumentStoreFileChunk'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const getWorkspaceId = (req: Request): string => {
    if (!req.user?.activeWorkspaceId) throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Đăng nhập để dùng Agent Builder')
    return req.user.activeWorkspaceId
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
        const { title, initialGoal, canvasVersion } = req.body || {}
        const safeCanvasVersion = canvasVersion === 'v1' || canvasVersion === 'v2' ? canvasVersion : undefined

        try {
            rateLimiter.enforceLimit(workspaceId, 'session_create')
        } catch (rateLimitErr) {
            metricsService.recordRateLimitViolation('session_create')
            throw rateLimitErr
        }

        const snapshot = await sessionService.createSession({
            workspaceId,
            organizationId,
            userId,
            title,
            initialGoal,
            canvasVersion: safeCanvasVersion
        })

        metricsService.recordSessionCreated()
        builderLogger.info(
            'conversation',
            'SESSION_CREATED',
            { sessionId: snapshot.session.id },
            {
                sessionId: snapshot.session.id,
                workspaceId
            }
        )

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

        try {
            rateLimiter.enforceLimit(workspaceId, 'message')
        } catch (rateLimitErr) {
            metricsService.recordRateLimitViolation('message')
            throw rateLimitErr
        }

        const response = await sessionService.addMessage(req.params.id, workspaceId, req.body)

        builderLogger.info(
            'conversation',
            'MESSAGE_PROCESSED',
            { role: req.body?.role || 'user' },
            {
                sessionId: req.params.id,
                workspaceId
            }
        )

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
    const startTime = Date.now()
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const { specRevisionId, customBuildKey, canvasVersion } = req.body || {}
        const safeCanvasVersion = canvasVersion === 'v1' || canvasVersion === 'v2' ? canvasVersion : undefined

        try {
            rateLimiter.enforceLimit(workspaceId, 'build')
        } catch (rateLimitErr) {
            metricsService.recordRateLimitViolation('build')
            throw rateLimitErr
        }

        const result = await buildPipelineService.executeBuild({
            sessionId: req.params.id,
            workspaceId,
            specRevisionId,
            customBuildKey,
            canvasVersion: safeCanvasVersion
        })

        const durationMs = Date.now() - startTime
        metricsService.recordBuild(true, durationMs)
        builderLogger.info(
            'compilation',
            'BUILD_SUCCESS',
            { isExisting: result.isExisting },
            {
                sessionId: req.params.id,
                workspaceId,
                durationMs
            }
        )

        return res.status(result.isExisting ? StatusCodes.OK : StatusCodes.CREATED).json(result)
    } catch (error) {
        metricsService.recordBuild(false, Date.now() - startTime)
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

        try {
            rateLimiter.enforceLimit(workspaceId, 'test_suite')
        } catch (rateLimitErr) {
            metricsService.recordRateLimitViolation('test_suite')
            throw rateLimitErr
        }

        const snapshot = await sessionService.getSessionById(req.params.id, workspaceId)
        if (!snapshot.currentSpecRevision) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session does not have a valid spec revision')
        }

        const spec: AgentSpec = JSON.parse(snapshot.currentSpecRevision.spec)
        const drafts = await buildPipelineService.getDraftHistory(req.params.id, workspaceId)
        if (!drafts || drafts.length === 0) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Chưa có bản draft nào được tạo cho phiên này')
        }

        const latestDraft = drafts.filter((draft) => draft.specRevisionId === snapshot.currentSpecRevision?.id).at(-1)
        if (!latestDraft) throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Chưa có draft cho revision hiện tại')
        const result = await evaluationRunnerService.runTestSuite({
            flowId: latestDraft.flowId,
            workspaceId,
            examples: spec.evaluationExamples || [],
            maxExamples: req.body?.maxExamples ?? 10
        })

        const passRate = result.totalCount > 0 ? Math.round((result.passedCount / result.totalCount) * 100) : 100
        metricsService.recordEvaluation(result.passedCount, result.failedCount)
        builderLogger.info(
            'testing',
            'TEST_SUITE_EXECUTED',
            {
                passRate,
                passed: result.passedCount,
                total: result.totalCount
            },
            {
                sessionId: req.params.id,
                workspaceId
            }
        )

        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const rollbackRevision = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const { revisionId } = req.body || {}
        if (!revisionId) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'revisionId is required for rollback')
        }
        const workspaceId = getWorkspaceId(req)
        const snapshot = await sessionService.rollbackRevision(req.params.id, workspaceId, revisionId)
        return res.status(StatusCodes.OK).json(snapshot)
    } catch (error) {
        next(error)
    }
}

const getSpecDiff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const { rev1, rev2 } = req.query as { rev1?: string; rev2?: string }
        const diff = await sessionService.getSpecDiff(req.params.id, workspaceId, rev1, rev2)
        return res.status(StatusCodes.OK).json(diff)
    } catch (error) {
        next(error)
    }
}

const listKnowledgeStores = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const stores = await knowledgeStoreService.listWorkspaceStores(workspaceId)
        return res.status(StatusCodes.OK).json(stores)
    } catch (error) {
        next(error)
    }
}

const getKnowledgeStore = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Store ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const store = await knowledgeStoreService.getStoreById(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(store)
    } catch (error) {
        next(error)
    }
}

const getKnowledgeStoreChunks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Store ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const limit = req.query?.limit ? parseInt(req.query.limit as string, 10) : undefined
        const offset = req.query?.offset ? parseInt(req.query.offset as string, 10) : undefined
        const chunks = await knowledgeStoreService.getStoreChunks(req.params.id, workspaceId, { limit, offset })
        return res.status(StatusCodes.OK).json(chunks)
    } catch (error) {
        next(error)
    }
}

const seedKnowledgeStore = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const store = await knowledgeStoreService.seedSampleDocumentStore(workspaceId)
        return res.status(StatusCodes.CREATED).json(store)
    } catch (error) {
        next(error)
    }
}

const publishAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)
        const { isPublic, minPassRate, notes } = req.body || {}

        try {
            rateLimiter.enforceLimit(workspaceId, 'publish')
        } catch (rateLimitErr) {
            metricsService.recordRateLimitViolation('publish')
            throw rateLimitErr
        }

        const result = await publishService.publishAgent({
            sessionId: req.params.id,
            workspaceId,
            userId,
            isPublic,
            minPassRate,
            notes
        })

        metricsService.recordPublish('publish')
        builderLogger.info(
            'publishing',
            'AGENT_PUBLISHED',
            { isPublic: result.isPublic },
            {
                sessionId: req.params.id,
                workspaceId
            }
        )

        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const unpublishAgent = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)

        try {
            rateLimiter.enforceLimit(workspaceId, 'publish')
        } catch (rateLimitErr) {
            metricsService.recordRateLimitViolation('publish')
            throw rateLimitErr
        }

        const result = await publishService.unpublishAgent({
            sessionId: req.params.id,
            workspaceId,
            userId
        })

        metricsService.recordPublish('unpublish')
        builderLogger.info('publishing', 'AGENT_UNPUBLISHED', undefined, {
            sessionId: req.params.id,
            workspaceId
        })

        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const limit = req.query?.limit ? parseInt(req.query.limit as string, 10) : undefined
        const offset = req.query?.offset ? parseInt(req.query.offset as string, 10) : undefined

        const logs = await builderAuditService.getSessionAuditLogs(req.params.id, workspaceId, { limit, offset })
        return res.status(StatusCodes.OK).json(logs)
    } catch (error) {
        next(error)
    }
}

const getMetrics = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const snapshot = metricsService.getMetricsSnapshot()
        return res.status(StatusCodes.OK).json(snapshot)
    } catch (error) {
        next(error)
    }
}

const triggerRetentionSweep = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)
        const { sessionDays, auditDays } = req.body || {}

        const result = await retentionService.executeRetentionSweep(workspaceId, {
            sessionDays: sessionDays ? parseInt(sessionDays, 10) : undefined,
            auditDays: auditDays ? parseInt(auditDays, 10) : undefined,
            actorId: userId
        })

        metricsService.recordRetentionPurge(result.purgedSessionsCount)
        builderLogger.info(
            'retention',
            'RETENTION_SWEEP_EXECUTED',
            {
                purgedSessionsCount: result.purgedSessionsCount,
                purgedAuditLogsCount: result.purgedAuditLogsCount
            },
            {
                workspaceId
            }
        )

        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const getRecentLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const limit = req.query?.limit ? parseInt(req.query.limit as string, 10) : 50
        const stage = req.query?.stage as any
        const sessionId = req.query?.sessionId as string

        const logs = builderLogger.getRecentLogs(limit, { stage, sessionId, workspaceId })
        return res.status(StatusCodes.OK).json(logs)
    } catch (error) {
        next(error)
    }
}

const getSessionUsage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const summary = tokenUsageService.getSessionSummary(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(summary)
    } catch (error) {
        next(error)
    }
}

const getWorkspaceUsage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const summary = tokenUsageService.getWorkspaceSummary(workspaceId)
        return res.status(StatusCodes.OK).json(summary)
    } catch (error) {
        next(error)
    }
}

const reconcileStaleJobs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)
        const maxStaleMs = req.body?.maxStaleMs ? parseInt(req.body.maxStaleMs, 10) : undefined

        const result = await recoveryService.reconcileStaleJobs({
            maxStaleMs,
            workspaceId,
            actorId: userId
        })

        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const reconcileSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const result = await recoveryService.reconcileSession(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const exportSessionBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const bundle = await backupRestoreService.exportSessionBackup(req.params.id, workspaceId)
        return res.status(StatusCodes.OK).json(bundle)
    } catch (error) {
        next(error)
    }
}

const importSessionBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)
        const { bundle, options } = req.body || {}
        const result = await backupRestoreService.importSessionBackup(bundle || req.body, workspaceId, userId, options)
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const validateSchemaInvariants = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await backupRestoreService.validateSchemaInvariants()
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const switchDraftRevision = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)
        const { draftRevisionId } = req.body || {}
        const result = await zeroDowntimeService.switchDraftRevision({
            sessionId: req.params.id,
            workspaceId,
            userId,
            targetDraftRevisionId: draftRevisionId
        })
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const instantRollback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Session ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const userId = getUserId(req)
        const { revisionId, draftRevisionId, toLastStable } = req.body || {}
        const result = await zeroDowntimeService.instantRollback({
            sessionId: req.params.id,
            workspaceId,
            userId,
            targetRevisionId: revisionId,
            targetDraftRevisionId: draftRevisionId,
            toLastStablePublished: toLastStable
        })
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const listApiConnectors = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const connectors = await apiConnectorService.listConnectors(workspaceId)
        return res.status(StatusCodes.OK).json(connectors)
    } catch (error) {
        next(error)
    }
}

const registerApiConnector = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const connector = await apiConnectorService.registerConnector({
            ...req.body,
            workspaceId
        })
        return res.status(StatusCodes.CREATED).json(connector)
    } catch (error) {
        next(error)
    }
}

const getApiConnector = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Connector ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const connector = await apiConnectorService.getConnector(req.params.id, workspaceId)
        if (!connector) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Connector not found' })
        }
        return res.status(StatusCodes.OK).json(connector)
    } catch (error) {
        next(error)
    }
}

const validateApiCall = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const result = apiConnectorService.validateApiCall({
            ...req.body,
            workspaceId
        })
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const listSqlDatabases = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const databases = await sqlExecutorService.listDatabases(workspaceId)
        return res.status(StatusCodes.OK).json(databases)
    } catch (error) {
        next(error)
    }
}

const registerSqlDatabase = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const database = await sqlExecutorService.registerDatabase({
            ...req.body,
            workspaceId
        })
        return res.status(StatusCodes.CREATED).json(database)
    } catch (error) {
        next(error)
    }
}

const getSqlDatabase = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.params?.id) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Database ID is required')
        }
        const workspaceId = getWorkspaceId(req)
        const database = await sqlExecutorService.getDatabase(req.params.id, workspaceId)
        if (!database) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Database config not found' })
        }
        return res.status(StatusCodes.OK).json(database)
    } catch (error) {
        next(error)
    }
}

const validateSqlQuery = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const { databaseId, query } = req.body || {}
        if (!databaseId || !query) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'databaseId và query là bắt buộc')
        }
        const dbConfig = await sqlExecutorService.getDatabase(databaseId, workspaceId)
        if (!dbConfig) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Database config not found' })
        }
        const result = sqlExecutorService.validateSqlQuery(query, dbConfig)
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const executeSqlQuery = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const { databaseId, query } = req.body || {}
        if (!databaseId || !query) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'databaseId và query là bắt buộc')
        }
        const result = await sqlExecutorService.executeQuery(workspaceId, databaseId, query)
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

// Custom Tools (PH6-T09)
const listCustomTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const tools = await customToolSandboxService.listCustomTools(workspaceId)
        return res.status(StatusCodes.OK).json(tools)
    } catch (error) {
        next(error)
    }
}

const registerCustomTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const tool = await customToolSandboxService.registerCustomTool({
            ...req.body,
            workspaceId
        })
        return res.status(StatusCodes.CREATED).json(tool)
    } catch (error) {
        next(error)
    }
}

const executeCustomTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const toolId = req.params?.id
        if (!toolId) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Tool ID is required')
        }
        const result = await customToolSandboxService.executeTool(workspaceId, toolId, req.body?.params || {})
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

// Webhooks (PH6-T10)
const listWebhooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const webhooks = await builderWebhookService.listEndpoints(workspaceId)
        return res.status(StatusCodes.OK).json(webhooks)
    } catch (error) {
        next(error)
    }
}

const registerWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const webhook = await builderWebhookService.registerEndpoint({
            ...req.body,
            workspaceId
        })
        return res.status(StatusCodes.CREATED).json(webhook)
    } catch (error) {
        next(error)
    }
}

const receiveWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const endpointId = req.params?.id
        const signature = (req.headers['x-flowise-signature'] || req.headers['x-webhook-signature'] || '') as string
        const eventName = (req.headers['x-flowise-event'] || req.body?.event || 'generic.event') as string

        const result = await builderWebhookService.processWebhookEvent(endpointId, signature, eventName, req.body)
        return res.status(result.statusCode).json(result)
    } catch (error) {
        next(error)
    }
}

// MCP Tools (PH6-T12)
const listMcpTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tools = builderMcpService.listTools()
        return res.status(StatusCodes.OK).json({ tools })
    } catch (error) {
        next(error)
    }
}

const callMcpTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const { toolName, arguments: args } = req.body || {}
        if (!toolName) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'toolName là bắt buộc')
        }
        const result = await builderMcpService.callTool({
            workspaceId,
            toolName,
            arguments: args
        })
        return res.status(StatusCodes.OK).json(result)
    } catch (error) {
        next(error)
    }
}

const getModelProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(await modelSettingsService.getProfile(getWorkspaceId(req)))
    } catch (error) {
        next(error)
    }
}
const listModels = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(await modelSettingsService.listModels(getWorkspaceId(req)))
    } catch (error) {
        next(error)
    }
}
const saveModelProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(await modelSettingsService.saveProfile(getWorkspaceId(req), req.body || {}))
    } catch (error) {
        next(error)
    }
}
const previewDraft = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.json(await predictDraft(req.params.id, getWorkspaceId(req), req.body || {}))
    } catch (error) {
        next(error)
    }
}

const uploadDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const snapshot = await sessionService.getSessionById(req.params.id, workspaceId)
        const expectedRevision = Number(req.body.expectedRevision)
        if (!Number.isInteger(expectedRevision) || expectedRevision !== snapshot.session.currentRevisionNo)
            throw new InternalFlowiseError(409, 'Phiên đã thay đổi. Tải lại trước khi gửi tài liệu.')
        if (typeof req.body.clientMessageId !== 'string' || !req.body.clientMessageId.trim() || req.body.clientMessageId.length > 128)
            throw new InternalFlowiseError(400, 'clientMessageId không hợp lệ')
        const files = req.files as Express.Multer.File[]
        const sources = await documentUploadService.ingest(
            req.params.id,
            workspaceId,
            files,
            req.body.retrievalMode || 'lexical',
            req.body.embeddingModel || 'text-embedding-3-small'
        )
        const previous = snapshot.currentSpecRevision ? JSON.parse(snapshot.currentSpecRevision.spec).dataSources || [] : []
        const merged = [...new Map([...previous, ...sources].map((source: any) => [source.id, source])).values()]
        if (merged.length > DOCUMENT_LIMITS.maxPerSession)
            throw new InternalFlowiseError(400, `Mỗi Agent tối đa ${DOCUMENT_LIMITS.maxPerSession} nguồn tài liệu.`)
        const content = typeof req.body.content === 'string' ? req.body.content.trim() : ''
        return res.json(
            await sessionService.addMessage(req.params.id, workspaceId, {
                content: `${content || 'Dùng các tài liệu đính kèm làm nguồn cho Agent.'}\n\nTài liệu đính kèm: ${sources
                    .map((source) => source.name)
                    .join(', ')}`,
                clientMessageId: req.body.clientMessageId,
                expectedRevision,
                specPatch: { dataSources: merged as any, kind: 'knowledge' }
            })
        )
    } catch (error) {
        next(error)
    }
}

const readDocumentChunk = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await knowledgeStoreService.getStoreById(req.params.storeId, getWorkspaceId(req))
        const chunk = await getRunningExpressApp()
            .AppDataSource.getRepository(DocumentStoreFileChunk)
            .findOneBy({ id: req.params.chunkId, storeId: req.params.storeId })
        if (!chunk) throw new InternalFlowiseError(404, 'Không tìm thấy đoạn tài liệu')
        const meta = JSON.parse(chunk.metadata || '{}')
        res.type('text/plain').setHeader('X-Content-Type-Options', 'nosniff')
        return res.send(
            `${meta.filename || 'Tài liệu'}${meta.page ? ` — trang ${meta.page}` : ''}\nĐoạn ${chunk.chunkNo}\n\n${chunk.pageContent}`
        )
    } catch (error) {
        next(error)
    }
}

const listWorkspaceMcpServers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.status(StatusCodes.OK).json(await workspaceMcpRegistryService.listWorkspaceMcpServers(getWorkspaceId(req)))
    } catch (error) {
        next(error)
    }
}

const registerWorkspaceMcpServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const created = await workspaceMcpRegistryService.registerWorkspaceMcpServer(
            getWorkspaceId(req),
            getOrganizationId(req),
            req.body || {}
        )
        return res.status(StatusCodes.CREATED).json(created)
    } catch (error) {
        next(error)
    }
}

const refreshWorkspaceMcpServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const refreshed = await workspaceMcpRegistryService.refreshWorkspaceMcpServer(req.params.id, getWorkspaceId(req))
        return res.status(StatusCodes.OK).json(refreshed)
    } catch (error) {
        next(error)
    }
}

const deleteWorkspaceMcpServer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const deleted = await workspaceMcpRegistryService.deleteWorkspaceMcpServer(req.params.id, getWorkspaceId(req))
        return res.status(StatusCodes.OK).json(deleted)
    } catch (error) {
        next(error)
    }
}

const listWorkspaceNativeTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        return res.status(StatusCodes.OK).json(await nativeToolCatalogService.listWorkspaceNativeTools(getWorkspaceId(req)))
    } catch (error) {
        next(error)
    }
}

const uploadOfficeFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : []
        if (files.length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                code: 'NO_FILES_UPLOADED',
                message: 'Vui lòng chọn ít nhất 1 tệp Excel (.xlsx) hoặc Word (.docx).'
            })
        }
        const uploaded = files.map((file) =>
            nativeToolCatalogService.saveUploadedOfficeFile(workspaceId, {
                originalname: file.originalname,
                buffer: file.buffer,
                mimetype: file.mimetype
            })
        )
        return res.status(StatusCodes.CREATED).json({ files: uploaded })
    } catch (error) {
        next(error)
    }
}

const listOfficeFiles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const files = nativeToolCatalogService.listWorkspaceOfficeFiles(getWorkspaceId(req))
        return res.status(StatusCodes.OK).json({ files })
    } catch (error) {
        next(error)
    }
}

const listHelpdeskTickets = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tickets = nativeToolCatalogService.listWorkspaceHelpdeskTickets(getWorkspaceId(req))
        return res.status(StatusCodes.OK).json({ tickets })
    } catch (error) {
        next(error)
    }
}

const updateHelpdeskTicket = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = getWorkspaceId(req)
        const { ticketId } = req.params
        const { status, assignedGroup, note } = req.body || {}
        const author = req.user?.name || req.user?.email || 'Quản trị viên CSKH'
        const ticket = nativeToolCatalogService.updateWorkspaceHelpdeskTicket(workspaceId, ticketId, {
            status,
            assignedGroup,
            note,
            author
        })
        return res.status(StatusCodes.OK).json({ ticket })
    } catch (error) {
        next(error)
    }
}

const downloadExportedFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const resolved = nativeToolCatalogService.resolveExportedFileForDownload(getWorkspaceId(req), req.params.fileId)
        res.setHeader('Content-Type', resolved.mimeType)
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(resolved.fileName)}`)
        return res.sendFile(resolved.filePath)
    } catch (error) {
        next(error)
    }
}

export default {
    uploadDocuments,
    readDocumentChunk,
    listWorkspaceNativeTools,
    uploadOfficeFiles,
    listOfficeFiles,
    listHelpdeskTickets,
    updateHelpdeskTicket,
    downloadExportedFile,
    listWorkspaceMcpServers,
    registerWorkspaceMcpServer,
    refreshWorkspaceMcpServer,
    deleteWorkspaceMcpServer,
    listModels,
    getModelProfile,
    saveModelProfile,
    previewDraft,
    createSession,
    getSessionById,
    addMessage,
    getRevisions,
    subscribeEvents,
    buildSession,
    getDraftHistory,
    cancelBuild,
    getBuildJob,
    runTestSuite,
    rollbackRevision,
    getSpecDiff,
    listKnowledgeStores,
    getKnowledgeStore,
    getKnowledgeStoreChunks,
    seedKnowledgeStore,
    publishAgent,
    unpublishAgent,
    getAuditLogs,
    getMetrics,
    triggerRetentionSweep,
    getRecentLogs,
    getSessionUsage,
    getWorkspaceUsage,
    reconcileStaleJobs,
    reconcileSession,
    exportSessionBackup,
    importSessionBackup,
    validateSchemaInvariants,
    switchDraftRevision,
    instantRollback,
    listApiConnectors,
    registerApiConnector,
    getApiConnector,
    validateApiCall,
    listSqlDatabases,
    registerSqlDatabase,
    getSqlDatabase,
    validateSqlQuery,
    executeSqlQuery,
    listCustomTools,
    registerCustomTool,
    executeCustomTool,
    listWebhooks,
    registerWebhook,
    receiveWebhook,
    listMcpTools,
    callMcpTool
}
