import { IModel, ISearchRole, ISortOrder } from "./Model";

export type { ISearchRole };

export interface IDynamicFilter {
  setModel(model: IModel): void;
  onInitialize?(): void;
  buildQuery?(): (builder: any) => void;
  getResponseMeta?(): { [key: string]: any };
  filterRoles?: IFilterRole | IFilterRole[];
  responseMeta?: { [key: string]: any };
  relationFields?: string[];
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
  sortOrder: ISortOrder | string;
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
