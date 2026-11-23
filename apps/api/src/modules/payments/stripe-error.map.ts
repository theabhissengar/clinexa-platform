import Stripe from 'stripe';

import { ErrorCodes } from '../../common/constants/error-codes';
import type { GatewayOutcomeClass } from './payment.types';

export type MappedStripeError = {
  outcomeClass: GatewayOutcomeClass;
  errorCode: string;
  errorMessage: string;
  providerPaymentRef?: string;
};

function isNamedError(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === name
  );
}

/**
 * Map Stripe SDK / API errors into Phase 6B/6C gateway outcome classes.
 * Connection/timeout → unknown; card declines → confirmed failure.
 */
export function mapStripeError(error: unknown): MappedStripeError {
  if (
    error instanceof Stripe.errors.StripeConnectionError ||
    isNamedError(error, 'StripeConnectionError')
  ) {
    return {
      outcomeClass: 'NETWORK_UNKNOWN',
      errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      errorMessage:
        error instanceof Error ? error.message : 'Stripe connection error',
    };
  }
  if (
    error instanceof Stripe.errors.StripeAPIError ||
    isNamedError(error, 'StripeAPIError')
  ) {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 0;
    if (status >= 500 || status === 429) {
      return {
        outcomeClass: 'NETWORK_UNKNOWN',
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage:
          error instanceof Error ? error.message : 'Stripe API unavailable',
      };
    }
  }
  if (
    error instanceof Stripe.errors.StripeCardError ||
    isNamedError(error, 'StripeCardError')
  ) {
    const cardErr = error as {
      message?: string;
      payment_intent?: string | { id?: string };
    };
    const pi =
      typeof cardErr.payment_intent === 'object' && cardErr.payment_intent
        ? cardErr.payment_intent.id
        : typeof cardErr.payment_intent === 'string'
          ? cardErr.payment_intent
          : undefined;
    return {
      outcomeClass: 'CONFIRMED_FAILURE',
      errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
      errorMessage: cardErr.message || 'Card declined',
      providerPaymentRef: pi,
    };
  }
  if (
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    isNamedError(error, 'StripeInvalidRequestError')
  ) {
    return {
      outcomeClass: 'CONFIRMED_FAILURE',
      errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      errorMessage:
        error instanceof Error ? error.message : 'Invalid Stripe request',
    };
  }
  if (
    error instanceof Stripe.errors.StripeError ||
    isNamedError(error, 'StripeError')
  ) {
    return {
      outcomeClass: 'NETWORK_UNKNOWN',
      errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      errorMessage: error instanceof Error ? error.message : 'Stripe error',
    };
  }
  if (error instanceof Error) {
    return {
      outcomeClass: 'NETWORK_UNKNOWN',
      errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      errorMessage: error.message,
    };
  }
  return {
    outcomeClass: 'NETWORK_UNKNOWN',
    errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
    errorMessage: 'Unknown Stripe failure',
  };
}
