import type { CollectionItemOption } from './api';

export function collectionUomFactor(item: CollectionItemOption, uom: string): number | null {
  const factor = item.uom_factors ? item.uom_factors[uom] : (uom === item.uom ? item.conversion_factor ?? 1 : NaN);
  return typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : null;
}

export function collectionUoms(item: CollectionItemOption): string[] {
  return [...new Set(item.uom_factors ? Object.keys(item.uom_factors) : [item.uom])]
    .filter((uom) => collectionUomFactor(item, uom) !== null);
}

export function collectionStockLimit(item: CollectionItemOption): number {
  return item.stock_qty ?? item.qty * (item.conversion_factor ?? 1);
}

export function collectionLimit(item: CollectionItemOption, uom: string): number {
  const factor = collectionUomFactor(item, uom);
  return factor ? collectionStockLimit(item) / factor : 0;
}

export function convertCollectionQuantity(item: CollectionItemOption, qty: string, from: string, to: string): string {
  if (!qty.trim() || !Number.isFinite(Number(qty))) return qty;
  const previous = collectionUomFactor(item, from), next = collectionUomFactor(item, to);
  return previous && next ? String(Number(qty) * previous / next) : qty;
}

export function validateCollectionQuantity(item: CollectionItemOption, qty: string, uom: string): string | null {
  const quantity = Number(qty), factor = collectionUomFactor(item, uom);
  if (!factor) return 'Choose a valid unit for this item.';
  if (!qty.trim() || !Number.isFinite(quantity) || quantity <= 0) return 'Enter a positive collected quantity.';
  const stock = quantity * factor;
  if (!Number.isFinite(stock) || stock - collectionStockLimit(item) > 1e-8) return 'Quantity cannot exceed this reference row/batch quantity.';
  for (const [unit, amount] of [[uom, quantity], [item.stock_uom, stock]] as const) {
    if (item.whole_number_uoms?.includes(unit) && Math.abs(amount - Math.round(amount)) > 1e-8) return `${unit} requires a whole-number quantity.`;
  }
  return null;
}
