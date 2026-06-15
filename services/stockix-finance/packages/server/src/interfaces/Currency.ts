

export interface ICurrencyDTO {
  currencyName: string,
  currencyCode: string,
  currencySign: string,
};
export interface ICurrencyEditDTO {
  currencyName: string,
  currencySign: string,
}
export interface ICurrency {
  id: number,
  currencyName: string,
  currencyCode: string,
  currencySign: string,
  createdAt: Date,
  updatedAt: Date,
  isBaseCurrency: boolean,
  latestExchangeRate: number | null,
  latestExchangeRateDate: string | null,
  latestExchangeRateId: number | null,
};

export interface ICurrenciesService {
  newCurrency(tenantId: number, currencyDTO: ICurrencyDTO): Promise<void>;
  editCurrency(tenantId: number, currencyId: number, editCurrencyDTO: ICurrencyEditDTO): Promise<ICurrency>;

  deleteCurrency(tenantId: number, currencyCode: string): Promise<void>;
  listCurrencies(tenantId: number): Promise<ICurrency[]>;
}