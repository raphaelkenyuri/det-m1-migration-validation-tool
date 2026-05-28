import i18n from '@dhis2/d2-i18n'
import {
    Button,
    CircularLoader,
    FileInputField,
    InputField,
    MultiSelectField,
    MultiSelectOption,
    NoticeBox,
    SingleSelectField,
    SingleSelectOption,
    Tab,
    TabBar,
    Table,
    TableBody,
    TableCell,
    TableCellHead,
    TableHead,
    TableRow,
    TableRowHead,
} from '@dhis2/ui'
import React, { useMemo, useState } from 'react'
import { compareMigrationData, getOldMadSelectOptions } from './comparison'
import { defaultMappingConfig } from './defaultMapping'
import {
    ProgramOption,
    Dhis2DataElementMetadata,
    getDataElementSelectValue,
    getOptionSelectValue,
    toDhis2DataElementOptions,
    toOrganisationUnitOptions,
    toOptionSetOptions,
    useDhis2DataElements,
    useDhis2OptionSet,
    useDhis2OrganisationUnits,
    useDhis2Events,
    useMappingConfig,
    useProgramStages,
    usePrograms,
    useSaveMappingConfig,
} from './dhis2Api'
import { parseOldMadWorkbook } from './excelImport'
import classes from './MigrationTool.module.css'
import {
    ComparisonFilters,
    ComparisonMode,
    Dhis2ValueRow,
    ImportSummary,
    MappingConfig,
    MappingEntry,
    OldMadRow,
} from './types'

type ActiveTab = 'upload' | 'mapping' | 'compare'

const modeLabels: Record<ComparisonMode, string> = {
    option: 'Option count',
    numeric: 'Numeric sum',
    multiCode: 'Multi-code count',
}

const splitColumns = (value: string) =>
    value
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean)

const getString = (value: unknown) =>
    value === undefined || value === null ? '' : String(value)

const uniqueDhis2 = (rows: Dhis2ValueRow[], key: keyof Dhis2ValueRow) =>
    Array.from(
        new Set(rows.map((row) => getString(row[key])).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))

type UpdateDhis2Config = <TKey extends keyof MappingConfig['dhis2']>(
    key: TKey,
    value: MappingConfig['dhis2'][TKey]
) => void

const cloneConfig = (config: MappingConfig): MappingConfig => {
    const legacyProgramStageId = config.dhis2.programStageId

    return {
        ...config,
        dhis2: {
            ...config.dhis2,
            programStageIds:
                config.dhis2.programStageIds ??
                (legacyProgramStageId ? [legacyProgramStageId] : []),
        },
        mappings: config.mappings.map((mapping) => ({
            ...mapping,
            oldMadColumns: [...mapping.oldMadColumns],
        })),
    }
}

const SummaryMetric = ({
    label,
    value,
}: {
    label: string
    value: string | number
}) => (
    <div className={classes.metric}>
        <p className={classes.metricLabel}>{label}</p>
        <p className={classes.metricValue}>{value}</p>
    </div>
)

const renderSelectOptions = (values: string[]) =>
    values.map((value) => (
        <SingleSelectOption key={value} label={value} value={value} />
    ))

const Dhis2DataElementField = ({
    label,
    value,
    dataElements,
    onChange,
    loading,
}: {
    label: string
    value: string
    dataElements: Dhis2DataElementMetadata[]
    onChange: (value: string) => void
    loading?: boolean
}) => {
    const selected = getDataElementSelectValue(value, dataElements)
    const options = toDhis2DataElementOptions(dataElements)
    const useSelect = loading || options.length > 0

    if (!useSelect) {
        return (
            <InputField
                dense
                label={label}
                value={value}
                onChange={({ value: nextValue }) => onChange(nextValue ?? '')}
            />
        )
    }

    return (
        <SingleSelectField
            dense
            filterable
            label={label}
            loading={loading}
            selected={selected}
            onChange={({ selected: nextValue }) => onChange(nextValue)}
        >
            {options.map((option) => (
                <SingleSelectOption
                    key={option.id}
                    label={option.label}
                    value={option.value}
                />
            ))}
        </SingleSelectField>
    )
}

