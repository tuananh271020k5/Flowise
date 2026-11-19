import express from 'express'
import agentBuilderController from '../../controllers/agent-builder'
import { checkAnyPermission } from '../../enterprise/rbac/PermissionCheck'
import { builderMcpTransport } from '../../services/agent-builder/mcp/httpTransport'
import multer from 'multer'
import sessionService from '../../services/agent-builder/sessionService'

const router = express.Router()
router.use(checkAnyPermission('agentflows:create,agentflows:update'))
router.get('/model-profile', agentBuilderController.getModelProfile)
router.get('/models', checkAnyPermission('credentials:create,credentials:update'), agentBuilderController.listModels)
router.put('/model-profile', checkAnyPermission('credentials:create,credentials:update'), agentBuilderController.saveModelProfile)
router.post('/drafts/:id/preview', agentBuilderController.previewDraft)
router.post('/mcp', builderMcpTransport)

// CREATE SESSION
router.post('/sessions', agentBuilderController.createSession)

// READ SESSION SNAPSHOT
router.get('/sessions/:id', agentBuilderController.getSessionById)

// ADD MESSAGE (with Idempotency & Revision Conflict handling)
router.post('/sessions/:id/messages', agentBuilderController.addMessage)
router.post(
    '/sessions/:id/documents',
    checkAnyPermission('documentStores:create,documentStores:update'),
    async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        try {
            await sessionService.getSessionById(req.params.id, req.user?.activeWorkspaceId || '')
            next()
        } catch (error) {
            next(error)
        }
    },
    multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 25 * 1024 * 1024, files: 20, fields: 8, fieldSize: 32000 }
    }).array('files', 20) as unknown as express.RequestHandler,
    agentBuilderController.uploadDocuments
)
router.get('/documents/:storeId/chunks/:chunkId', agentBuilderController.readDocumentChunk)
router.get('/exports/:fileId/:fileName', agentBuilderController.downloadExportedFile)
router.get('/helpdesk/tickets', agentBuilderController.listHelpdeskTickets)
router.patch('/helpdesk/tickets/:ticketId', agentBuilderController.updateHelpdeskTicket)
router.get('/office-files', agentBuilderController.listOfficeFiles)
router.post(
    '/office-files',
    multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024, files: 5 }
    }).array('files', 5) as unknown as express.RequestHandler,
    agentBuilderController.uploadOfficeFiles
)
router.get('/native-tools', agentBuilderController.listWorkspaceNativeTools)

// LIST REVISIONS
router.get('/sessions/:id/revisions', agentBuilderController.getRevisions)

// SUBSCRIBE REALTIME EVENTS (Server-Sent Events)
router.get('/sessions/:id/events', agentBuilderController.subscribeEvents)

// EXECUTE BUILD (Idempotent Flowise Agentflow V2 Draft Generation)
router.post('/sessions/:id/builds', agentBuilderController.buildSession)

// LIST DRAFT REVISIONS HISTORY
router.get('/sessions/:id/drafts', agentBuilderController.getDraftHistory)

// BUILD JOB STATUS & CANCELLATION (PH2-T09)
router.get('/builds/:id', agentBuilderController.getBuildJob)
router.post('/builds/:id/cancel', agentBuilderController.cancelBuild)

// RUN CONTROLLED TEST SUITE (PH3-T03)
router.post('/sessions/:id/test-suite', agentBuilderController.runTestSuite)

// SPEC DIFF & ROLLBACK (PH3-T05)
router.get('/sessions/:id/diff', agentBuilderController.getSpecDiff)
router.post('/sessions/:id/rollback', agentBuilderController.rollbackRevision)

// KNOWLEDGE STORES & RAG INGESTION (PH4-T01 & PH4-T02)
router.get('/knowledge/stores', agentBuilderController.listKnowledgeStores)
router.get('/knowledge/stores/:id', agentBuilderController.getKnowledgeStore)
router.get('/knowledge/stores/:id/chunks', agentBuilderController.getKnowledgeStoreChunks)
router.post('/knowledge/seed', agentBuilderController.seedKnowledgeStore)

