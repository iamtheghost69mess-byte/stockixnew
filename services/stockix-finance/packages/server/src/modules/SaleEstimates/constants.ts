export const DEFAULT_ESTIMATE_REMINDER_MAIL_SUBJECT =
  'Estimate {Estimate Number} is awaiting your approval';
export const DEFAULT_ESTIMATE_REMINDER_MAIL_CONTENT = `Hi {Customer Name},

Here's estimate # {Estimate Number} for {Estimate Amount}

This estimate is valid until {Estimate Expiration Date}, and we’re happy to discuss any adjustments you or questions may have.

Please find your estimate attached to this email for your reference.

If you have any questions, please let us know.

Thanks,
{Company Name}`;

export {
  DEFAULT_VIEWS,
  DEFAULT_VIEW_COLUMNS,
  ERRORS,
} from '@/constants/Sales/Estimates/constants';

export const SaleEstimatesSampleData = [
  {
    Customer: 'Ambrose Olson',
    'Estimate Date': '2024-01-01',
    'Expiration Date': '2025-01-01',
    'Estimate No.': 'EST-0001',
    'Reference No.': 'REF-0001',
    Currency: '',
    'Exchange Rate': '',
    Note: 'Vel autem quis aut ab.',
    'Terms & Conditions': 'Provident illo architecto sit iste in.',
    Delivered: 'T',
    'Item Name': 'Hettinger, Schumm and Bartoletti',
    Quantity: 1000,
    Rate: 20,
    'Line Description': 'Rem esse doloremque praesentium harum maiores.',
  },
  {
    Customer: 'Ambrose Olson',
    'Estimate Date': '2024-01-02',
    'Expiration Date': '2025-01-02',
    'Estimate No.': 'EST-0002',
    'Reference No.': 'REF-0002',
    Currency: '',
    'Exchange Rate': '',
    Note: 'Tempora voluptas odio deleniti rerum vitae consequatur nihil quis sunt.',
    'Terms & Conditions': 'Ut eum incidunt quibusdam rerum vero.',
    Delivered: 'T',
    'Item Name': 'Hettinger, Schumm and Bartoletti',
    Quantity: 1000,
    Rate: 20,
    'Line Description': 'Qui voluptate aliquam maxime aliquam.',
  },
  {
    Customer: 'Ambrose Olson',
    'Estimate Date': '2024-01-03',
    'Expiration Date': '2025-01-03',
    'Estimate No.': 'EST-0003',
    'Reference No.': 'REF-0003',
    Currency: '',
    'Exchange Rate': '',
    Note: 'Quia voluptatem delectus doloremque.',
    'Terms & Conditions': 'Facilis porro vitae ratione.',
    Delivered: 'T',
    'Item Name': 'Hettinger, Schumm and Bartoletti',
    Quantity: 1000,
    Rate: 20,
    'Line Description': 'Qui suscipit ducimus qui qui.',
  },
];

export const defaultEstimatePdfBrandingAttributes = {
  primaryColor: '#000',
  secondaryColor: '#000',

  // # Company logo
  showCompanyLogo: true,
  companyLogoUri: '',
  companyLogoKey: '',

  companyName: '',

  customerAddress: '',
  companyAddress: '',
  showCustomerAddress: true,
  showCompanyAddress: true,
  billedToLabel: 'Billed To',

  total: '$1000.00',
  totalLabel: 'Total',
  showTotal: true,

  subtotal: '1000/00',
  subtotalLabel: 'Subtotal',
  showSubtotal: true,

  showCustomerNote: true,
  customerNote:
    'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout.',
  customerNoteLabel: 'Customer Note',

  showTermsConditions: true,
  termsConditions:
    'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout.',
  termsConditionsLabel: 'Terms & Conditions',

  lines: [
    {
      item: 'Simply dummy text',
      description: 'Simply dummy text of the printing and typesetting',
      rate: '1',
      quantity: '1000',
      total: '$1000.00',
    },
  ],
  showEstimateNumber: true,
  estimateNumberLabel: 'Estimate Number',
  estimateNumebr: '346D3D40-0001',

  estimateDate: 'September 3, 2024',
  showEstimateDate: true,
  estimateDateLabel: 'Estimate Date',

  expirationDateLabel: 'Expiration Date',
  showExpirationDate: true,
  expirationDate: 'September 3, 2024',
};

interface EstimatePdfBrandingLineItem {
  item: string;
  description: string;
  rate: string;
  quantity: string;
  total: string;
}

export interface EstimatePdfBrandingAttributes {
  primaryColor: string;
  secondaryColor: string;
  showCompanyLogo: boolean;
  companyLogo: string;
  companyName: string;

  // Customer Address
  showCustomerAddress: boolean;
  customerAddress: string;

  // Company Address
  showCompanyAddress: boolean;
  companyAddress: string;
  billedToLabel: string;

  total: string;
  totalLabel: string;
  showTotal: boolean;

  subtotal: string;
  subtotalLabel: string;
  showSubtotal: boolean;

  showCustomerNote: boolean;
  customerNote: string;
  customerNoteLabel: string;

  showTermsConditions: boolean;
  termsConditions: string;
  termsConditionsLabel: string;

  lines: EstimatePdfBrandingLineItem[];

  showEstimateNumber: boolean;
  estimateNumberLabel: string;
  estimateNumebr: string;

  estimateDate: string;
  showEstimateDate: boolean;
  estimateDateLabel: string;

  expirationDateLabel: string;
  showExpirationDate: boolean;
  expirationDate: string;
}
