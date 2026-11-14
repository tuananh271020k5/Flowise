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

export default router
