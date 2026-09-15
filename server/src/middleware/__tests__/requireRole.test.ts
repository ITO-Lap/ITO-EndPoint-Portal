import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import { requireAppRole } from '../requireRole.js'

function fakeReq(role?: string): Request {
  return {
    header: (name: string) => (name.toLowerCase() === 'x-user-role' ? role : undefined),
  } as unknown as Request
}

function fakeRes(): Response {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as Response
}

describe('requireAppRole — Intune Scripts & Configurations authorization', () => {
  const ALLOWED = ['Global Admin', 'IT Admin']

  it('allows a Global Admin through', () => {
    const req = fakeReq('Global Admin')
    const res = fakeRes()
    const next = vi.fn()
    requireAppRole(ALLOWED)(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows an IT Admin through', () => {
    const req = fakeReq('IT Admin')
    const res = fakeRes()
    const next = vi.fn()
    requireAppRole(ALLOWED)(req, res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('rejects a Helpdesk role with 403', () => {
    const req = fakeReq('Helpdesk')
    const res = fakeRes()
    const next = vi.fn()
    requireAppRole(ALLOWED)(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })

  it('rejects an End User role with 403', () => {
    const req = fakeReq('End User')
    const res = fakeRes()
    const next = vi.fn()
    requireAppRole(ALLOWED)(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('defaults to End User (rejected) when no x-user-role header is present', () => {
    const req = fakeReq(undefined)
    const res = fakeRes()
    const next = vi.fn()
    requireAppRole(ALLOWED)(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
