

interface IInventoryCostMethod {
  computeItemCost(): Promise<any>;
  storeInventoryLotsCost(transactions: any[]): void;
}