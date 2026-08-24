import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  OrderAddressKind,
  OrderAdjustmentKind,
  OrderStatus,
  OrderType,
  PaymentLifecycleState,
  Prisma,
  UserStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderEditPolicyService } from './order-edit-policy.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import {
  NOOP_ORDER_SIDE_EFFECTS,
  type OrderSideEffectHooks,
} from './order-side-effects';
import { OrderSnapshotService } from './order-snapshot.service';
import { OrderTotalsService } from './order-totals.service';
import type {
  AddOrderAdjustmentInput,
  AddOrderNoteInput,
  ClassDOrderInput,
  CreateOrderFromSnapshotsInput,
  CreateOrderInput,
  OrderAddressInput,
  OverrideOrderInput,
  TransitionOrderInput,
  UpdateOrderFieldsInput,
} from './order.types';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  private sideEffects: OrderSideEffectHooks = NOOP_ORDER_SIDE_EFFECTS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly totals: OrderTotalsService,
    private readonly snapshots: OrderSnapshotService,
    private readonly editPolicy: OrderEditPolicyService,
  ) {}

  /** Wire P13e/P13f integrations without coupling this module to them. */
  setSideEffectHooks(hooks: OrderSideEffectHooks): void {
    this.sideEffects = hooks;
  }

  async listOrders(params: {
    q?: string;
    status?: OrderStatus | 'ALL';
    orderType?: OrderType | 'ALL';
    patientUserId?: string;
    createdFrom?: string;
    createdTo?: string;
    skip?: number;
    take?: number;
    /** When true, include soft-deleted (Guardian admin). CRM default false. */
    includeDeleted?: boolean;
    /** ACTIVE = not archived; ARCHIVED = archived only; ALL = both. */
    archived?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
  }) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where = this.buildListWhere(params);

    const [items, total, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          orderType: true,
          patientUserId: true,
          customerFirstName: true,
          customerLastName: true,
          customerEmail: true,
          customerPhone: true,
          currency: true,
          totalCents: true,
          paymentStatusSummary: true,
          subscriptionId: true,
          requiresClinicalReview: true,
          isRxOrder: true,
          trackingNumber: true,
          shippedAt: true,
          archivedAt: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.countByStatus(params.includeDeleted === true),
    ]);

    return { items, total, statusCounts };
  }

  async getOrderById(orderId: string, options?: { includeDeleted?: boolean }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        addresses: true,
        adjustments: { orderBy: { createdAt: 'desc' } },
        patient: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            displayName: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    if (
      !order ||
      (order.deletedAt != null && options?.includeDeleted !== true)
    ) {
      throw new NotFoundException({
        code: ErrorCodes.ORD_NOT_FOUND,
        message: 'Order not found',
      });
    }

    return {
      ...order,
      allowedNextStatuses: this.lifecycle.allowedNext(order.status),
      canCancel: this.lifecycle.isAllowed(order.status, OrderStatus.CANCELLED),
      canFulfill: this.lifecycle.isAllowed(order.status, OrderStatus.FULFILLED),
    };
  }

  async listOrderItems(orderId: string) {
    await this.requireActiveOrder(this.prisma, orderId);
    return this.prisma.orderItem.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listNotes(orderId: string) {
    await this.requireActiveOrder(this.prisma, orderId);
    return this.prisma.orderNote.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listStatusHistory(orderId: string) {
    await this.requireActiveOrder(this.prisma, orderId);
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listActivity(orderId: string) {
    await this.requireActiveOrder(this.prisma, orderId);
    return this.prisma.orderActivity.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private buildListWhere(params: {
    q?: string;
    status?: OrderStatus | 'ALL';
    orderType?: OrderType | 'ALL';
    patientUserId?: string;
    createdFrom?: string;
    createdTo?: string;
    includeDeleted?: boolean;
    archived?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
  }): Prisma.OrderWhereInput {
    const createdAt: Prisma.DateTimeFilter = {};
    if (params.createdFrom) {
      createdAt.gte = new Date(params.createdFrom);
    }
    if (params.createdTo) {
      createdAt.lte = new Date(params.createdTo);
    }

    const archivedFilter =
      params.archived === 'ARCHIVED'
        ? { archivedAt: { not: null } }
        : params.archived === 'ALL'
          ? {}
          : params.archived === 'ACTIVE'
            ? { archivedAt: null }
            : {};

    const where: Prisma.OrderWhereInput = {
      ...(params.includeDeleted === true ? {} : { deletedAt: null }),
      ...archivedFilter,
      ...(params.status && params.status !== 'ALL'
        ? { status: params.status }
        : {}),
      ...(params.orderType && params.orderType !== 'ALL'
        ? { orderType: params.orderType }
        : {}),
      ...(params.patientUserId ? { patientUserId: params.patientUserId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      ...(params.q
        ? {
            OR: [
              { orderNumber: { contains: params.q, mode: 'insensitive' } },
              { customerEmail: { contains: params.q, mode: 'insensitive' } },
              {
                customerFirstName: {
                  contains: params.q,
                  mode: 'insensitive',
                },
              },
              {
                customerLastName: { contains: params.q, mode: 'insensitive' },
              },
              { customerPhone: { contains: params.q, mode: 'insensitive' } },
              { trackingNumber: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return where;
  }

  private async countByStatus(includeDeleted: boolean) {
    const rows = await this.prisma.order.groupBy({
      by: ['status'],
      where: includeDeleted ? undefined : { deletedAt: null },
      _count: { _all: true },
    });
    const counts: Record<string, number> = { ALL: 0 };
    for (const status of Object.values(OrderStatus)) {
      counts[status] = 0;
    }
    for (const row of rows) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    return counts;
  }

  async createOrder(input: CreateOrderInput) {
    if (!input.lines?.length) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_ITEM,
        message: 'Order requires at least one line item',
      });
    }

    const initialStatus = input.initialStatus ?? OrderStatus.DRAFT;
    if (
      initialStatus !== OrderStatus.DRAFT &&
      initialStatus !== OrderStatus.PAYMENT_PENDING
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'initialStatus must be DRAFT or PAYMENT_PENDING',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.patientUserId },
      });
      if (
        !user ||
        user.deletedAt != null ||
        user.status === UserStatus.DELETED
      ) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Patient user not found',
        });
      }

      const preparedLines = [];
      let isRxOrder = false;

      for (const line of input.lines) {
        if (!Number.isInteger(line.quantity) || line.quantity < 1) {
          throw new BadRequestException({
            code: ErrorCodes.ORD_INVALID_ITEM,
            message: 'Each line quantity must be an integer >= 1',
          });
        }

        const variant = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          include: { product: true },
        });
        if (
          !variant ||
          variant.deletedAt != null ||
          !variant.product ||
          variant.product.deletedAt != null
        ) {
          throw new BadRequestException({
            code: ErrorCodes.ORD_INVALID_ITEM,
            message: `Invalid product variant: ${line.variantId}`,
          });
        }

        const catalog = this.snapshots.snapshotCatalogLine(
          variant.product,
          variant,
        );
        const lineTotals = this.totals.computeLine({
          unitPriceCents: catalog.unitPriceCents,
          salePriceCents: catalog.salePriceCents,
          quantity: line.quantity,
          discountCents: line.discountCents ?? 0,
          taxCents: line.taxCents ?? 0,
        });

        if (catalog.isRxEligible) {
          isRxOrder = true;
        }

        preparedLines.push({ catalog, lineTotals });
      }

      const orderTotals = this.totals.computeOrder({
        lines: preparedLines.map((p) => p.lineTotals),
        shippingTotalCents: input.shippingTotalCents ?? 0,
        discountTotalCents: input.discountTotalCents ?? 0,
        taxTotalCents: input.taxTotalCents ?? 0,
      });

      const customer = this.snapshots.snapshotCustomer(user, input.customer);
      const shipping = this.snapshots.snapshotAddress(
        OrderAddressKind.SHIPPING,
        input.shippingAddress,
      );
      const billing = this.snapshots.snapshotAddress(
        OrderAddressKind.BILLING,
        input.billingAddress,
      );

      if (!shipping.line1 || !shipping.city) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'shippingAddress.line1 and city are required',
        });
      }
      if (!billing.line1 || !billing.city) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'billingAddress.line1 and city are required',
        });
      }

      const orderNumber = await this.allocateOrderNumber(tx);
      const orderType = input.orderType ?? OrderType.ONE_TIME;
      const source = input.source ?? 'system';

      const order = await tx.order.create({
        data: {
          orderNumber,
          patientUserId: user.id,
          status: initialStatus,
          orderType,
          subscriptionId: input.subscriptionId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          ...customer,
          currency: input.currency ?? 'USD',
          ...orderTotals,
          requiresClinicalReview: isRxOrder,
          isRxOrder,
          items: {
            create: preparedLines.map(({ catalog, lineTotals }) => ({
              productId: catalog.productId,
              variantId: catalog.variantId,
              productName: catalog.productName,
              sku: catalog.sku,
              productType: catalog.productType,
              isRxEligible: catalog.isRxEligible,
              catalogMetadata: catalog.catalogMetadata as Prisma.InputJsonValue,
              quantity: lineTotals.quantity,
              unitPriceCents: lineTotals.unitPriceCents,
              salePriceCents: lineTotals.salePriceCents,
              taxCents: lineTotals.taxCents,
              discountCents: lineTotals.discountCents,
              lineSubtotalCents: lineTotals.lineSubtotalCents,
              lineTotalCents: lineTotals.lineTotalCents,
            })),
          },
          addresses: {
            create: [shipping, billing],
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: initialStatus,
              actorUserId: input.actorUserId ?? null,
              source,
              reason: 'order_created',
            },
          },
          activities: {
            create: {
              actorUserId: input.actorUserId ?? null,
              kind: 'order_created',
              summary: `Order ${orderNumber} created`,
              metadata: {
                status: initialStatus,
                lineCount: preparedLines.length,
              },
            },
          },
        },
        include: {
          items: true,
          addresses: true,
          statusHistory: true,
          activities: true,
        },
      });

      return order;
    });
  }

  /**
   * Create order from immutable snapshot lines (subscription renewal).
   * Does not re-price from live catalog. Honors idempotencyKey replay.
   */
  async createOrderFromSnapshots(input: CreateOrderFromSnapshotsInput) {
    if (!input.lines?.length) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_ITEM,
        message: 'Order requires at least one line item',
      });
    }
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'idempotencyKey is required for snapshot order create',
      });
    }

    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        items: true,
        addresses: true,
        statusHistory: true,
        activities: true,
      },
    });
    if (existing) {
      if (
        existing.subscriptionId !== input.subscriptionId ||
        existing.patientUserId !== input.patientUserId ||
        existing.orderType !== input.orderType
      ) {
        throw new ConflictException({
          code: ErrorCodes.ORD_CONFLICT,
          message: 'Order idempotency key replay with mismatched body',
        });
      }
      return existing;
    }

    const initialStatus = input.initialStatus ?? OrderStatus.PAYMENT_PENDING;
    if (
      initialStatus !== OrderStatus.DRAFT &&
      initialStatus !== OrderStatus.PAYMENT_PENDING
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'initialStatus must be DRAFT or PAYMENT_PENDING',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const raced = await tx.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          items: true,
          addresses: true,
          statusHistory: true,
          activities: true,
        },
      });
      if (raced) {
        return raced;
      }

      const user = await tx.user.findUnique({
        where: { id: input.patientUserId },
      });
      if (
        !user ||
        user.deletedAt != null ||
        user.status === UserStatus.DELETED
      ) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Patient user not found',
        });
      }

      // Ensure catalog FKs still exist (Restrict); prices come from snapshots.
      for (const line of input.lines) {
        if (!Number.isInteger(line.quantity) || line.quantity < 1) {
          throw new BadRequestException({
            code: ErrorCodes.ORD_INVALID_ITEM,
            message: 'Each line quantity must be an integer >= 1',
          });
        }
        const variant = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          include: { product: true },
        });
        if (
          !variant ||
          variant.deletedAt != null ||
          !variant.product ||
          variant.product.deletedAt != null ||
          variant.productId !== line.productId
        ) {
          throw new BadRequestException({
            code: ErrorCodes.ORD_INVALID_ITEM,
            message: `Invalid product variant for snapshot line: ${line.variantId}`,
          });
        }
      }

      const preparedLines = input.lines.map((line) => {
        const lineTotals = this.totals.computeLine({
          unitPriceCents: line.unitPriceCents,
          salePriceCents: line.salePriceCents,
          quantity: line.quantity,
          discountCents: line.discountCents ?? 0,
          taxCents: line.taxCents ?? 0,
        });
        return { line, lineTotals };
      });

      const isRxOrder = input.lines.some((l) => l.isRxEligible);
      const orderTotals = this.totals.computeOrder({
        lines: preparedLines.map((p) => p.lineTotals),
        shippingTotalCents: input.shippingTotalCents ?? 0,
        discountTotalCents: input.discountTotalCents ?? 0,
        taxTotalCents: input.taxTotalCents ?? 0,
      });

      const customer = this.snapshots.snapshotCustomer(user, input.customer);
      const shipping = this.snapshots.snapshotAddress(
        OrderAddressKind.SHIPPING,
        input.shippingAddress,
      );
      const billing = this.snapshots.snapshotAddress(
        OrderAddressKind.BILLING,
        input.billingAddress,
      );

      if (!shipping.line1 || !shipping.city) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'shippingAddress.line1 and city are required',
        });
      }
      if (!billing.line1 || !billing.city) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'billingAddress.line1 and city are required',
        });
      }

      const orderNumber = await this.allocateOrderNumber(tx);
      const source = input.source ?? 'system';

      try {
        return await tx.order.create({
          data: {
            orderNumber,
            patientUserId: user.id,
            status: initialStatus,
            orderType: input.orderType,
            subscriptionId: input.subscriptionId,
            idempotencyKey: input.idempotencyKey,
            ...customer,
            currency: input.currency ?? input.lines[0]?.currency ?? 'USD',
            ...orderTotals,
            requiresClinicalReview: isRxOrder,
            isRxOrder,
            items: {
              create: preparedLines.map(({ line, lineTotals }) => ({
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                sku: line.sku,
                productType: line.productType,
                isRxEligible: line.isRxEligible,
                catalogMetadata: line.catalogMetadata ?? {},
                quantity: lineTotals.quantity,
                unitPriceCents: lineTotals.unitPriceCents,
                salePriceCents: lineTotals.salePriceCents,
                taxCents: lineTotals.taxCents,
                discountCents: lineTotals.discountCents,
                lineSubtotalCents: lineTotals.lineSubtotalCents,
                lineTotalCents: lineTotals.lineTotalCents,
              })),
            },
            addresses: {
              create: [shipping, billing],
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: initialStatus,
                actorUserId: input.actorUserId ?? null,
                source,
                reason: 'renewal_order_created',
              },
            },
            activities: {
              create: {
                actorUserId: input.actorUserId ?? null,
                kind: 'order_created',
                summary: `Order ${orderNumber} created from snapshots`,
                metadata: {
                  status: initialStatus,
                  lineCount: preparedLines.length,
                  idempotencyKey: input.idempotencyKey,
                },
              },
            },
          },
          include: {
            items: true,
            addresses: true,
            statusHistory: true,
            activities: true,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const again = await tx.order.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            include: {
              items: true,
              addresses: true,
              statusHistory: true,
              activities: true,
            },
          });
          if (again) {
            return again;
          }
        }
        throw error;
      }
    });
  }

  async recordPaymentRefs(input: {
    orderId: string;
    paymentId: string;
    paymentStatusSummary: string;
    paymentIntentId?: string | null;
  }) {
    await this.prisma.order.update({
      where: { id: input.orderId },
      data: {
        latestPaymentId: input.paymentId,
        paymentStatusSummary: input.paymentStatusSummary,
        ...(input.paymentIntentId !== undefined
          ? { paymentIntentId: input.paymentIntentId }
          : {}),
      },
    });
  }

  /**
   * Resolve SHIPPING+BILLING from the latest order for a subscription (read-only).
   */
  async getLatestSubscriptionOrderAddresses(subscriptionId: string): Promise<{
    shipping: OrderAddressInput;
    billing: OrderAddressInput;
  } | null> {
    const order = await this.prisma.order.findFirst({
      where: {
        subscriptionId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: { addresses: true },
    });
    if (!order) {
      return null;
    }
    const shipping = order.addresses.find(
      (a) => a.kind === OrderAddressKind.SHIPPING,
    );
    const billing = order.addresses.find(
      (a) => a.kind === OrderAddressKind.BILLING,
    );
    if (
      !shipping ||
      !billing ||
      !shipping.line1?.trim() ||
      !shipping.city?.trim() ||
      !billing.line1?.trim() ||
      !billing.city?.trim()
    ) {
      return null;
    }
    return {
      shipping: {
        fullName: shipping.fullName,
        line1: shipping.line1,
        line2: shipping.line2,
        city: shipping.city,
        region: shipping.region,
        postalCode: shipping.postalCode,
        country: shipping.country,
        phone: shipping.phone,
      },
      billing: {
        fullName: billing.fullName,
        line1: billing.line1,
        line2: billing.line2,
        city: billing.city,
        region: billing.region,
        postalCode: billing.postalCode,
        country: billing.country,
        phone: billing.phone,
      },
    };
  }

  async transitionOrder(input: TransitionOrderInput) {
    const { result, fromStatus, toStatus } = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: input.orderId },
        });
        if (!order || order.deletedAt != null) {
          throw new NotFoundException({
            code: ErrorCodes.ORD_NOT_FOUND,
            message: 'Order not found',
          });
        }

        const current = order.status;
        const expected = input.expectedStatus ?? current;
        if (current !== expected) {
          throw new ConflictException({
            code: ErrorCodes.ORD_CONFLICT,
            message: `Order status conflict: expected ${expected}, actual ${current}`,
          });
        }

        this.lifecycle.assertTransition(current, input.toStatus);

        // Renewal-scoped: do not fulfill without captured payment (P14e C10).
        if (
          input.toStatus === OrderStatus.FULFILLED &&
          order.orderType === OrderType.SUBSCRIPTION_RENEWAL
        ) {
          const payment = await tx.payment.findFirst({
            where: { orderId: order.id },
            orderBy: { createdAt: 'desc' },
          });
          if (
            !payment ||
            payment.lifecycleState !== PaymentLifecycleState.CAPTURED
          ) {
            throw new BadRequestException({
              code: ErrorCodes.ORD_INVALID_TRANSITION,
              message:
                'Subscription renewal orders require captured payment before fulfillment',
            });
          }
        }

        if (current === input.toStatus) {
          return {
            result: order,
            fromStatus: current,
            toStatus: current,
          };
        }

        const updated = await tx.order.updateMany({
          where: { id: order.id, status: current, deletedAt: null },
          data: { status: input.toStatus },
        });
        if (updated.count !== 1) {
          throw new ConflictException({
            code: ErrorCodes.ORD_CONFLICT,
            message: 'Order was modified concurrently; transition aborted',
          });
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: current,
            toStatus: input.toStatus,
            actorUserId: input.actorUserId ?? null,
            source: input.source,
            reason: input.reason ?? null,
            metadata: (input.metadata ?? undefined) as
              Prisma.InputJsonValue | undefined,
          },
        });

        await tx.orderActivity.create({
          data: {
            orderId: order.id,
            actorUserId: input.actorUserId ?? null,
            kind: 'status_transition',
            summary: `${current} → ${input.toStatus}`,
            metadata: {
              fromStatus: current,
              toStatus: input.toStatus,
              source: input.source,
            },
          },
        });

        const next = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
        });

        return {
          result: next,
          fromStatus: current,
          toStatus: input.toStatus,
        };
      },
    );

    if (fromStatus !== toStatus) {
      const inv = this.lifecycle.inventoryHookForTransition(
        fromStatus,
        toStatus,
      );
      const pay = this.lifecycle.paymentHookForTransition(fromStatus, toStatus);
      if (inv && this.sideEffects.onInventory) {
        await this.sideEffects.onInventory(inv, result.id);
      }
      if (pay && this.sideEffects.onPayment) {
        await this.sideEffects.onPayment(pay, result.id);
      }
    }

    return result;
  }

  async updateOrderFields(input: UpdateOrderFieldsInput) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireActiveOrder(tx, input.orderId);
      const data: Prisma.OrderUpdateInput = {};

      if (input.trackingNumber !== undefined) {
        this.editPolicy.assertFieldAllowed(
          input.context,
          order.status,
          'trackingNumber',
        );
        data.trackingNumber = input.trackingNumber;
      }
      if (input.carrier !== undefined) {
        this.editPolicy.assertFieldAllowed(
          input.context,
          order.status,
          'carrier',
        );
        data.carrier = input.carrier;
      }
      if (input.shippedAt !== undefined) {
        this.editPolicy.assertFieldAllowed(
          input.context,
          order.status,
          'shippedAt',
        );
        data.shippedAt = input.shippedAt;
      }
      if (input.adminTags !== undefined) {
        this.editPolicy.assertFieldAllowed(
          input.context,
          order.status,
          'adminTags',
        );
        data.adminTags = input.adminTags as Prisma.InputJsonValue;
      }
      if (input.reconciliationFlags !== undefined) {
        this.editPolicy.assertFieldAllowed(
          input.context,
          order.status,
          'reconciliationFlags',
        );
        data.reconciliationFlags =
          input.reconciliationFlags as Prisma.InputJsonValue;
      }

      if (input.shippingPhone !== undefined) {
        this.editPolicy.assertFieldAllowed(
          input.context,
          order.status,
          'shippingPhone',
        );
        await tx.orderAddress.update({
          where: {
            orderId_kind: {
              orderId: order.id,
              kind: OrderAddressKind.SHIPPING,
            },
          },
          data: { phone: input.shippingPhone },
        });
      }

      if (Object.keys(data).length === 0 && input.shippingPhone === undefined) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_MISSING_FIELD,
          message: 'No editable fields provided',
        });
      }

      const updated =
        Object.keys(data).length > 0
          ? await tx.order.update({
              where: { id: order.id },
              data,
              include: { addresses: true },
            })
          : await tx.order.findUniqueOrThrow({
              where: { id: order.id },
              include: { addresses: true },
            });

      await tx.orderActivity.create({
        data: {
          orderId: order.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'order_updated',
          summary: 'Order fields updated',
          metadata: {
            context: input.context,
            fields: Object.keys({
              ...data,
              ...(input.shippingPhone !== undefined
                ? { shippingPhone: true }
                : {}),
            }),
          },
        },
      });

      return updated;
    });
  }

  async addNote(input: AddOrderNoteInput) {
    const body = input.body?.trim();
    if (!body) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Note body is required',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.requireActiveOrder(tx, input.orderId);
      const note = await tx.orderNote.create({
        data: {
          orderId: input.orderId,
          authorUserId: input.authorUserId,
          body,
        },
      });
      await tx.orderActivity.create({
        data: {
          orderId: input.orderId,
          actorUserId: input.authorUserId,
          kind: 'note_added',
          summary: 'Internal note added',
          metadata: { noteId: note.id },
        },
      });
      return note;
    });
  }

  async addAdjustment(input: AddOrderAdjustmentInput) {
    if (!input.classDAuthorized) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_CLASS_D_DENIED,
        message: 'Order adjustments require Class D authorization',
      });
    }
    if (!Number.isInteger(input.amountCents)) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TOTALS,
        message: 'amountCents must be an integer',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireActiveOrder(tx, input.orderId);
      const adjustment = await tx.orderAdjustment.create({
        data: {
          orderId: order.id,
          kind: input.kind ?? OrderAdjustmentKind.CORRECTION,
          amountCents: input.amountCents,
          reason: input.reason ?? null,
          actorUserId: input.actorUserId ?? null,
          paymentRef: input.paymentRef ?? null,
          metadata: (input.metadata ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
      });

      const adjustments = await tx.orderAdjustment.findMany({
        where: { orderId: order.id },
      });
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
      });
      const recomputed = this.totals.computeOrder({
        lines: items.map((item) => ({
          unitPriceCents: item.unitPriceCents,
          salePriceCents: item.salePriceCents,
          quantity: item.quantity,
          discountCents: item.discountCents,
          taxCents: item.taxCents,
          lineSubtotalCents: item.lineSubtotalCents,
          lineTotalCents: item.lineTotalCents,
        })),
        shippingTotalCents: order.shippingTotalCents,
        discountTotalCents: order.discountTotalCents,
        taxTotalCents: order.taxTotalCents,
        adjustmentAmountsCents: adjustments.map((a) => a.amountCents),
        refundedTotalCents: order.refundedTotalCents,
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          adjustmentTotalCents: recomputed.adjustmentTotalCents,
          totalCents: recomputed.totalCents,
        },
      });

      await tx.orderActivity.create({
        data: {
          orderId: order.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'adjustment_added',
          summary: `Adjustment ${adjustment.kind} ${adjustment.amountCents}¢`,
          metadata: { adjustmentId: adjustment.id },
        },
      });

      return adjustment;
    });
  }

  /**
   * Class D administrative override — may bypass the normal transition graph.
   * Requires non-empty reason. Records history/activity with override source.
   * Platform Audit (GRD-053) is deferred; metadata marks `platformAuditDeferred`.
   */
  async overrideOrder(input: OverrideOrderInput) {
    this.assertClassD(input);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Override requires a non-empty reason',
      });
    }
    if (!Object.values(OrderStatus).includes(input.toStatus)) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_INVALID_FORMAT,
        message: 'Invalid override toStatus',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireActiveOrder(tx, input.orderId);
      const fromStatus = order.status;
      if (fromStatus === input.toStatus) {
        throw new BadRequestException({
          code: ErrorCodes.ORD_INVALID_TRANSITION,
          message: 'Override toStatus must differ from current status',
        });
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: input.toStatus },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus,
          toStatus: input.toStatus,
          actorUserId: input.actorUserId ?? null,
          source: 'guardian_override',
          reason,
          metadata: {
            classD: true,
            override: true,
            platformAuditDeferred: true,
            ...(input.metadata ?? {}),
          },
        },
      });

      await tx.orderActivity.create({
        data: {
          orderId: order.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'administrative_override',
          summary: `Override ${fromStatus} → ${input.toStatus}`,
          metadata: {
            classD: true,
            fromStatus,
            toStatus: input.toStatus,
            reason,
            platformAuditDeferred: true,
          },
        },
      });

      return updated;
    });
  }

  async softDeleteOrder(input: ClassDOrderInput) {
    this.assertClassD(input);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireActiveOrder(tx, input.orderId);
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { deletedAt: new Date() },
      });
      await tx.orderActivity.create({
        data: {
          orderId: order.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'order_soft_deleted',
          summary: 'Order soft-deleted (Class D)',
          metadata: {
            reason: input.reason ?? null,
            classD: true,
            platformAuditDeferred: true,
          },
        },
      });
      return updated;
    });
  }

  async archiveOrder(input: ClassDOrderInput) {
    this.assertClassD(input);
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireActiveOrder(tx, input.orderId);
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { archivedAt: new Date() },
      });
      await tx.orderActivity.create({
        data: {
          orderId: order.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'order_archived',
          summary: 'Order archived (Class D)',
          metadata: {
            reason: input.reason ?? null,
            classD: true,
            platformAuditDeferred: true,
          },
        },
      });
      return updated;
    });
  }

  async restoreOrder(input: ClassDOrderInput) {
    this.assertClassD(input);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: input.orderId } });
      if (!order) {
        throw new NotFoundException({
          code: ErrorCodes.ORD_NOT_FOUND,
          message: 'Order not found',
        });
      }
      if (order.deletedAt == null && order.archivedAt == null) {
        throw new BadRequestException({
          code: ErrorCodes.ORD_EDIT_FORBIDDEN,
          message: 'Order is not archived or soft-deleted',
        });
      }
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { deletedAt: null, archivedAt: null },
      });
      await tx.orderActivity.create({
        data: {
          orderId: order.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'order_restored',
          summary: 'Order restored (Class D)',
          metadata: {
            reason: input.reason ?? null,
            classD: true,
            platformAuditDeferred: true,
          },
        },
      });
      return updated;
    });
  }

  private assertClassD(input: ClassDOrderInput): void {
    if (!input.classDAuthorized) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_CLASS_D_DENIED,
        message: 'Class D authorization required',
      });
    }
  }

  private async requireActiveOrder(tx: Tx | PrismaService, orderId: string) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.deletedAt != null) {
      throw new NotFoundException({
        code: ErrorCodes.ORD_NOT_FOUND,
        message: 'Order not found',
      });
    }
    return order;
  }

  private async allocateOrderNumber(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `ORD-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
      const existing = await tx.order.findUnique({
        where: { orderNumber: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new ConflictException({
      code: ErrorCodes.ORD_CONFLICT,
      message: 'Unable to allocate unique order number',
    });
  }
}
