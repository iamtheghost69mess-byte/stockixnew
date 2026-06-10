import {
  PaperTemplate,
  PaperTemplateProps,
  PaperTemplateTotalBorder,
  PdfDisplayTotalItem,
} from './PaperTemplate';
import { Box } from '../lib/layout/Box';
import { Text } from '../lib/text/Text';
import { Stack } from '../lib/layout/Stack';
import { Group } from '../lib/layout/Group';
import {
  DefaultPdfTemplateTerms,
  DefaultPdfTemplateItemDescription,
  DefaultPdfTemplateItemName,
  DefaultPdfTemplateAddressBilledTo,
  DefaultPdfTemplateAddressBilledFrom,
} from './_constants';

interface BillLine {
  item?: string;
  description?: string;
  quantity?: string;
  rate?: string;
  total?: string;
}

export interface BillPaperTemplateProps extends PaperTemplateProps {
  primaryColor?: string;
  secondaryColor?: string;

  // Company
  showCompanyLogo?: boolean;
  companyLogoUri?: string;

  companyName?: string;

  // Bill number
  showBillNumber?: boolean;
  billNumber?: string;
  billNumberLabel?: string;

  // Bill date
  showBillDate?: boolean;
  billDate?: string;
  billDateLabel?: string;

  // Due date
  showDueDate?: boolean;
  dueDate?: string;
  dueDateLabel?: string;

  // Address
  showVendorAddress?: boolean;
  vendorAddress?: string;

  showCompanyAddress?: boolean;
  companyAddress?: string;

  billedFromLabel?: string;

  // Entries
  lineItemLabel?: string;
  lineQuantityLabel?: string;
  lineRateLabel?: string;
  lineTotalLabel?: string;

  // Subtotal
  showSubtotal?: boolean;
  subtotalLabel?: string;
  subtotal?: string;

  // Total
  showTotal?: boolean;
  totalLabel?: string;
  total?: string;

  // Bill Note
  showBillNote?: boolean;
  billNote?: string;
  billNoteLabel?: string;

  // Terms & Conditions
  showTermsConditions?: boolean;
  termsConditions?: string;
  termsConditionsLabel?: string;

  lines?: Array<BillLine>;
  displayTotals?: PdfDisplayTotalItem[];
}

export function BillPaperTemplate({
  // # Colors
  primaryColor,
  secondaryColor,

  // # Company
  companyName = 'Bigcapital Technology, Inc.',

  showCompanyLogo = true,
  companyLogoUri = '',

  // # Bill number
  billNumberLabel = 'Bill Number',
  billNumber = 'BILL-0001',
  showBillNumber = true,

  // # Bill date
  billDate = 'September 3, 2024',
  billDateLabel = 'Bill Date',
  showBillDate = true,

  // # Due date
  dueDate = 'October 3, 2024',
  dueDateLabel = 'Due Date',
  showDueDate = true,

  // Address
  showVendorAddress = true,
  vendorAddress = DefaultPdfTemplateAddressBilledTo,

  showCompanyAddress = true,
  companyAddress = DefaultPdfTemplateAddressBilledFrom,

  billedFromLabel = 'Vendor',

  // Entries
  lineItemLabel = 'Item',
  lineQuantityLabel = 'Qty',
  lineRateLabel = 'Rate',
  lineTotalLabel = 'Total',

  // Subtotal
  subtotalLabel = 'Subtotal',
  showSubtotal = true,
  subtotal = '1000.00',

  // Total
  totalLabel = 'Total',
  showTotal = true,
  total = '$1000.00',

  // Bill Note
  showBillNote = true,
  billNote = '',
  billNoteLabel = 'Bill Note',

  // Terms & Conditions
  termsConditionsLabel = 'Terms & Conditions',
  showTermsConditions = true,
  termsConditions = DefaultPdfTemplateTerms,

  lines = [
    {
      item: DefaultPdfTemplateItemName,
      description: DefaultPdfTemplateItemDescription,
      rate: '1',
      quantity: '1000',
      total: '$1000.00',
    },
  ],
  displayTotals = [],
  ...props
}: BillPaperTemplateProps) {
  return (
    <PaperTemplate
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      {...props}
    >
      <Stack spacing={24}>
        <Group align="start" spacing={10}>
          <Stack flex={1}>
            <PaperTemplate.BigTitle title={'Bill'} />

            <PaperTemplate.TermsList>
              {showBillNumber && (
                <PaperTemplate.TermsItem label={billNumberLabel}>
                  {billNumber}
                </PaperTemplate.TermsItem>
              )}
              {showBillDate && (
                <PaperTemplate.TermsItem label={billDateLabel}>
                  {billDate}
                </PaperTemplate.TermsItem>
              )}
              {showDueDate && (
                <PaperTemplate.TermsItem label={dueDateLabel}>
                  {dueDate}
                </PaperTemplate.TermsItem>
              )}
            </PaperTemplate.TermsList>
          </Stack>

          {companyLogoUri && showCompanyLogo && (
            <PaperTemplate.Logo logoUri={companyLogoUri} />
          )}
        </Group>

        <PaperTemplate.AddressesGroup>
          {showCompanyAddress && (
            <PaperTemplate.Address>
              <Box dangerouslySetInnerHTML={{ __html: companyAddress }} />
            </PaperTemplate.Address>
          )}
          {showVendorAddress && (
            <PaperTemplate.Address>
              <strong>{billedFromLabel}</strong>
              <Box dangerouslySetInnerHTML={{ __html: vendorAddress }} />
            </PaperTemplate.Address>
          )}
        </PaperTemplate.AddressesGroup>

        <Stack spacing={0}>
          <PaperTemplate.Table
            columns={[
              {
                label: lineItemLabel,
                accessor: (data) => (
                  <Stack spacing={2}>
                    <Text>{data.item}</Text>
                    {data.description && (
                      <Text color={'#5f6b7c'} fontSize={12}>
                        {data.description}
                      </Text>
                    )}
                  </Stack>
                ),
                thStyle: { width: '60%' },
              },
              {
                label: lineQuantityLabel,
                accessor: 'quantity',
                align: 'right',
              },
              { label: lineRateLabel, accessor: 'rate', align: 'right' },
              { label: lineTotalLabel, accessor: 'total', align: 'right' },
            ]}
            data={lines}
          />
          <PaperTemplate.Totals>
            {showSubtotal && (
              <PaperTemplate.TotalLine
                label={subtotalLabel}
                amount={subtotal}
                border={PaperTemplateTotalBorder.Gray}
              />
            )}
            {showTotal && (
              <PaperTemplate.TotalLine
                label={totalLabel}
                amount={total}
                border={PaperTemplateTotalBorder.Dark}
                style={{ fontWeight: 500 }}
              />
            )}
            <PaperTemplate.DisplayCurrencyTotals items={displayTotals} />
          </PaperTemplate.Totals>
        </Stack>

        <Stack spacing={0}>
          {showBillNote && billNote && (
            <PaperTemplate.Statement label={billNoteLabel}>
              {billNote}
            </PaperTemplate.Statement>
          )}

          {showTermsConditions && termsConditions && (
            <PaperTemplate.Statement label={termsConditionsLabel}>
              {termsConditions}
            </PaperTemplate.Statement>
          )}
        </Stack>
      </Stack>
    </PaperTemplate>
  );
}
