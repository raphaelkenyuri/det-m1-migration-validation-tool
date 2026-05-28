import * as XLSX from 'xlsx'
import { requiredOldMadHeaders } from './defaultMapping'
import { ImportSummary, OldMadRow } from './types'

const normalizeCell = (value: unknown): string | number | boolean | null => {
    if (value === undefined || value === null) {
        return null
    }

    if (typeof value === 'string') {
        return value.trim()
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    return String(value).trim()
}

export const parseOldMadWorkbook = async (
    file: File
): Promise<{ rows: OldMadRow[]; summary: ImportSummary }> => {
    const buffer =
        typeof file.arrayBuffer === 'function'
            ? await file.arrayBuffer()
            : await new Promise<ArrayBuffer>((resolve, reject) => {
                  const reader = new FileReader()
                  reader.onload = () => resolve(reader.result as ArrayBuffer)
                  reader.onerror = () =>
                      reject(new Error('The workbook file could not be read.'))
                  reader.readAsArrayBuffer(file)
              })
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName =
        workbook.SheetNames.find((name) =>
            name.toLocaleLowerCase().replace(/\s+/g, '').includes('oldmad')
        ) ?? workbook.SheetNames[0]

    if (!sheetName) {
        throw new Error('The workbook does not contain any sheets.')
    }

    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
    })

    const normalizedRows = rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
                key.trim(),
                normalizeCell(value),
            ])
        )
    )

    const headers = Array.from(
        new Set(normalizedRows.flatMap((row) => Object.keys(row)))
    )
    const missingRequiredHeaders = requiredOldMadHeaders.filter(
        (header) => !headers.includes(header)
    )

    return {
        rows: normalizedRows,
        summary: {
            fileName: file.name,
            sheetName,
            rowCount: normalizedRows.length,
            headers,
            missingRequiredHeaders,
        },
    }
}
