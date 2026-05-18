import { IModel } from "./Model";

export interface IDynamicFilter {
  setModel(model: IModel): void;
  buildQuery(): void;
  getResponseMeta?();
}

export interface IFilterRole {
  fieldKey: string;
  value: string;
  condition?: string;
  index?: number;
  comparator?: string;
}
export interface IDynamicListFilter {
  customViewId?: number;
  filterRoles?: IFilterRole[];
  columnSortBy: string;
  sortOrder: string;
  stringifiedFilterRoles?: string;
  searchKeyword?: string;
  viewSlug?: string;
}

export interface IDynamicListFilterDTO extends IDynamicListFilter {}

export interface IDynamicListService {
  dynamicList(
    tenantId: number,
    model: any,
    filter: IDynamicListFilter
  ): Promise<any>;
  handlerErrorsToResponse(error, req, res, next): void;
}

// Search role.
export interface ISearchRole {
  fieldKey: string;
  comparator: string;
}