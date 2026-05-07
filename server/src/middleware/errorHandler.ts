import type { Request, Response, NextFunction } from 'express'

export interface ApiError extends Error {
  status?: number
  code?: string
}

export function errorHandler(err: ApiError, req: Request, res: Response, next: NextFunction) {
  const status = err.status ?? 500
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
