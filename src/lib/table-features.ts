import {
    tableFeatures,
    columnFacetingFeature,
    columnFilteringFeature,
    columnVisibilityFeature,
    rowExpandingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    createFilteredRowModel,
    createSortedRowModel,
    createPaginatedRowModel,
    createExpandedRowModel,
    createFacetedRowModel,
    createFacetedUniqueValues,
    filterFns,
    sortFns,
} from '@tanstack/react-table'

export const chargeTableFeatures = tableFeatures({
    columnFacetingFeature,
    columnFilteringFeature,
    columnVisibilityFeature,
    rowExpandingFeature,
    rowPaginationFeature,
    rowSelectionFeature,
    rowSortingFeature,
    filteredRowModel: createFilteredRowModel(),
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    expandedRowModel: createExpandedRowModel(),
    facetedRowModel: createFacetedRowModel(),
    facetedUniqueValues: createFacetedUniqueValues(),
    filterFns,
    sortFns,
})

export type ChargeTableFeatures = typeof chargeTableFeatures
