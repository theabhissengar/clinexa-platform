import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ProviderConfigReadModel = {
  provider: string;
  mode: 'sandbox' | 'live';
  capabilities: readonly string[];
  webhookEndpointUrl: string;
};

const SIMULATED_CAPABILITIES = [
  'authorize',
  'capture',
  'void',
  'refund',
  'webhooks',
] as const;

const STRIPE_CAPABILITIES = [
  'authorize',
  'capture',
  'void',
  'refund',
  'webhooks',
  'retrieve',
] as const;

/**
 * Resolves the active PaymentGateway adapter and exposes non-secret metadata.
 */
@Injectable()
export class PaymentProviderRegistry {
  constructor(private readonly config: ConfigService) {}

  getActiveProviderName(): string {
    return this.config.get<string>('payments.provider') ?? 'simulated';
  }

  getReadModel(): ProviderConfigReadModel {
    const provider = this.getActiveProviderName();
    const modeRaw = (
      this.config.get<string>('payments.mode') ?? 'sandbox'
    ).toLowerCase();
    const mode: 'sandbox' | 'live' = modeRaw === 'live' ? 'live' : 'sandbox';
    const base = (
      this.config.get<string>('payments.webhookPublicBase') ??
      'http://localhost:3001'
    ).replace(/\/+$/, '');
    const prefix = this.config.get<string>('app.apiPrefix') ?? '';
    const prefixPart = prefix ? `/${prefix.replace(/^\/+|\/+$/g, '')}` : '';
    const webhookPath =
      provider === 'stripe'
        ? `${prefixPart}/v1/webhooks/payments/stripe`
        : `${prefixPart}/v1/webhooks/payments`;

    return {
      provider,
      mode,
      capabilities:
        provider === 'stripe' ? STRIPE_CAPABILITIES : SIMULATED_CAPABILITIES,
      webhookEndpointUrl: `${base}${webhookPath}`,
    };
  }
}
