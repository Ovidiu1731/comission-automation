/**
 * Business constants for commission automation
 */

// Romanian month names (used for filtering records)
export const ROMANIAN_MONTHS = [
  'Ianuarie',   // 0 - January
  'Februarie',  // 1 - February
  'Martie',     // 2 - March
  'Aprilie',    // 3 - April
  'Mai',        // 4 - May
  'Iunie',      // 5 - June
  'Iulie',      // 6 - July
  'August',     // 7 - August
  'Septembrie', // 8 - September
  'Octombrie',  // 9 - October
  'Noiembrie',  // 10 - November
  'Decembrie'   // 11 - December
];

// Table names in Airtable
export const TABLES = {
  MONTHLY_COMMISSIONS: 'Comisioane Lunare',
  SALES: 'Vânzări',
  REPRESENTATIVES: 'Reprezentanți',
  EXPENSES: 'Cheltuieli',
  PNL: 'P&L\'s'
};

// Field names mapping
export const FIELDS = {
  // Comisioane Lunare
  NAME: 'Nume',
  REPRESENTATIVE: 'Reprezentant',
  MONTH: 'Lună',
  FINAL_COMMISSION: 'Comision final',
  SALES: 'Vânzări',
  ROLE: 'Rol',
  TOTAL_MONTHLY_SALES: 'Total Vânzări Lunare',
  SETTER_CALLER_SUM: 'Suma Comision Setter/Caller',
  TEAM_LEADER_COMMISSION: 'Comision Team Leader',
  
  // Vânzări
  CLIENT_NAME: 'Nume client',
  SALE_DATE: 'Data vânzării',
  SALES_REP: 'Reprezentant',
  PROJECT: 'Proiect',
  TOTAL_AMOUNT: 'Suma Totală',
  AMOUNT_WITHOUT_VAT: 'Total După TVA',
  SALE_MONTH: 'Lună vânzare',
  COMMISSION_PERCENT: 'Comision',
  FINAL_COMMISSION_SALE: 'Comision Final',
  SETTER_CALLER_COMMISSION: 'Comision Setter/Caller',
  UTM_CAMPAIGN: 'Utm Campaign',
  PAYMENT_METHOD: 'Modalitate de plata',
  MONTHLY_COMMISSIONS: 'Comisioane Lunare',
  
  // Reprezentanți
  REP_NAME: 'Nume',
  REP_EMAIL: 'Email',
  REP_CIF: 'CIF',
  REP_ROLE: 'Rol',
  REP_ANNUAL_SALES: 'Vânzări totale (anuale)',
  REP_MONTHLY_COMMISSIONS: 'Comisioane Lunare',
  
  // Cheltuieli
  EXPENSE_TYPE: 'Tip Cheltuiala',
  EXPENSE_DESCRIPTION: 'Descriere',
  EXPENSE_PROJECT: 'Proiect',
  EXPENSE_CATEGORY: 'Categorie',
  EXPENSE_AMOUNT: 'Suma',
  EXPENSE_VAT_INCLUDED: 'TVA Inclus',
  EXPENSE_MONTH: 'Luna',
  EXPENSE_YEAR: 'An',
  EXPENSE_SOURCE: 'Sursa',
  EXPENSE_ID: 'ID',
  EXPENSE_LAST_UPDATE: 'Ultima Actualizare',
  EXPENSE_ASSOCIATED_SALES: 'Vanzari Asociate',
  
  // P&L's
  PNL_CHELTUIALA: 'Cheltuiala',
  PNL_SUMA: 'Suma',
  PNL_DESCRIERE: 'Descriere',
  PNL_PROJECT: 'Proiect',
  PNL_MONTH: 'Luna',
  PNL_YEAR: 'An',
  PNL_CATEGORY: 'Categorie',
  PNL_SOURCE: 'Sursa'
};

// Category options for expenses (must match Airtable "Categorie" field options)
export const EXPENSE_CATEGORIES = {
  REPRESENTATIVES: 'Reprezentanți',
  CALLER: 'Caller',
  SETTER: 'Setter',
  TEAM_LEADER: 'Team Leader',
  TEAM_LEADER_SETTER: 'Team Leader Setter',
  TEAM_LEADER_CALLER: 'Team Leader Caller',
  STRIPE: 'Stripe',
  FACEBOOK_ADS: 'Reclame Facebook',
  COPYWRITING: 'Copywriting',
  UNKNOWN: 'Unknown'
};

