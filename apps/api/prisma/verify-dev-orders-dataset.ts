import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma';
import {
  DEV_ORDER_NUMBER_PREFIX,
  DEV_PATIENT_EMAIL_PREFIX,
} from './data/dev-orders-dataset';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL required');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const patients = await prisma.user.count({
      where: { email: { startsWith: DEV_PATIENT_EMAIL_PREFIX } },
    });
    const users = await prisma.user.count({ where: { deletedAt: null } });
    const orders = await prisma.order.count({
      where: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
    });
    const empty = await prisma.order.count({
      where: {
        orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX },
        items: { none: {} },
      },
    });
    const items = await prisma.orderItem.count({
      where: {
        order: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
      },
    });
    const history = await prisma.orderStatusHistory.count({
      where: {
        order: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
      },
    });
    const activity = await prisma.orderActivity.count({
      where: {
        order: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
      },
    });
    const notes = await prisma.orderNote.count({
      where: {
        order: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
      },
    });
    const byStatus = await prisma.order.groupBy({
      by: ['status'],
      where: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
      _count: { _all: true },
    });
    const byType = await prisma.order.groupBy({
      by: ['orderType'],
      where: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
      _count: { _all: true },
    });

    console.log(
      JSON.stringify(
        {
          patients,
          users,
          orders,
          emptyItemOrders: empty,
          items,
          history,
          activity,
          notes,
          byStatus,
          byType,
        },
        null,
        2,
      ),
    );

    if (patients < 150 || orders < 100 || empty > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
