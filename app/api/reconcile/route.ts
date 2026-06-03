import { NextRequest, NextResponse } from 'next/server';
import { reconcileMissingExpenseEntries } from '../../actions/accounting';

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-admin-token');
  if (!token || token !== process.env.RECONCILE_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const created = await reconcileMissingExpenseEntries();
    return NextResponse.json({ created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
