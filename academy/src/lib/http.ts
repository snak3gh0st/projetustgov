import { NextResponse } from 'next/server'

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status })
}

export function err(status: number, message: unknown) {
  const error = typeof message === 'string' ? { error: message } : { errors: message }
  return NextResponse.json(error, { status })
}
