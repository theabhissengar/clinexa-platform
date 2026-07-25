import { registerAs } from '@nestjs/config';

/**
 * Default OpenAPI document metadata.
 * `version` may be overridden at deploy time via SWAGGER_VERSION (CI/CD) without
 * changing application code — see registerAs factory below.
 */
const SWAGGER_DEFAULTS = {
  title: 'Clinexa Platform API',
  description: 'Backend API for the Clinexa healthcare platform',
  version: '0.1.0',
} as const;

export default registerAs('swagger', () => ({
  path: process.env.SWAGGER_PATH ?? 'api/docs',
  title: SWAGGER_DEFAULTS.title,
  description: SWAGGER_DEFAULTS.description,
  /**
   * Prefer SWAGGER_VERSION from the environment (set by CI/CD) when present;
   * otherwise fall back to the package default constant.
   */
  version: process.env.SWAGGER_VERSION?.trim() || SWAGGER_DEFAULTS.version,
}));
