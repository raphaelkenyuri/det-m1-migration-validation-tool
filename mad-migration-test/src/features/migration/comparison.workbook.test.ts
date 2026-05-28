import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { compareMigrationData } from './comparison'
import { defaultMappingConfig } from './defaultMapping'
import { parseOldMadWorkbook } from './excelImport'
import { Dhis2ValueRow, OldMadRow } from './types'

const workbookPath = path.resolve(
    __dirname,
    '../../../../Migration Test Tool - DET M1 - V3.1 (2).xlsx'
)

const readSheet = <TRow extends Record<string, unknown>>(
    workbook: XLSX.WorkBook,
    sheetName: string
) =>
    XLSX.utils.sheet_to_json<TRow>(workbook.Sheets[sheetName], {
        defval: null,
    })

const asText = (value: unknown) =>
    value === undefined || value === null ? '' : String(value).trim()

const readWorkbookRows = () => {
    const buffer = fs.readFileSync(workbookPath)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const oldMadRows = readSheet<OldMadRow>(workbook, 'OLD MAD')
    const dhis2Rows = readSheet<Record<string, unknown>>(
        workbook,
        'DHIS2'
    ).map<Dhis2ValueRow>((row) => ({
        event: asText(row.event),
        status: asText(row.status),
        orgUnit: asText(row.orgUnit),
        orgUnitName: asText(row.orgUnitName),
        country: asText(row.COUNTRY),
        region: asText(row.REGION),
        goCode: asText(row['GO CODE']),
        occurredAt: asText(row.occurredAt),
        period: asText(row.DATERANGE),
        dataElement: asText(row['DE UID']),
        dataElementName: asText(row['DATA ELEMENT']),
        value: asText(row.value),
    }))

    return { oldMadRows, dhis2Rows }
}

describe('workbook parity', () => {
    it('imports the OLD MAD workbook sheet', async () => {
        const buffer = fs.readFileSync(workbookPath)
        const file = new File([buffer], path.basename(workbookPath))
        const result = await parseOldMadWorkbook(file)

        expect(result.summary.sheetName).toBe('OLD MAD')
        expect(result.summary.rowCount).toBe(186)
        expect(result.summary.missingRequiredHeaders).toEqual([])
        expect(result.summary.headers).toContain('M1_12_07000')
    })

    it('recalculates Dashboard option-set counts from the current workbook inputs', () => {
        const { oldMadRows, dhis2Rows } = readWorkbookRows()
        const results = compareMigrationData({
            oldMadRows,
            dhis2Rows,
            mapping: defaultMappingConfig.mappings[0],
            filters: {
                region: 'Africa region',
                country: 'Kenya',
                period: '202402',
                mappingId: defaultMappingConfig.mappings[0].id,
            },
        })

        expect(
            results.map(({ oldMadValue, dhis2Value, status }) => ({
                oldMadValue,
                dhis2Value,
                status,
            }))
        ).toEqual([
            { oldMadValue: 0, dhis2Value: 1, status: 'Mismatch' },
            { oldMadValue: 0, dhis2Value: 0, status: 'Match' },
            { oldMadValue: 0, dhis2Value: 2, status: 'Mismatch' },
        ])
    })

    it('matches Dashboard (2) numeric sums', () => {
        const { oldMadRows, dhis2Rows } = readWorkbookRows()
        const results = compareMigrationData({
            oldMadRows,
            dhis2Rows,
            mapping: defaultMappingConfig.mappings[1],
            filters: {
                region: 'Africa region',
                country: 'Kenya',
                period: '202402',
                mappingId: defaultMappingConfig.mappings[1].id,
            },
        })

        expect(
            results.map(({ oldMadValue, dhis2Value, status }) => ({
                oldMadValue,
                dhis2Value,
                status,
            }))
        ).toEqual([
            { oldMadValue: 3905, dhis2Value: 3906, status: 'Mismatch' },
            { oldMadValue: 217, dhis2Value: 217, status: 'Match' },
            { oldMadValue: 15229, dhis2Value: 15238, status: 'Mismatch' },
        ])
    })

    it('matches Dashboard (3) multi-code counts', () => {
        const { oldMadRows, dhis2Rows } = readWorkbookRows()
        const results = compareMigrationData({
            oldMadRows,
            dhis2Rows,
            mapping: defaultMappingConfig.mappings[2],
            filters: {
                region: 'Asia and the Pacific region',
                country: 'Philippines',
                period: '202401',
                mappingId: defaultMappingConfig.mappings[2].id,
            },
        })

        expect(
            results.map(({ oldMadValue, dhis2Value, status }) => ({
                oldMadValue,
                dhis2Value,
                status,
            }))
        ).toEqual([
            { oldMadValue: 6, dhis2Value: 6, status: 'Match' },
            { oldMadValue: 5, dhis2Value: 5, status: 'Match' },
            { oldMadValue: 17, dhis2Value: 17, status: 'Match' },
        ])
    })
})