const Dhis2ValueField = ({
    dataElementValue,
    value,
    onChange,
    dataElements,
}: {
    dataElementValue: string
    value: string
    onChange: (value: string) => void
    dataElements: Dhis2DataElementMetadata[]
}) => {
    const selectedDataElement = dataElements.find(
        (dataElement) =>
            dataElement.id === dataElementValue ||
            dataElement.displayName === dataElementValue ||
            dataElement.name === dataElementValue
    )
    const optionSetQuery = useDhis2OptionSet(selectedDataElement?.optionSet?.id)
    const optionSetOptions = toOptionSetOptions(optionSetQuery.data)
    const selected = getOptionSelectValue(value, optionSetOptions)

    if (optionSetOptions.length > 0) {
        return (
            <SingleSelectField
                dense
                filterable
                label={i18n.t('DHIS2 value')}
                loading={optionSetQuery.isLoading}
                selected={selected}
                onChange={({ selected: nextValue }) => onChange(nextValue)}
            >
                {optionSetOptions.map((option) => (
                    <SingleSelectOption
                        key={option.id}
                        label={option.label}
                        value={option.value}
                    />
                ))}
            </SingleSelectField>
        )
    }

    return (
        <InputField
            dense
            label={i18n.t('DHIS2 value')}
            value={value}
            onChange={({ value: nextValue }) => onChange(nextValue ?? '')}
        />
    )
}

const getErrorMessage = (error: unknown) =>
    error instanceof Error
        ? error.message
        : i18n.t('The DHIS2 API request failed.')

