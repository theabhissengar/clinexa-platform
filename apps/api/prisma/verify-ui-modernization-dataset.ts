import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { OrderType, PrismaClient } from '../generated/prisma';

async function main(): Promise<void> {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.count({
      where: { email: { startsWith: 'dev.ui.patient.' } },
    });
    const parents = await prisma.order.count({
      where: {
        orderNumber: { startsWith: 'ORD-UI-' },
        NOT: { orderNumber: { startsWith: 'ORD-UI-R-' } },
        orderType: OrderType.SUBSCRIPTION_INITIAL,
      },
    });
    const renewals = await prisma.order.count({
      where: {
        orderNumber: { startsWith: 'ORD-UI-R-' },
        orderType: OrderType.SUBSCRIPTION_RENEWAL,
      },
    });
    const subs = await prisma.subscription.count({
      where: {
        subscriptionNumber: { startsWith: 'SUB-UI-' },
        status: 'ACTIVE',
      },
    });
    const attempts = await prisma.subscriptionRenewalAttempt.count({
      where: {
        subscription: { subscriptionNumber: { startsWith: 'SUB-UI-' } },
      },
    });
    const orphans = await prisma.subscription.count({
      where: {
        subscriptionNumber: { startsWith: 'SUB-UI-' },
        OR: [{ initialOrderId: null }, { latestOrderId: null }],
      },
    });
    const unlinkedParents = await prisma.order.count({
      where: {
        orderNumber: { startsWith: 'ORD-UI-' },
        NOT: { orderNumber: { startsWith: 'ORD-UI-R-' } },
        subscriptionId: null,
      },
    });
    const multiParentUsers = await prisma.order.groupBy({
      by: ['patientUserId'],
      where: {
        orderNumber: { startsWith: 'ORD-UI-' },
        NOT: { orderNumber: { startsWith: 'ORD-UI-R-' } },
      },
      _count: { _all: true },
      having: { patientUserId: { _count: { gt: 1 } } },
    });
    const sample = await prisma.subscription.findMany({
      where: { subscriptionNumber: { startsWith: 'SUB-UI-' } },
      take: 3,
      orderBy: { subscriptionNumber: 'asc' },
      select: {
        subscriptionNumber: true,
        status: true,
        patient: { select: { email: true } },
        initialOrder: {
          select: { orderNumber: true, orderType: true, status: true },
        },
        latestOrder: {
          select: { orderNumber: true, orderType: true, status: true },
        },
        renewalAttempts: {
          select: { status: true, orderId: true },
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          users,
          parents,
          renewals,
          subs,
          attempts,
          orphans,
          unlinkedParents,
          multiParentUsers: multiParentUsers.length,
          sample,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
