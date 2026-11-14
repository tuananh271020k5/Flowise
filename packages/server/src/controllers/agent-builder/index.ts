import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import sessionService from '../../services/agent-builder/sessionService'

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

export default {
    createSession,
    getSessionById,
    addMessage,
    getRevisions,
    subscribeEvents
}
