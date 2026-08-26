import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Promotions domain boundaries', () => {
  const sources = readdirSync(__dirname)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .map((name) => ({
      name,
      text: readFileSync(join(__dirname, name), 'utf8'),
    }));

  it('does not call PaymentGateway or PSP adapters', () => {
    for (const file of sources) {
      expect(file.text.includes('PaymentGateway')).toBe(false);
      expect(file.text.includes('SimulatedPaymentAdapter')).toBe(false);
      expect(file.text.includes('../payments/')).toBe(false);
    }
  });
});
