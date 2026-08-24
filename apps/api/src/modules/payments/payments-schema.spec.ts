import { readFileSync } from 'fs';
import { join } from 'path';

describe('Payments schema foundation (P14e)', () => {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );

  it('defines Payment / Refund / SavedPaymentMethod / WebhookEvent', () => {
    expect(schema).toContain('model Payment ');
    expect(schema).toContain('model Refund ');
    expect(schema).toContain('model SavedPaymentMethod ');
    expect(schema).toContain('model PaymentWebhookEvent ');
    expect(schema).toContain('enum PaymentStatus');
    expect(schema).toContain('enum PaymentLifecycleState');
  });

  it('adds Order.idempotencyKey', () => {
    expect(schema).toContain('idempotencyKey');
    expect(schema).toContain('@map("idempotency_key")');
  });
});
