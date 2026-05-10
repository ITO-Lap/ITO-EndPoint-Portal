import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export interface ApiError extends Error {
  status?: number
  code?: string
}

export function errorHandler(err: ApiError | ZodError, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0]
    res.status(400).json({
      success: false,
      error: first ? `${first.path.join('.')}: ${first.message}` : 'Validation error',
    })
    return
  }

  const status = (err as ApiError).status ?? 500
  const message = err.message ?? 'Internal Server Error'
  console.error(`[Error] ${status} - ${message}`, err)

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
