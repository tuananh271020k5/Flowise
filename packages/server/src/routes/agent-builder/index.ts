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

export default router
