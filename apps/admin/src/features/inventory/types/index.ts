export type InventoryDashboard = {
  warehouseId: string;
  warehouseCode: string;
  skuCount: number;
  lowStockCount: number;
  onHandTotal: number;
  reservedTotal: number;
  pendingReservations: number;
  lowStockThreshold: number;
  oversellMode: string;
};

export type InventoryBalanceRow = {
  id?: string;
  warehouseId: string;
  productVariantId: string;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
  lowStock: boolean;
  sku: string | null;
  label: string | null;
  productId: string | null;
  productName: string | null;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
};

export type InventoryPolicy = {
  id: string;
  code: string;
  oversellMode: "PREVENT" | "ALLOW";
  reservationTimeoutMinutes: number;
  lowStockThreshold: number;
  allowNegativeStock: boolean;
  allocationStrategy: string | null;
};

export type StockMovement = {
  id: string;
  warehouseId: string;
  productVariantId: string;
  movementType: string;
  quantityDelta: number;
  orderId: string | null;
  reservationId: string | null;
  reason: string | null;
  createdAt: string;
};
