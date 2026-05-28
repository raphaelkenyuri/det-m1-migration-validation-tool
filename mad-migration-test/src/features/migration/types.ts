export type ComparisonMode = 'option' | 'numeric' | 'multiCode'

export type OldMadRow = Record<string, string | number | boolean | null>

export interface Dhis2ValueRow {
    event: string
    status?: string
    orgUnit?: string
    orgUnitName: string
    country?: string
    region?: string
    goCode?: string
    occurredAt?: string
    period: string
    dataElement: string
    dataElementName?: string
    value: string
}

export interface MappingEntry {
    id: string
    indicator: string
    mode: ComparisonMode
    oldMadColumns: string[]
    oldMadOption?: string
    dhis2DataElement: string
    dhis2Value?: string
}

export interface MappingConfig {
    version: number
    updatedAt?: string
    dhis2: {
        programId: string
        programStageIds: string[]
        programStageId?: string
        startDate: string
        endDate: string
        pageSize: number
        countryDataElementId?: string
        regionDataElementId?: string
        goCodeDataElementId?: string
    }
    mappings: MappingEntry[]
}

export interface ImportSummary {
    fileName: string
    sheetName: string
    rowCount: number
    headers: string[]
    missingRequiredHeaders: string[]
}

export interface ComparisonFilters {
    region: string
    country: string
    period: string
    mappingId: string
}

export interface ComparisonResult {
    label: string
    oldMadValue: number
    dhis2Value: number
    status: 'Match' | 'Mismatch'
    oldMadRows: OldMadRow[]
    dhis2Rows: Dhis2ValueRow[]
}
