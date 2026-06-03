import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[PilotAI Analytics]', JSON.stringify(body));
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[PilotAI Analytics] failed', error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