export const MigrationTool = () => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('upload')
    const [oldMadRows, setOldMadRows] = useState<OldMadRow[]>([])
    const [importSummary, setImportSummary] = useState<ImportSummary>()
    const [importError, setImportError] = useState<string>()
    const [localConfig, setLocalConfig] = useState<MappingConfig>(
        cloneConfig(defaultMappingConfig)
    )
    const [shouldFetchDhis2, setShouldFetchDhis2] = useState(false)
    const [filters, setFilters] = useState<ComparisonFilters>({
        region: '',
        country: '',
        period: '',
        mappingId: defaultMappingConfig.mappings[0]?.id ?? '',
    })

    const mappingQuery = useMappingConfig(defaultMappingConfig)
    const programsQuery = usePrograms()
    const dataElementsQuery = useDhis2DataElements()
    const regionUnitsQuery = useDhis2OrganisationUnits(2)
    const countryUnitsQuery = useDhis2OrganisationUnits(3)
    const selectedProgramQuery = useProgramStages(localConfig.dhis2.programId)
    const saveMapping = useSaveMappingConfig()
    const dhis2Query = useDhis2Events({
        config: localConfig.dhis2,
        enabled: shouldFetchDhis2,
    })

    React.useEffect(() => {
        if (mappingQuery.data) {
            setLocalConfig(cloneConfig(mappingQuery.data))
        }
    }, [mappingQuery.data])

    const selectedMapping = useMemo(
        () =>
            localConfig.mappings.find(
                (mapping) => mapping.id === filters.mappingId
            ) ?? localConfig.mappings[0],
        [filters.mappingId, localConfig.mappings]
    )

    const selectedProgram = selectedProgramQuery.data

    const regionOptions = useMemo(
        () =>
            toOrganisationUnitOptions(regionUnitsQuery.data ?? []).map(
                (option) => option.label
            ),
        [regionUnitsQuery.data]
    )

    const countryOptions = useMemo(
        () =>
            toOrganisationUnitOptions(countryUnitsQuery.data ?? []).map(
                (option) => option.label
            ),
        [countryUnitsQuery.data]
    )

    const periodOptions = useMemo(() => {
        const oldMadPeriods = getOldMadSelectOptions(oldMadRows, 'DATERANGE')
        const dhis2Periods = uniqueDhis2(dhis2Query.data ?? [], 'period')
        return Array.from(new Set([...oldMadPeriods, ...dhis2Periods])).sort()
    }, [dhis2Query.data, oldMadRows])

    const comparisonResults = useMemo(() => {
        if (!selectedMapping) {
            return []
        }

        return compareMigrationData({
            oldMadRows,
            dhis2Rows: dhis2Query.data ?? [],
            mapping: selectedMapping,
            filters,
        })
    }, [dhis2Query.data, filters, oldMadRows, selectedMapping])

    const updateDhis2Config: UpdateDhis2Config = (key, value) => {
        setShouldFetchDhis2(false)
        setLocalConfig((current) => ({
            ...current,
            dhis2: {
                ...current.dhis2,
                [key]: key === 'pageSize' ? Number(value) || 1 : value,
                ...(key === 'programId' ? { programStageIds: [] } : {}),
            },
        }))
    }

    const updateMapping = (
        id: string,
        patch: Partial<Omit<MappingEntry, 'id'>>
    ) => {
        setLocalConfig((current) => ({
            ...current,
            mappings: current.mappings.map((mapping) =>
                mapping.id === id ? { ...mapping, ...patch } : mapping
            ),
        }))
    }

    const addMapping = () => {
        const mapping: MappingEntry = {
            id: `mapping-${Date.now()}`,
            indicator: '',
            mode: 'option',
            oldMadColumns: [],
            oldMadOption: '',
            dhis2DataElement: '',
            dhis2Value: '',
        }

        setLocalConfig((current) => ({
            ...current,
            mappings: [...current.mappings, mapping],
        }))
        setFilters((current) => ({ ...current, mappingId: mapping.id }))
    }

    const removeMapping = (id: string) => {
        setLocalConfig((current) => {
            const mappings = current.mappings.filter(
                (mapping) => mapping.id !== id
            )

            return {
                ...current,
                mappings,
            }
        })
    }

    const handleOldMadImport = async (file?: File) => {
        if (!file) {
            return
        }

        setImportError(undefined)

        try {
            const result = await parseOldMadWorkbook(file)
            setOldMadRows(result.rows)
            setImportSummary(result.summary)
            setActiveTab('mapping')
        } catch (error) {
            setImportError(
                error instanceof Error
                    ? error.message
                    : i18n.t('Could not read the Excel file.')
            )
        }
    }

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <div>
                    <h1 className={classes.title}>
                        {i18n.t('MAD Migration Test')}
                    </h1>
                    <p className={classes.subtitle}>
                        {i18n.t(
                            'Load an OLD MAD workbook, maintain DET M1 mappings, fetch DHIS2 event values, and compare migration results.'
                        )}
                    </p>
                </div>
                {mappingQuery.isLoading && <CircularLoader small />}
            </header>

            <main className={classes.content}>
                <div className={classes.tabs}>
                    <TabBar>
                        <Tab
                            selected={activeTab === 'upload'}
                            onClick={() => setActiveTab('upload')}
                        >
                            {i18n.t('Upload')}
                        </Tab>
                        <Tab
                            selected={activeTab === 'mapping'}
                            onClick={() => setActiveTab('mapping')}
                        >
                            {i18n.t('Mappings')}
                        </Tab>
                        <Tab
                            selected={activeTab === 'compare'}
                            onClick={() => setActiveTab('compare')}
                        >
                            {i18n.t('Compare')}
                        </Tab>
                    </TabBar>
                </div>

                {activeTab === 'upload' && (
                    <UploadTab
                        importSummary={importSummary}
                        importError={importError}
                        oldMadRows={oldMadRows}
                        onImport={handleOldMadImport}
                    />
                )}

                {activeTab === 'mapping' && (
                    <MappingTab
                        config={localConfig}
                        dataElements={dataElementsQuery.data ?? []}
                        dataElementsError={dataElementsQuery.error}
                        dataElementsLoading={dataElementsQuery.isLoading}
                        oldMadHeaders={importSummary?.headers ?? []}
                        oldMadLoaded={oldMadRows.length > 0}
                        programs={programsQuery.data ?? []}
                        programsError={programsQuery.error}
                        programsLoading={programsQuery.isLoading}
                        selectedProgram={selectedProgram}
                        selectedProgramError={selectedProgramQuery.error}
                        selectedProgramLoading={
                            selectedProgramQuery.isLoading ||
                            selectedProgramQuery.isFetching
                        }
                        onAddMapping={addMapping}
                        onRemoveMapping={removeMapping}
                        onSave={() => saveMapping.mutate(localConfig)}
                        onUpdateDhis2Config={updateDhis2Config}
                        onUpdateMapping={updateMapping}
                        saving={saveMapping.isLoading}
                    />
                )}

                {activeTab === 'compare' && (
                    <CompareTab
                        comparisonResults={comparisonResults}
                        config={localConfig}
                        countryOptions={countryOptions}
                        dhis2Rows={dhis2Query.data ?? []}
                        error={dhis2Query.error}
                        filters={filters}
                        loading={dhis2Query.isFetching}
                        oldMadLoaded={oldMadRows.length > 0}
                        oldMadRows={oldMadRows}
                        periodOptions={periodOptions}
                        regionOptions={regionOptions}
                        regionLoading={regionUnitsQuery.isLoading}
                        countryLoading={countryUnitsQuery.isLoading}
                        selectedMapping={selectedMapping}
                        onFetchDhis2={() => setShouldFetchDhis2(true)}
                        onFiltersChange={setFilters}
                    />
                )}
            </main>
        </div>
    )
}