// Valid CamelCase name regex for setter/caller validation
export const SETTER_CALLER_NAME_REGEX = /^[A-Z][a-z]+[A-Z][a-z]+$/;

// VAT inclusion option
export const VAT_INCLUDED = {
  YES: 'Da',
  NO: 'Nu'
};

// Source options
export const SOURCE = {
  AUTOMATIC: 'Automat',
  MANUAL: 'Manual'
};

// P&L Categories (must match Airtable "Categorie" field options in P&L's table)
export const PNL_CATEGORIES = {
  INCASARI: 'Incasari',
  MARKETING: 'Marketing',
  REPREZENTANTI: 'Reprezentanti',
  CALLERI: 'Calleri',
  SETTERI: 'Setteri',
  TEAM_LEADERS: 'TeamLeaders',
  TAXE_IMPOZITE: 'Taxe & Impozite'
};

// Expense type options
export const EXPENSE_TYPES = {
  COMMISSIONS: 'Comisioane',
  BANKING_FEES: 'Taxe și comisioane bancare',
  OTHER: 'Altele'
};

// Setter/Caller commission percentage (5%)
export const SETTER_CALLER_COMMISSION_RATE = 0.05;

// Team Leader configuration
export const TEAM_LEADERS = {
  SETTER: {
    name: 'George Coapsi',
    commissionRate: 0.05, // 5%
    category: 'Team Leader' // Using existing category; user can manually change to 'Team Leader Setter' if option exists
  },
  CALLER: {
    name: 'Alexandru Prisiceanu',
    commissionRate: 0.02, // 2%
    category: 'Team Leader' // Using existing category; user can manually change to 'Team Leader Caller' if option exists
  }
};

// Stripe fee configuration
export const STRIPE = {
  feeRate: 0.02, // 2%
  paymentMethodIdentifier: 'link', // For case-insensitive matching (any payment method containing "link")
  category: 'Stripe'
};

// Project names for campaign mapping
export const PROJECTS = [
  'Arta Vizibilitatii',
  'CODCOM',
  'Andrei Bordeianu',
  'Artok Academy'
];

// Facebook Ads configuration
export const FACEBOOK = {
  apiVersion: 'v21.0',
  baseUrl: 'https://graph.facebook.com',
  category: 'Reclame Facebook',
  defaultProject: 'Cheltuială Comună', // For unmapped campaigns
  projects: PROJECTS,
  rateLimit: {
    maxCalls: 200, // Per hour
    retryDelay: 60000, // 60 seconds
    maxRetries: 3
  },
  timeout: 30000, // 30 second timeout for API calls
  tokenExpiryWarningDays: 7, // Warn when token expires in less than 7 days
  expectedCurrency: 'RON'
};

// Copywriting commission configuration
export const COPYWRITING = {
  copywriter: {
    name: 'Diana Nastase',
    utmIdentifier: 'diananastase', // For matching (normalized)
  },
  category: 'Copywriting',
  // Progressive tier structure (based on EUR thresholds)
  tiers: [
    { max: 10000, rate: 0.05 },     // 5% up to €10,000
    { max: 25000, rate: 0.075 },    // 7.5% €10,001-€25,000
    { max: Infinity, rate: 0.10 }   // 10% over €25,001
  ],
  eurRonRate: 5.0 // Approximate EUR/RON exchange rate (RON / EUR)
};

/**
 * Get current Romanian month name
 * @returns {string} Current month name (e.g., "Octombrie")
 */
export function getCurrentRomanianMonth() {
  // TEMPORARY: Force October for testing individual expense records
  return 'Octombrie';
  // const now = new Date();
  // return ROMANIAN_MONTHS[now.getMonth()];
}

/**
 * Get current year
 * @returns {number} Current year (e.g., 2025)
 */
export function getCurrentYear() {
  return 2025;
  // return new Date().getFullYear();
}

/**
 * Format month-year string for filtering sales
 * @returns {string} Format: "Octombrie 2025"
 */
export function getCurrentMonthYearString() {
  const month = getCurrentRomanianMonth();
  const year = getCurrentYear();
  return `${month} ${year}`;
}

