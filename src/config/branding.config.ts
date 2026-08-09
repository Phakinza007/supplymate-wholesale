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
    primary: 'oklch(0.50949 0.08948 166.01)',
    secondary: 'oklch(0.64795 0.14979 38.33)',
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