const UploadTab = ({
    importSummary,
    importError,
    oldMadRows,
    onImport,
}: {
    importSummary?: ImportSummary
    importError?: string
    oldMadRows: OldMadRow[]
    onImport: (file?: File) => void
}) => (
    <div className={classes.grid}>
        <section className={classes.panel}>
            <h2 className={classes.panelTitle}>{i18n.t('OLD MAD import')}</h2>
            <div className={classes.guidanceList}>
                <p className={`${classes.muted} ${classes.small}`}>
                    {i18n.t('1. Upload OLD MAD workbook')}
                </p>
                <p className={`${classes.muted} ${classes.small}`}>
                    {i18n.t('2. Review import summary and missing headers')}
                </p>
                <p className={`${classes.muted} ${classes.small}`}>
                    {i18n.t('3. Continue to Mappings tab')}
                </p>
            </div>
            <FileInputField
                accept=".xlsx,.xls"
                buttonLabel={i18n.t('Choose Excel file')}
                helpText={i18n.t(
                    'The importer uses the OLD MAD sheet when present, otherwise the first sheet.'
                )}
                label={i18n.t('OLD MAD workbook')}
                onChange={({ files }) => onImport(files?.[0])}
            />
            {importError && (
                <div className={classes.details}>
                    <NoticeBox error title={i18n.t('Import failed')}>
                        {importError}
                    </NoticeBox>
                </div>
            )}
        </section>

        <section className={classes.panel}>
            <h2 className={classes.panelTitle}>{i18n.t('Import summary')}</h2>
            {importSummary ? (
                <>
                    <div className={classes.summaryGrid}>
                        <SummaryMetric
                            label={i18n.t('Rows')}
                            value={importSummary.rowCount}
                        />
                        <SummaryMetric
                            label={i18n.t('Columns')}
                            value={importSummary.headers.length}
                        />
                        <SummaryMetric
                            label={i18n.t('Sheet')}
                            value={importSummary.sheetName}
                        />
                    </div>
                    {importSummary.missingRequiredHeaders.length > 0 && (
                        <div className={classes.details}>
                            <NoticeBox
                                warning
                                title={i18n.t('Missing headers')}
                            >
                                {importSummary.missingRequiredHeaders.join(
                                    ', '
                                )}
                            </NoticeBox>
                        </div>
                    )}
                </>
            ) : (
                <p className={classes.muted}>
                    {i18n.t('No OLD MAD workbook has been imported yet.')}
                </p>
            )}
        </section>

        {oldMadRows.length > 0 && (
            <section className={`${classes.panel} ${classes.panelWide}`}>
                <h2 className={classes.panelTitle}>{i18n.t('Preview')}</h2>
                <PreviewTable rows={oldMadRows.slice(0, 5)} />
            </section>
        )}
    </div>
)

