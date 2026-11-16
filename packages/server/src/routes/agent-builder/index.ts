import express from 'express'
import agentBuilderController from '../../controllers/agent-builder'

const router = express.Router()

// CREATE SESSION
router.post('/sessions', agentBuilderController.createSession)

// READ SESSION SNAPSHOT
router.get('/sessions/:id', agentBuilderController.getSessionById)

// ADD MESSAGE (with Idempotency & Revision Conflict handling)
router.post('/sessions/:id/messages', agentBuilderController.addMessage)

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

export default router
