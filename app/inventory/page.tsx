import { getInventory, getInventoryMovements } from '../actions/inventory';
import { InventoryClient } from './InventoryClient';
import { getSupabaseServer } from '../../lib/supabaseServerClient';

export default async function InventoryPage() {
  // Both fetched in parallel server-side — no client loading spinner
  const [inventory, movements] = await Promise.all([
    getInventory().catch(() => []),
    getInventoryMovements(50).catch(() => []),
  ]);

  // Fetch exchange rate
  let exchangeRate = 130;
  try {
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('exchange_rate')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (biz?.exchange_rate) exchangeRate = Number(biz.exchange_rate);
    }
  } catch { /* use default */ }

  return (
    <InventoryClient
      initialInventory={inventory}
      initialMovements={movements}
      exchangeRate={exchangeRate}
    />
  );
}
