const SITE_URL = import.meta.env.SITE_URL || '';
const GOOGLE_SITE_VERIFICATION = import.meta.env.GOOGLE_SITE_VERIFICATION || '';
const BING_SITE_VERIFICATION = import.meta.env.BING_SITE_VERIFICATION || '';

export interface SiteConfig {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  author: string;
  email: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  socialLinks: string[];
  twitter?: {
    site: string;
    creator: string;
  };
  verification?: {
    google?: string;
    bing?: string;
  };
  /** ISO 3166-1 alpha-2 default country for phone input (e.g. 'AU', 'US', 'GB') */
  phoneCountryCode?: string;
  /**
   * Branding configuration
   * Logo files: Replace SVGs in src/assets/branding/
   * Favicon: Replace in public/favicon.svg
   */
  branding: {
    /** Logo alt text for accessibility */
    logo: {
      alt: string;
    };
    /** Favicon path (lives in public/) */
    favicon: {
      svg: string;
    };
    /** Theme colors for manifest and browser UI */
    colors: {
      /** Browser toolbar color (hex) */
      themeColor: string;
      /** PWA splash screen background (hex) */
      backgroundColor: string;
    };
  };
}

const siteConfig: SiteConfig = {
  name: 'AssetBolt',
  description: 'Turn your LinkedIn audience into an email list you own — with a qualification system that tells you which subscribers are worth your time.',
  url: SITE_URL || 'https://assetbolt.com',
  ogImage: '/og-default.png',
  author: 'Shlomo Freund',
  email: 'shlomo@freefinancialself.com',
  phoneCountryCode: 'IL',
  socialLinks: [],
  verification: {
    google: GOOGLE_SITE_VERIFICATION,
    bing: BING_SITE_VERIFICATION,
  },
  branding: {
    logo: {
      alt: 'AssetBolt',
    },
    favicon: {
      svg: '/favicon.svg',
    },
    colors: {
      themeColor: '#E8622A',
      backgroundColor: '#0D0A05',
    },
  },
};

export default siteConfig;