const MappingTab = ({
    config,
    dataElements,
    dataElementsError,
    dataElementsLoading,
    oldMadHeaders,
    oldMadLoaded,
    programs,
    programsError,
    programsLoading,
    selectedProgram,
    selectedProgramError,
    selectedProgramLoading,
    saving,
    onAddMapping,
    onRemoveMapping,
    onSave,
    onUpdateDhis2Config,
    onUpdateMapping,
}: {
    config: MappingConfig
    dataElements: Dhis2DataElementMetadata[]
    dataElementsError: unknown
    dataElementsLoading: boolean
    oldMadHeaders: string[]
    oldMadLoaded: boolean
    programs: ProgramOption[]
    programsError: unknown
    programsLoading: boolean
    selectedProgram?: ProgramOption
    selectedProgramError: unknown
    selectedProgramLoading: boolean
    saving: boolean
    onAddMapping: () => void
    onRemoveMapping: (id: string) => void
    onSave: () => void
    onUpdateDhis2Config: UpdateDhis2Config
    onUpdateMapping: (
        id: string,
        patch: Partial<Omit<MappingEntry, 'id'>>
    ) => void
}) => (
    <div className={classes.grid}>
        <section className={`${classes.panel} ${classes.panelWide}`}>
            <h2 className={classes.panelTitle}>{i18n.t('DHIS2 source')}</h2>
            <div className={classes.noticeStack}>
                {!oldMadLoaded && (
                    <NoticeBox
                        warning
                        title={i18n.t('OLD MAD data is not loaded')}
                    >
                        {i18n.t(
                            'Upload the OLD MAD workbook before comparing. Mappings can still be edited now.'
                        )}
                    </NoticeBox>
                )}
                {(!config.dhis2.programId ||
                    config.dhis2.programStageIds.length === 0) && (
                    <div className={classes.requiredHint}>
                        <NoticeBox title={i18n.t('DHIS2 source required')}>
                            {i18n.t(
                                'Select the DET M1 program and at least one program stage before fetching DHIS2 data.'
                            )}
                        </NoticeBox>
                    </div>
                )}
                {programsError && (
                    <NoticeBox error title={i18n.t('Programs could not load')}>
                        {getErrorMessage(programsError)}
                    </NoticeBox>
                )}
                {dataElementsError && (
                    <NoticeBox
                        warning
                        title={i18n.t('DHIS2 metadata could not load')}
                    >
                        {getErrorMessage(dataElementsError)}
                    </NoticeBox>
                )}
                {selectedProgramError && (
                    <NoticeBox
                        warning
                        title={i18n.t('Program stages could not load')}
                    >
                        {getErrorMessage(selectedProgramError)}
                    </NoticeBox>
                )}
            </div>
            <div className={classes.formGrid}>
                {programsLoading || programs.length > 0 ? (
                    <SingleSelectField
                        dense
                        filterable
                        label={i18n.t('Program')}
                        loading={programsLoading}
                        selected={config.dhis2.programId}
                        onChange={({ selected }) =>
                            onUpdateDhis2Config('programId', selected)
                        }
                    >
                        {programs.map((program) => (
                            <SingleSelectOption
                                key={program.id}
                                label={program.displayName}
                                value={program.id}
                            />
                        ))}
                    </SingleSelectField>
                ) : (
                    <InputField
                        dense
                        label={i18n.t('Program')}
                        helpText={i18n.t(
                            'Enter the program id manually when the DHIS2 programs API is unavailable.'
                        )}
                        value={config.dhis2.programId}
                        onChange={({ value }) =>
                            onUpdateDhis2Config('programId', value ?? '')
                        }
                    />
                )}
                {selectedProgramLoading ||
                (selectedProgram?.programStages ?? []).length > 0 ? (
                    <MultiSelectField
                        dense
                        filterable
                        disabled={!selectedProgram}
                        label={i18n.t('Program stages')}
                        selected={config.dhis2.programStageIds}
                        onChange={({ selected }) =>
                            onUpdateDhis2Config('programStageIds', selected)
                        }
                    >
                        {(selectedProgram?.programStages ?? []).map((stage) => (
                            <MultiSelectOption
                                key={stage.id}
                                label={stage.displayName}
                                value={stage.id}
                            />
                        ))}
                    </MultiSelectField>
                ) : (
                    <InputField
                        dense
                        label={i18n.t('Program stages')}
                        helpText={i18n.t(
                            'Enter comma-separated program stage ids when the DHIS2 programs API is unavailable.'
                        )}
                        value={config.dhis2.programStageIds.join(', ')}
                        onChange={({ value }) =>
                            onUpdateDhis2Config(
                                'programStageIds',
                                splitColumns(value ?? '')
                            )
                        }
                    />
                )}
                <InputField
                    dense
                    label={i18n.t('Start date')}
                    type="date"
                    value={config.dhis2.startDate}
                    onChange={({ value }) =>
                        onUpdateDhis2Config('startDate', value ?? '')
                    }
                />
                <InputField
                    dense
                    label={i18n.t('End date')}
                    type="date"
                    value={config.dhis2.endDate}
                    onChange={({ value }) =>
                        onUpdateDhis2Config('endDate', value ?? '')
                    }
                />
                <InputField
                    dense
                    label={i18n.t('Page size')}
                    type="number"
                    value={String(config.dhis2.pageSize)}
                    onChange={({ value }) =>
                        onUpdateDhis2Config('pageSize', Number(value) || 5000)
                    }
                />
                <Dhis2DataElementField
                    label={i18n.t('GO code data element')}
                    value={config.dhis2.goCodeDataElementId ?? ''}
                    dataElements={dataElements}
                    loading={dataElementsLoading}
                    onChange={(value) =>
                        onUpdateDhis2Config('goCodeDataElementId', value)
                    }
                />
                <Dhis2DataElementField
                    label={i18n.t('Country data element')}
                    value={config.dhis2.countryDataElementId ?? ''}
                    dataElements={dataElements}
                    loading={dataElementsLoading}
                    onChange={(value) =>
                        onUpdateDhis2Config('countryDataElementId', value)
                    }
                />
                <Dhis2DataElementField
                    label={i18n.t('Region data element')}
                    value={config.dhis2.regionDataElementId ?? ''}
                    dataElements={dataElements}
                    loading={dataElementsLoading}
                    onChange={(value) =>
                        onUpdateDhis2Config('regionDataElementId', value)
                    }
                />
            </div>
        </section>

        <section className={`${classes.panel} ${classes.panelWide}`}>
            <div className={classes.sectionHeader}>
                <div>
                    <h2 className={classes.panelTitle}>
                        {i18n.t('DET M1 mappings')}
                    </h2>
                    {oldMadHeaders.length > 0 && (
                        <p className={`${classes.muted} ${classes.small}`}>
                            {i18n.t(
                                '{{count}} OLD MAD columns available from upload.',
                                {
                                    count: oldMadHeaders.length,
                                }
                            )}
                        </p>
                    )}
                </div>
                <Button secondary small onClick={onAddMapping}>
                    {i18n.t('Add mapping')}
                </Button>
            </div>
            <div className={classes.mappingGrid}>
                {config.mappings.map((mapping, index) => (
                    <div className={classes.mappingCard} key={mapping.id}>
                        <div className={classes.mappingHeader}>
                            <div>
                                <p className={classes.mappingIndex}>
                                    {i18n.t('Mapping {{number}}', {
                                        number: index + 1,
                                    })}
                                </p>
                                <p className={classes.mappingTitle}>
                                    {mapping.indicator || i18n.t('Untitled')}
                                </p>
                            </div>
                            <Button
                                destructive
                                small
                                onClick={() => onRemoveMapping(mapping.id)}
                            >
                                {i18n.t('Remove')}
                            </Button>
                        </div>
                        <div className={classes.mappingFields}>
                            <div className={classes.fieldWide}>
                                <InputField
                                    dense
                                    label={i18n.t('Indicator')}
                                    value={mapping.indicator}
                                    onChange={({ value }) =>
                                        onUpdateMapping(mapping.id, {
                                            indicator: value ?? '',
                                        })
                                    }
                                />
                            </div>
                            <SingleSelectField
                                dense
                                label={i18n.t('Mode')}
                                selected={mapping.mode}
                                onChange={({ selected }) =>
                                    onUpdateMapping(mapping.id, {
                                        mode: selected as ComparisonMode,
                                    })
                                }
                            >
                                {Object.entries(modeLabels).map(
                                    ([value, label]) => (
                                        <SingleSelectOption
                                            key={value}
                                            label={label}
                                            value={value}
                                        />
                                    )
                                )}
                            </SingleSelectField>
                            <div className={classes.fieldWide}>
                                <InputField
                                    dense
                                    label={i18n.t('OLD MAD columns')}
                                    helpText={i18n.t(
                                        'Use comma-separated OLD MAD column codes for multi-column mappings.'
                                    )}
                                    value={mapping.oldMadColumns.join(', ')}
                                    onChange={({ value }) =>
                                        onUpdateMapping(mapping.id, {
                                            oldMadColumns: splitColumns(
                                                value ?? ''
                                            ),
                                        })
                                    }
                                />
                            </div>
                            <InputField
                                dense
                                label={i18n.t('MAD option')}
                                value={mapping.oldMadOption ?? ''}
                                onChange={({ value }) =>
                                    onUpdateMapping(mapping.id, {
                                        oldMadOption: value ?? '',
                                    })
                                }
                            />
                            <div className={classes.fieldWide}>
                                <Dhis2DataElementField
                                    label={i18n.t('DHIS2 data element')}
                                    value={mapping.dhis2DataElement}
                                    dataElements={dataElements}
                                    loading={dataElementsLoading}
                                    onChange={(value) =>
                                        onUpdateMapping(mapping.id, {
                                            dhis2DataElement: value,
                                        })
                                    }
                                />
                            </div>
                            <div className={classes.fieldWide}>
                                <Dhis2ValueField
                                    dataElementValue={
                                        mapping.dhis2DataElement
                                    }
                                    value={mapping.dhis2Value ?? ''}
                                    dataElements={dataElements}
                                    onChange={(nextValue) =>
                                        onUpdateMapping(mapping.id, {
                                            dhis2Value: nextValue,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className={classes.actions}>
                <Button primary loading={saving} onClick={onSave}>
                    {i18n.t('Save mapping')}
                </Button>
            </div>
        </section>
    </div>
)

const CompareTab = ({
    comparisonResults,
    config,
    countryOptions,
    dhis2Rows,
    error,
    filters,
    loading,
    oldMadLoaded,
    oldMadRows,
    periodOptions,
    regionOptions,
    regionLoading,
    countryLoading,
    selectedMapping,
    onFetchDhis2,
    onFiltersChange,
}: {
    comparisonResults: ReturnType<typeof compareMigrationData>
    config: MappingConfig
    countryOptions: string[]
    dhis2Rows: Dhis2ValueRow[]
    error: unknown
    filters: ComparisonFilters
    loading: boolean
    oldMadLoaded: boolean
    oldMadRows: OldMadRow[]
    periodOptions: string[]
    regionOptions: string[]
    regionLoading: boolean
    countryLoading: boolean
    selectedMapping?: MappingEntry
    onFetchDhis2: () => void
    onFiltersChange: React.Dispatch<React.SetStateAction<ComparisonFilters>>
}) => (
    <div className={classes.grid}>
        <section className={classes.panel}>
            <h2 className={classes.panelTitle}>{i18n.t('Data')}</h2>
            <div className={classes.noticeStack}>
                {!oldMadLoaded && (
                    <NoticeBox
                        warning
                        title={i18n.t('OLD MAD data is not loaded')}
                    >
                        {i18n.t(
                            'Upload the OLD MAD workbook before interpreting comparison results.'
                        )}
                    </NoticeBox>
                )}
                {(!config.dhis2.programId ||
                    config.dhis2.programStageIds.length === 0) && (
                    <div className={classes.requiredHint}>
                        <NoticeBox title={i18n.t('DHIS2 source required')}>
                            {i18n.t(
                                'Set the program and at least one program stage on the Mappings tab.'
                            )}
                        </NoticeBox>
                    </div>
                )}
            </div>
            <div className={classes.summaryGrid}>
                <SummaryMetric
                    label={i18n.t('OLD MAD rows')}
                    value={oldMadRows.length}
                />
                <SummaryMetric
                    label={i18n.t('DHIS2 values')}
                    value={dhis2Rows.length}
                />
            </div>
            <div className={classes.actions}>
                <Button
                    primary
                    disabled={
                        !config.dhis2.programId ||
                        config.dhis2.programStageIds.length === 0
                    }
                    loading={loading}
                    onClick={onFetchDhis2}
                >
                    {i18n.t('Fetch DHIS2 data')}
                </Button>
            </div>
            {loading && (
                <div className={classes.statusLine}>
                    <CircularLoader extrasmall />
                    <span>{i18n.t('Fetching DHIS2 event values...')}</span>
                </div>
            )}
            {error && (
                <div className={classes.details}>
                    <NoticeBox error title={i18n.t('DHIS2 fetch failed')}>
                        {getErrorMessage(error)}
                    </NoticeBox>
                </div>
            )}
        </section>

        <section className={`${classes.panel} ${classes.panelWide}`}>
            <h2 className={classes.panelTitle}>{i18n.t('Compare')}</h2>
            <div className={classes.formGrid}>
                <SingleSelectField
                    dense
                    filterable
                    label={i18n.t('Region')}
                    loading={regionLoading}
                    selected={filters.region}
                    onChange={({ selected }) =>
                        onFiltersChange((current) => ({
                            ...current,
                            region: selected,
                        }))
                    }
                >
                    {renderSelectOptions(regionOptions)}
                </SingleSelectField>
                <SingleSelectField
                    dense
                    filterable
                    label={i18n.t('Country')}
                    loading={countryLoading}
                    selected={filters.country}
                    onChange={({ selected }) =>
                        onFiltersChange((current) => ({
                            ...current,
                            country: selected,
                        }))
                    }
                >
                    {renderSelectOptions(countryOptions)}
                </SingleSelectField>
                <SingleSelectField
                    dense
                    filterable
                    label={i18n.t('Period')}
                    selected={filters.period}
                    onChange={({ selected }) =>
                        onFiltersChange((current) => ({
                            ...current,
                            period: selected,
                        }))
                    }
                >
                    {renderSelectOptions(periodOptions)}
                </SingleSelectField>
                <SingleSelectField
                    dense
                    filterable
                    label={i18n.t('Indicator mapping')}
                    selected={filters.mappingId}
                    onChange={({ selected }) =>
                        onFiltersChange((current) => ({
                            ...current,
                            mappingId: selected,
                        }))
                    }
                >
                    {config.mappings.map((mapping) => (
                        <SingleSelectOption
                            key={mapping.id}
                            label={mapping.indicator || mapping.id}
                            value={mapping.id}
                        />
                    ))}
                </SingleSelectField>
            </div>

            {selectedMapping && (
                <p className={`${classes.muted} ${classes.small}`}>
                    {i18n.t('Mode')}: {modeLabels[selectedMapping.mode]}
                </p>
            )}

            <div
                className={`${classes.tableWrap} ${classes.compareTable} ${classes.details}`}
            >
                <Table>
                    <TableHead>
                        <TableRowHead>
                            <TableCellHead>{i18n.t('Scope')}</TableCellHead>
                            <TableCellHead>{i18n.t('OLD MAD')}</TableCellHead>
                            <TableCellHead>{i18n.t('DHIS2')}</TableCellHead>
                            <TableCellHead>{i18n.t('Status')}</TableCellHead>
                        </TableRowHead>
                    </TableHead>
                    <TableBody>
                        {comparisonResults.map((result) => (
                            <TableRow
                                key={result.label}
                                className={
                                    result.status === 'Match'
                                        ? classes.rowMatch
                                        : classes.rowMismatch
                                }
                            >
                                <TableCell>{result.label}</TableCell>
                                <TableCell>{result.oldMadValue}</TableCell>
                                <TableCell>{result.dhis2Value}</TableCell>
                                <TableCell>
                                    <span
                                        className={
                                            result.status === 'Match'
                                                ? classes.statusMatch
                                                : classes.statusMismatch
                                        }
                                    >
                                        {result.status}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {comparisonResults.length === 0 && (
                <div className={classes.details}>
                    <NoticeBox title={i18n.t('No comparison available')}>
                        {i18n.t(
                            'Load OLD MAD data, fetch DHIS2 data, and select a mapping to compare.'
                        )}
                    </NoticeBox>
                </div>
            )}

            {comparisonResults[0] && (
                <div className={classes.details}>
                    <h3 className={classes.panelTitle}>
                        {i18n.t('Selected scope details')}
                    </h3>
                    <div className={classes.detailsGrid}>
                        <div>
                            <h4 className={classes.mappingTitle}>
                                {i18n.t('OLD MAD rows')}
                            </h4>
                            <PreviewTable
                                rows={comparisonResults[0].oldMadRows}
                                scrollable
                            />
                        </div>
                        <div>
                            <h4 className={classes.mappingTitle}>
                                {i18n.t('DHIS2 rows')}
                            </h4>
                            <PreviewTable
                                rows={comparisonResults[0].dhis2Rows}
                                scrollable
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    </div>
)

const PreviewTable = ({
    rows,
    scrollable = false,
}: {
    rows: object[]
    scrollable?: boolean
}) => {
    if (rows.length === 0) {
        return (
            <p className={classes.emptyState}>{i18n.t('No rows to display.')}</p>
        )
    }

    const headers = Object.keys(rows[0]).slice(0, 8)

    return (
        <div
            className={`${classes.tableWrap} ${
                scrollable ? classes.scrollTableWrap : ''
            }`}
        >
            <Table>
                <TableHead>
                    <TableRowHead>
                        {headers.map((header) => (
                            <TableCellHead key={header}>{header}</TableCellHead>
                        ))}
                    </TableRowHead>
                </TableHead>
                <TableBody>
                    {rows.map((row, index) => (
                        <TableRow key={index}>
                            {headers.map((header) => (
                                <TableCell key={header}>
                                    {getString(
                                        (row as Record<string, unknown>)[header]
                                    ).slice(0, 80)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
