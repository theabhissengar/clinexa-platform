import { ConfigService } from '@nestjs/config';

import { ErrorCodes } from '../../common/constants/error-codes';
import { StripePaymentAdapter } from './stripe-payment.adapter';

const mockCreate = jest.fn();
const mockCapture = jest.fn();
const mockCancel = jest.fn();
const mockRefundCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockRefundRetrieve = jest.fn();
const mockConstructEvent = jest.fn();
const mockSearch = jest.fn();

jest.mock('stripe', () => {
  class StripeConnectionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StripeConnectionError';
    }
  }
  class StripeCardError extends Error {
    payment_intent?: string;
    constructor(message: string) {
      super(message);
      this.name = 'StripeCardError';
    }
  }
  const MockStripe = jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockCreate,
      capture: mockCapture,
      cancel: mockCancel,
      retrieve: mockRetrieve,
      search: mockSearch,
    },
    refunds: {
      create: mockRefundCreate,
      retrieve: mockRefundRetrieve,
    },
    webhooks: { constructEvent: mockConstructEvent },
    paymentMethods: { retrieve: jest.fn() },
    customers: { create: jest.fn(), search: jest.fn() },
  }));
  return {
    __esModule: true,
    default: Object.assign(MockStripe, {
      errors: {
        StripeConnectionError,
        StripeCardError,
        StripeAPIError: class extends Error {
          name = 'StripeAPIError';
        },
        StripeInvalidRequestError: class extends Error {
          name = 'StripeInvalidRequestError';
        },
        StripeError: class extends Error {
          name = 'StripeError';
        },
      },
    }),
  };
});

describe('StripePaymentAdapter', () => {
  let adapter: StripePaymentAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'payments.stripeSecretKey') return 'sk_test_abc';
        if (key === 'payments.stripeWebhookSecret') return 'whsec_test';
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'payments.stripeWebhookSecret') return 'whsec_test';
        throw new Error(key);
      }),
    } as unknown as ConfigService;
    adapter = new StripePaymentAdapter(config);
  });

  it('authorizes requires_capture as SUCCESS', async () => {
    mockCreate.mockResolvedValue({
      id: 'pi_1',
      status: 'requires_capture',
      latest_charge: null,
    });
    const result = await adapter.authorize({
      amountCents: 1000,
      currency: 'USD',
      providerMethodRef: 'pm_1',
      idempotencyKey: 'key-1',
      metadata: { clinexa_payment_id: 'pay-1' },
    });
    expect(result.success).toBe(true);
    expect(result.outcomeClass).toBe('SUCCESS');
    expect(result.providerPaymentRef).toBe('pi_1');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'usd',
        capture_method: 'manual',
        confirm: true,
      }),
      expect.objectContaining({ idempotencyKey: 'key-1' }),
    );
  });

  it('maps requires_action to ACTION_REQUIRED without success', async () => {
    mockCreate.mockResolvedValue({
      id: 'pi_sca',
      status: 'requires_action',
      client_secret: 'pi_sca_secret_x',
      latest_charge: null,
    });
    const result = await adapter.authorize({
      amountCents: 1000,
      currency: 'USD',
      providerMethodRef: 'pm_1',
      idempotencyKey: 'key-sca',
    });
    expect(result.success).toBe(false);
    expect(result.outcomeClass).toBe('ACTION_REQUIRED');
    expect(result.providerPaymentRef).toBe('pi_sca');
    expect(result.clientSecret).toBe('pi_sca_secret_x');
  });

  it('omits clientSecret when authorization succeeds', async () => {
    mockCreate.mockResolvedValue({
      id: 'pi_ok',
      status: 'requires_capture',
      client_secret: 'should_not_leak',
      latest_charge: null,
    });
    const result = await adapter.authorize({
      amountCents: 1000,
      currency: 'USD',
      providerMethodRef: 'pm_1',
      idempotencyKey: 'key-ok',
    });
    expect(result.outcomeClass).toBe('SUCCESS');
    expect(result.clientSecret).toBeUndefined();
  });

  it('maps connection errors to NETWORK_UNKNOWN', async () => {
    const err = new Error('timeout');
    err.name = 'StripeConnectionError';
    mockCreate.mockRejectedValue(err);
    const result = await adapter.authorize({
      amountCents: 1000,
      currency: 'USD',
      providerMethodRef: 'pm_1',
      idempotencyKey: 'key-to',
    });
    expect(result.outcomeClass).toBe('NETWORK_UNKNOWN');
    expect(result.errorCode).toBe(ErrorCodes.PAY_PROVIDER_UNAVAILABLE);
  });

  it('searchPaymentIntentsByPaymentId returns empty on provider error (not absence proof)', async () => {
    mockSearch.mockRejectedValue(new Error('search unavailable'));
    const hits = await adapter.searchPaymentIntentsByPaymentId('pay-uuid');
    expect(hits).toEqual([]);
  });

  it('searchPaymentIntentsByPaymentId returns matches when found', async () => {
    mockSearch.mockResolvedValue({ data: [{ id: 'pi_found' }] });
    const hits = await adapter.searchPaymentIntentsByPaymentId('pay-uuid');
    expect(hits).toEqual([{ id: 'pi_found' }]);
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'metadata["clinexa_payment_id"]:"pay-uuid"',
      }),
    );
  });

  it('cancelRecurring returns unsupported', async () => {
    const result = await adapter.cancelRecurring({
      providerSubscriptionRef: 'sub_x',
    });
    expect(result).toMatchObject({
      ok: false,
      unsupported: true,
      errorCode: ErrorCodes.PAY_UNSUPPORTED_OPERATION,
    });
  });

  it('refund pending returns unknown with providerRefundRef', async () => {
    mockRefundCreate.mockResolvedValue({
      id: 're_1',
      status: 'pending',
    });
    const result = await adapter.refund({
      providerPaymentRef: 'pi_1',
      providerCaptureRef: 'ch_1',
      amountCents: 500,
      idempotencyKey: 'ref-1',
    });
    expect(result.success).toBe(false);
    expect(result.outcomeClass).toBe('NETWORK_UNKNOWN');
    expect(result.providerRefundRef).toBe('re_1');
  });
});
