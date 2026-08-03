import { Injectable, Logger } from '@nestjs/common';

/**
 * Inventory emits low-stock domain events only.
 * Consumers (Guardian, CRM, NTF, workers, Store, Portal) decide how to react.
 */
@Injectable()
export class LowStockEventEmitter {
  private readonly logger = new Logger(LowStockEventEmitter.name);
  readonly recentEvents: Array<{
    type: 'inventory.low_stock';
    warehouseId: string;
    productVariantId: string;
    available: number;
    threshold: number;
    at: string;
  }> = [];

  emitIfLow(
    warehouseId: string,
    productVariantId: string,
    available: number,
    threshold: number,
  ): void {
    if (available > threshold) {
      return;
    }
    const event = {
      type: 'inventory.low_stock' as const,
      warehouseId,
      productVariantId,
      available,
      threshold,
      at: new Date().toISOString(),
    };
    this.recentEvents.push(event);
    if (this.recentEvents.length > 100) {
      this.recentEvents.shift();
    }
    this.logger.warn(
      `inventory.low_stock variant=${productVariantId} warehouse=${warehouseId} available=${available} threshold=${threshold}`,
    );
  }
}
