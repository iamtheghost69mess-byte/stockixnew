export {
  DEFAULT_VIEWS,
  DEFAULT_VIEW_COLUMNS,
  ERRORS,
} from '@/constants/CreditNotes/constants';

export const defaultCreditNoteBrandingAttributes = {
  // # Colors
  primaryColor: '',
  secondaryColor: '',

  // # Company logo
  showCompanyLogo: true,
  companyLogoKey: '',
  companyLogoUri: '',

  // # Company name
  companyName: 'Stockix Technology, Inc.',

  // # Customer address
  showCustomerAddress: true,
  customerAddress: '',

  // # Company address
  showCompanyAddress: true,
  companyAddress: '',
  billedToLabel: 'Billed To',

  // Total
  total: '$1000.00',
  totalLabel: 'Total',
  showTotal: true,

  // Subtotal
  subtotal: '1000/00',
  subtotalLabel: 'Subtotal',
  showSubtotal: true,

  // Customer note
  showCustomerNote: true,
  customerNote:
    'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout.',
  customerNoteLabel: 'Customer Note',

  // Terms & conditions
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
  // Credit note number.
  showCreditNoteNumber: true,
  creditNoteNumberLabel: 'Credit Note Number',
  creditNoteNumebr: '346D3D40-0001',

  // Credit note date.
  creditNoteDate: 'September 3, 2024',
  showCreditNoteDate: true,
  creditNoteDateLabel: 'Credit Note Date',
};
