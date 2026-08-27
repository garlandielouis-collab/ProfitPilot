import { getInventory, getInventoryMovements } from '../actions/inventory';
import { InventoryClient } from './InventoryClient';

export default async function InventoryPage() {
  // Both fetched in parallel server-side — no client loading spinner
  const [inventory, movements] = await Promise.all([
    getInventory().catch(() => []),
    getInventoryMovements(50).catch(() => []),
  ]);

  return (
    <InventoryClient
      initialInventory={inventory}
      initialMovements={movements}
    />
  );
}
