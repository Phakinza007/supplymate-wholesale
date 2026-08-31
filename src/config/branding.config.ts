export interface FeatureFlags {
  reviews: boolean
  qna: boolean
  variants: boolean
  analyticsDashboard: boolean
  stockAutomation: boolean
  lineNotify: boolean
  pdfDocuments: boolean
  promotions: boolean
}

export interface BrandConfig {
  storeName: string
  logoUrl: string
  colors: {
    primary: string
    secondary: string
  }
  theme: 'light' | 'dark'
  currencySymbol: string
  bankTransfer: {
    bankName: string
    accountName: string
    accountNumber: string
  }
  features: FeatureFlags
}

/**
 * Per-client overrides live here. Core code must never read branding or
 * feature-flag values from anywhere else — see CLAUDE.md.
 */
export const brandConfig: BrandConfig = {
  storeName: 'SupplyMate Wholesale',
  logoUrl: '/images/supplymate/brandmark.svg',
  colors: {
    // Ledger direction: `primary` is the ink the whole interface is written in
    // (and what primary buttons are filled with); `secondary` is the single
    // signal colour, reserved for focus rings and the current selection.
    // Order-status colours live in src/index.css, not here — they are semantic,
    // not brand, and a client reskin must not be able to make "cancelled" green.
    primary: 'oklch(0.24 0.045 265)',
    secondary: 'oklch(0.52 0.14 262)',
  },
  theme: 'light',
  currencySymbol: '฿',
  bankTransfer: {
    bankName: 'Demo Bank (display only)',
    accountName: 'SupplyMate Demo Account',
    accountNumber: '000-000-0000 (demo only)',
  },
  features: {
    reviews: false,
    qna: false,
    variants: true,
    analyticsDashboard: false,
    stockAutomation: false,
    lineNotify: false,
    pdfDocuments: false,
    promotions: true,
  },
}