// PUBLISH & QUALITY GATE (PH5-T01)
router.post('/sessions/:id/publish', agentBuilderController.publishAgent)
router.post('/sessions/:id/unpublish', agentBuilderController.unpublishAgent)

// AUDIT LOGGING & TRACEABILITY (PH5-T02)
router.get('/sessions/:id/audit-logs', agentBuilderController.getAuditLogs)

// OBSERVABILITY METRICS & LOGS (PH5-T04 & PH5-T05)
router.get('/metrics', agentBuilderController.getMetrics)
router.get('/logs', agentBuilderController.getRecentLogs)

// DATA RETENTION & PURGE (PH5-T03)
router.post('/retention/sweep', agentBuilderController.triggerRetentionSweep)

// TOKEN USAGE & COST TRACKING (PH5-T05)
router.get('/sessions/:id/usage', agentBuilderController.getSessionUsage)
router.get('/usage', agentBuilderController.getWorkspaceUsage)

// CRASH RECOVERY & RECONCILIATION (PH5-T07)
router.post('/recovery/reconcile', agentBuilderController.reconcileStaleJobs)
router.post('/sessions/:id/reconcile', agentBuilderController.reconcileSession)

// BACKUP, RESTORE & SCHEMA INVARIANTS (PH5-T08)
router.get('/sessions/:id/backup', agentBuilderController.exportSessionBackup)
router.post('/sessions/restore', agentBuilderController.importSessionBackup)
router.get('/schema/validate', agentBuilderController.validateSchemaInvariants)

// ZERO-DOWNTIME DRAFT SWITCH & INSTANT ROLLBACK (PH5-T09)
router.post('/sessions/:id/switch-draft', agentBuilderController.switchDraftRevision)
router.post('/sessions/:id/instant-rollback', agentBuilderController.instantRollback)

// API CONNECTORS & OPERATION ALLOWLIST (PH6-T01 & PH6-T02)
router.get('/api-connectors', agentBuilderController.listApiConnectors)
router.post('/api-connectors', agentBuilderController.registerApiConnector)
router.get('/api-connectors/:id', agentBuilderController.getApiConnector)
router.post('/api-connectors/validate-call', agentBuilderController.validateApiCall)

// SQL DATABASE REGISTRY & READONLY EXECUTOR (PH6-T05, PH6-T06, PH6-T07)
router.get('/sql/databases', agentBuilderController.listSqlDatabases)
router.post('/sql/databases', agentBuilderController.registerSqlDatabase)
router.get('/sql/databases/:id', agentBuilderController.getSqlDatabase)
router.post('/sql/validate-query', agentBuilderController.validateSqlQuery)
router.post('/sql/execute-query', agentBuilderController.executeSqlQuery)

// CUSTOM TOOLS SANDBOX (PH6-T09)
router.get('/custom-tools', agentBuilderController.listCustomTools)
router.post('/custom-tools', agentBuilderController.registerCustomTool)
router.post('/custom-tools/:id/execute', agentBuilderController.executeCustomTool)

// WEBHOOK INGESTION & EVENT LISTENER (PH6-T10)
router.get('/webhooks', agentBuilderController.listWebhooks)
router.post('/webhooks', agentBuilderController.registerWebhook)
router.post('/webhooks/:id/receive', agentBuilderController.receiveWebhook)

// MODEL CONTEXT PROTOCOL TOOLS (PH6-T12 & B-031)
router.get('/mcp/tools', agentBuilderController.listMcpTools)
router.post('/mcp/call', agentBuilderController.callMcpTool)
router.get('/mcp-servers', agentBuilderController.listWorkspaceMcpServers)
router.post(
    '/mcp-servers',
    checkAnyPermission('tools:create,tools:update,credentials:create,credentials:update'),
    agentBuilderController.registerWorkspaceMcpServer
)
router.post(
    '/mcp-servers/:id/refresh',
    checkAnyPermission('tools:create,tools:update,credentials:create,credentials:update'),
    agentBuilderController.refreshWorkspaceMcpServer
)
router.delete(
    '/mcp-servers/:id',
    checkAnyPermission('tools:delete,tools:update,credentials:update'),
    agentBuilderController.deleteWorkspaceMcpServer
)

export default router
