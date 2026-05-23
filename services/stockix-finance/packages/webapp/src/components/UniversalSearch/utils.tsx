// @ts-nocheck

export const filterItemsByResourceType = (items, type) => {
    return (Array.isArray(items) ? items : []).filter((item) => item._type === type);
}