/**
 * brand.ts — Single source of truth for product naming and default theming.
 *
 * Every visible string and default color in the app reads from here. Swap
 * values in this file to white-label the product; no other code changes
 * required.
 */

export interface Brand {
  readonly name: string;
  readonly product: string;
  readonly company: string;
  readonly tagline: string;
  readonly domain: string;
  readonly website: string;
  readonly primary: string;
  readonly accent: string;
}

export const BRAND: Brand = {
  name:    'Mein Dynamics',
  product: 'Mein Dynamics',
  company: 'Deich Dynamics Solutions',
  tagline: 'Buchhaltung & CRM für deutsche KMU. Aus St. Peter-Ording.',
  domain:  'deich-dynamics.com',
  website: 'https://deich-dynamics.com',
  primary: '#1d3f36',
  accent:  '#a8c5b4',
};
