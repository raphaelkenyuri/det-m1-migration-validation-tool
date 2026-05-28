import {
    ComparisonFilters,
    ComparisonResult,
    Dhis2ValueRow,
    MappingEntry,
    OldMadRow,
} from './types'

const asText = (value: unknown): string => {
    if (value === undefined || value === null) {
        return ''
    }

    return String(value).trim()
}

const asNumber = (value: unknown): number => {
    const parsed = Number(asText(value).replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
}

const normalize = (value: unknown): string => asText(value).toLocaleLowerCase()

const hasScope = (
    row: { region?: string; country?: string; period?: string },
    filters: Pick<ComparisonFilters, 'region' | 'country' | 'period'>
): boolean =>
    (!filters.region || row.region === filters.region) &&
    (!filters.country || row.country === filters.country) &&
    (!filters.period || row.period === filters.period)

const oldMadScope = (
    row: OldMadRow,
    filters: Pick<ComparisonFilters, 'region' | 'country' | 'period'>
): boolean =>
    hasScope(
        {
            region: asText(row.REPORTPLACECOUNTRYREGION),
            country: asText(row.REPORTPLACECOUNTRYNAME),
            period: asText(row.DATERANGE),
        },
        filters
    )

const matchesDataElement = (
    row: Dhis2ValueRow,
    mapping: MappingEntry
): boolean => {
    const target = normalize(mapping.dhis2DataElement)

    return (
        normalize(row.dataElement) === target ||
        normalize(row.dataElementName) === target
    )
}

const matchesDhis2Value = (
    row: Dhis2ValueRow,
    expectedValue?: string
): boolean => {
    if (!expectedValue) {
        return true
    }

    return normalize(row.value) === normalize(expectedValue)
}

const getOldMadRows = (
    rows: OldMadRow[],
    filters: Pick<ComparisonFilters, 'region' | 'country' | 'period'>
) => rows.filter((row) => oldMadScope(row, filters))

const getDhis2Rows = (
    rows: Dhis2ValueRow[],
    mapping: MappingEntry,
    filters: Pick<ComparisonFilters, 'region' | 'country' | 'period'>
) =>
    rows.filter(
        (row) =>
            hasScope(row, filters) &&
            matchesDataElement(row, mapping) &&
            matchesDhis2Value(row, mapping.dhis2Value)
    )

const countOldMadOptionRows = (
    rows: OldMadRow[],
    mapping: MappingEntry
): OldMadRow[] =>
    rows.filter((row) =>
        mapping.oldMadColumns.some(
            (column) =>
                normalize(row[column]) === normalize(mapping.oldMadOption)
        )
    )

const sumOldMadRows = (rows: OldMadRow[], mapping: MappingEntry): number =>
    rows.reduce(
        (total, row) =>
            total +
            mapping.oldMadColumns.reduce(
                (rowTotal, column) => rowTotal + asNumber(row[column]),
                0
            ),
        0
    )

const sumDhis2Rows = (rows: Dhis2ValueRow[]): number =>
    rows.reduce((total, row) => total + asNumber(row.value), 0)

const buildResult = ({
    label,
    oldMadValue,
    dhis2Value,
    oldMadRows,
    dhis2Rows,
}: ComparisonResult): ComparisonResult => ({
    label,
    oldMadValue,
    dhis2Value,
    status: oldMadValue === dhis2Value ? 'Match' : 'Mismatch',
    oldMadRows,
    dhis2Rows,
})

export const compareMigrationData = ({
    oldMadRows,
    dhis2Rows,
    mapping,
    filters,
}: {
    oldMadRows: OldMadRow[]
    dhis2Rows: Dhis2ValueRow[]
    mapping: MappingEntry
    filters: ComparisonFilters
}): ComparisonResult[] => {
    const scopes = [
        {
            label: 'Selected region and period',
            filters: {
                region: filters.region,
                country: '',
                period: filters.period,
            },
        },
        {
            label: 'Selected country and period',
            filters: {
                region: '',
                country: filters.country,
                period: filters.period,
            },
        },
        {
            label:
                mapping.mode === 'multiCode'
                    ? 'All countries and selected period'
                    : 'All countries and all periods',
            filters: {
                region: '',
                country: '',
                period: mapping.mode === 'multiCode' ? filters.period : '',
            },
        },
    ]

    return scopes.map((scope) => {
        const scopedOldMadRows = getOldMadRows(oldMadRows, scope.filters)
        const scopedDhis2Rows = getDhis2Rows(dhis2Rows, mapping, scope.filters)

        if (mapping.mode === 'numeric') {
            return buildResult({
                label: scope.label,
                oldMadValue: sumOldMadRows(scopedOldMadRows, mapping),
                dhis2Value: sumDhis2Rows(scopedDhis2Rows),
                status: 'Mismatch',
                oldMadRows: scopedOldMadRows,
                dhis2Rows: scopedDhis2Rows,
            })
        }

        const matchingOldMadRows = countOldMadOptionRows(
            scopedOldMadRows,
            mapping
        )

        return buildResult({
            label: scope.label,
            oldMadValue: matchingOldMadRows.length,
            dhis2Value: scopedDhis2Rows.length,
            status: 'Mismatch',
            oldMadRows: matchingOldMadRows,
            dhis2Rows: scopedDhis2Rows,
        })
    })
}

export const getOldMadSelectOptions = (rows: OldMadRow[], column: string) =>
    Array.from(
        new Set(rows.map((row) => asText(row[column])).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))

export const getPeriodFromDate = (value?: string): string => {
    const text = asText(value)

    if (/^\d{6}$/.test(text)) {
        return text
    }

    const date = new Date(text)

    if (Number.isNaN(date.getTime())) {
        return text
    }

    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
}
