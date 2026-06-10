export const SEND_PAYMENT_RECEIVED_MAIL_QUEUE =
  'SEND_PAYMENT_RECEIVED_MAIL_QUEUE';
export const SEND_PAYMENT_RECEIVED_MAIL_JOB = 'SEND_PAYMENT_RECEIVED_MAIL_JOB';

export const DEFAULT_PAYMENT_MAIL_SUBJECT =
  'Payment Received for {Customer Name} from {Company Name}';
export const DEFAULT_PAYMENT_MAIL_CONTENT = `Dear {Customer Name}

Thank you for your payment. It was a pleasure doing business with you. We look forward to work together again!

Payment Transaction: {Payment Number}
Payment Date : {Payment Date}
Amount : {Payment Amount}

Regards,
{Company Name}`;

export {
  DEFAULT_VIEWS,
  ERRORS,
} from '@/constants/Sales/PaymentReceives/constants';

export const PaymentsReceiveSampleData = [
  {
    Customer: 'Randall Kohler',
    'Payment Date': '2024-10-10',
    'Payment Receive No.': 'PAY-0001',
    'Reference No.': 'REF-0001',
    'Deposit Account': 'Petty Cash',
    'Exchange Rate': '',
    Statement: 'Totam optio quisquam qui.',
    Invoice: 'INV-00001',
    'Payment Amount': 850,
  },
];

export const defaultPaymentReceivedPdfTemplateAttributes = {
  // # Colors
  primaryColor: '#000',
  secondaryColor: '#000',

  // # Company logo
  showCompanyLogo: true,
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

  lines: [
    {
      invoiceNumber: 'INV-00001',
      invoiceAmount: '$1000.00',
      paidAmount: '$1000.00',
    },
  ],
  // Payment received number
  showPaymentReceivedNumber: true,
  paymentReceivedNumberLabel: 'Payment Number',
  paymentReceivedNumebr: '346D3D40-0001',

  // Payment date.
  paymentReceivedDate: 'September 3, 2024',
  showPaymentReceivedDate: true,
  paymentReceivedDateLabel: 'Payment Date',
};
