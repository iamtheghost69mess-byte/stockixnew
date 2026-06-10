export const SendSaleInvoiceQueue = 'SendSaleInvoiceQueue';
export const SendSaleInvoiceMailJob = 'SendSaleInvoiceMailJob';

export const DEFAULT_INVOICE_MAIL_SUBJECT =
'Invoice {Invoice Number} from {Company Name} for {Customer Name}';
export const DEFAULT_INVOICE_MAIL_CONTENT = `Hi {Customer Name},

Here's invoice # {Invoice Number} for {Invoice Amount}

The amount outstanding of {Invoice Due Amount} is due on {Invoice Due Date}.

From your online payment page you can print a PDF or view your outstanding bills.

If you have any questions, please let us know.

Thanks,
{Company Name}
`;

export const DEFAULT_INVOICE_REMINDER_MAIL_SUBJECT =
  'Invoice {InvoiceNumber} reminder from {CompanyName}';
  export const DEFAULT_INVOICE_REMINDER_MAIL_CONTENT = `
  <p>Dear {CustomerName}</p>
<p>You might have missed the payment date and the invoice is now overdue by {OverdueDays} days.</p>
<p>Invoice <strong>#{InvoiceNumber}</strong><br />
Due Date : <strong>{InvoiceDueDate}</strong><br />
Amount   : <strong>{InvoiceAmount}</strong></p>

<p>
<i>Regards</i><br />
<i>{CompanyName}</i>
</p>
`;

export const PUBLIC_PAYMENT_LINK = "{BASE_URL}/payment/{PAYMENT_LINK_ID}";

export {
  DEFAULT_VIEWS,
  DEFAULT_VIEW_COLUMNS,
  ERRORS,
} from '@/constants/Sales/constants';

export const SaleInvoicesSampleData = [
  {
    'Invoice No.': 'B-101',
    'Reference No.': 'REF0',
    'Invoice Date': '2024-01-01',
    'Due Date': '2024-03-01',
    Customer: 'Harley Veum',
    'Exchange Rate': 1,
    'Invoice Message': 'Aspernatur doloremque amet quia aut.',
    'Terms & Conditions': 'Quia illum aut dolores.',
    Delivered: 'T',
    Item: 'VonRueden, Ruecker and Hettinger',
    Quantity: 100,
    Rate: 100,
    Description: 'Description',
  },
  {
    'Invoice No.': 'B-102',
    'Reference No.': 'REF0',
    'Invoice Date': '2024-01-01',
    'Due Date': '2024-03-01',
    Customer: 'Harley Veum',
    'Exchange Rate': 1,
    'Invoice Message': 'Est omnis enim vel.',
    'Terms & Conditions': 'Iusto et sint nobis sit.',
    Delivered: 'T',
    Item: 'Thompson - Reichert',
    Quantity: 200,
    Rate: 50,
    Description: 'Description',
  },
  {
    'Invoice No.': 'B-103',
    'Reference No.': 'REF0',
    'Invoice Date': '2024-01-01',
    'Due Date': '2024-03-01',
    Customer: 'Harley Veum',
    'Exchange Rate': 1,
    'Invoice Message':
      'Repudiandae voluptatibus repellat minima voluptatem rerum veniam.',
    'Terms & Conditions': 'Id quod inventore ex rerum velit sed.',
    Delivered: 'T',
    Item: 'VonRueden, Ruecker and Hettinger',
    Quantity: 100,
    Rate: 100,
    Description: 'Description',
  },
];

export const defaultInvoicePdfTemplateAttributes = {
  primaryColor: 'red',
  secondaryColor: 'red',

  companyName: 'Stockix Technology, Inc.',

  showCompanyLogo: true,
  companyLogoKey: '',
  companyLogoUri: '',

  dueDateLabel: 'Date due',
  showDueDate: true,

  dateIssueLabel: 'Date of issue',
  showDateIssue: true,

  // # Invoice number,
  invoiceNumberLabel: 'Invoice number',
  showInvoiceNumber: true,

  // # Customer address
  showCustomerAddress: true,
  customerAddress: '',

  // # Company address
  showCompanyAddress: true,
  companyAddress: '',
  billedToLabel: 'Billed To',

  // Entries
  lineItemLabel: 'Item',
  lineQuantityLabel: 'Qty',
  lineRateLabel: 'Rate',
  lineTotalLabel: 'Total',

  totalLabel: 'Total',
  subtotalLabel: 'Subtotal',
  discountLabel: 'Discount',
  paymentMadeLabel: 'Payment Made',
  balanceDueLabel: 'Balance Due',

  // Totals
  showTotal: true,
  showSubtotal: true,
  showDiscount: true,
  showTaxes: true,
  showPaymentMade: true,
  showDueAmount: true,
  showBalanceDue: true,

  discount: '0.00',

  // Footer paragraphs.
  termsConditionsLabel: 'Terms & Conditions',
  showTermsConditions: true,

  lines: [
    {
      item: 'Simply dummy text',
      description: 'Simply dummy text of the printing and typesetting',
      rate: '1',
      quantity: '1000',
      total: '$1000.00',
    },
  ],
  taxes: [
    { label: 'Sample Tax1 (4.70%)', amount: '11.75' },
    { label: 'Sample Tax2 (7.00%)', amount: '21.74' },
  ],

  // # Statement
  statementLabel: 'Statement',
  showStatement: true,
};
