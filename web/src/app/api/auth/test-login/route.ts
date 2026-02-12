import { NextResponse } from 'next/server'
import { signIn } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || 'elisson@projetus.org'
    const password = searchParams.get('password') || 'elisson123'

    // Try to sign in
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    return NextResponse.json({
      success: true,
      result: result || 'Sign-in initiated',
      email
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor?.name
    }, { status: 500 })
  }
}
