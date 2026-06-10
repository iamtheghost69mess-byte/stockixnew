export {
  DEFAULT_VIEWS,
  DEFAULT_VIEW_COLUMNS,
  ERRORS,
} from '@/constants/Purchases/constants';

export const defaultBillBrandingAttributes = {
  primaryColor: '',
  secondaryColor: '',

  showCompanyLogo: true,
  companyLogoKey: '',
  companyLogoUri: '',

  companyName: 'Stockix Technology, Inc.',

  showVendorAddress: true,
  vendorAddress: '',

  showCompanyAddress: true,
  companyAddress: '',
  billedFromLabel: 'Vendor',

  total: '$1000.00',
  totalLabel: 'Total',
  showTotal: true,

  subtotal: '1000.00',
  subtotalLabel: 'Subtotal',
  showSubtotal: true,

  showBillNote: true,
  billNote:
    'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout.',
  billNoteLabel: 'Bill Note',

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

  showBillNumber: true,
  billNumberLabel: 'Bill Number',
  billNumber: 'BILL-0001',

  billDate: 'September 3, 2024',
  showBillDate: true,
  billDateLabel: 'Bill Date',

  dueDate: 'October 3, 2024',
  showDueDate: true,
  dueDateLabel: 'Due Date',
};

export const BillsSampleData = [
  {
    'Bill No.': 'B-101',
    'Reference No.': 'REF0',
    Date: '2024-01-01',
    'Due Date': '2024-03-01',
    Vendor: 'Gabriel Kovacek',
    'Exchange Rate': 1,
    Note: 'Vel in sit sint.',
    Open: 'T',
    Item: 'VonRueden, Ruecker and Hettinger',
    Quantity: 100,
    Rate: 100,
    'Line Description': 'Id a vel quis vel aut.',
  },
  {
    'Bill No.': 'B-102',
    'Reference No.': 'REF0',
    Date: '2024-01-01',
    'Due Date': '2024-03-01',
    Vendor: 'Gabriel Kovacek',
    'Exchange Rate': 1,
    Note: 'Quia ut dolorem qui sint velit.',
    Open: 'T',
    Item: 'Thompson - Reichert',
    Quantity: 200,
    Rate: 50,
    'Line Description':
      'Nesciunt in adipisci quia ab reiciendis nam sed saepe consequatur.',
  },
  {
    'Bill No.': 'B-103',
    'Reference No.': 'REF0',
    Date: '2024-01-01',
    'Due Date': '2024-03-01',
    Vendor: 'Gabriel Kovacek',
    'Exchange Rate': 1,
    Note: 'Dolore aut voluptatem minus pariatur alias pariatur.',
    Open: 'T',
    Item: 'VonRueden, Ruecker and Hettinger',
    Quantity: 100,
    Rate: 100,
    'Line Description': 'Quam eligendi provident.',
  },
];
