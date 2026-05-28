import { useAlert, useDataEngine } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPeriodFromDate } from './comparison'
import { Dhis2ValueRow, MappingConfig } from './types'

const DATASTORE_NAMESPACE = 'mad-migration-test'
const MAPPING_KEY = 'det-m1-mapping'

interface Dhis2DataValue {
    dataElement: string
    value?: string | number | boolean | null
}

interface Dhis2Event {
    event: string
    status?: string
    program?: string
    programStage?: string
    orgUnit?: string
    occurredAt?: string
    eventDate?: string
    dataValues?: Dhis2DataValue[]
}

interface EventsResponse {
    events?: Dhis2Event[]
    instances?: Dhis2Event[]
    pager?: {
        page?: number
        pageSize?: number
        pageCount?: number
        total?: number
        nextPage?: string
    }
}

interface DataElementsResponse {
    dataElements?: Array<{
        id: string
        displayName?: string
        name?: string
        optionSet?: {
            id: string
            displayName?: string
            name?: string
        }
    }>
}

export interface Dhis2OptionSetOption {
    id: string
    displayName?: string
    name?: string
    code?: string
}

export interface Dhis2OptionSetMetadata {
    id: string
    displayName?: string
    name?: string
    options?: Dhis2OptionSetOption[]
}

interface OptionSetsResponse {
    optionSet?: Dhis2OptionSetMetadata
}

interface OrganisationUnitsResponse {
    organisationUnits?: Array<{
        id: string
        displayName?: string
        name?: string
    }>
}

interface OrganisationUnitHierarchyResponse {
    organisationUnits?: Array<{
        id: string
        displayName?: string
        name?: string
        ancestors?: Array<{
            id: string
            displayName?: string
            name?: string
        }>
    }>
}

export interface ProgramOption {
    id: string
    displayName: string
    programStages: Array<{
        id: string
        displayName: string
    }>
}

export interface Dhis2DataElementOption {
    id: string
    label: string
    value: string
}

export interface Dhis2DataElementMetadata {
    id: string
    displayName?: string
    name?: string
    optionSet?: {
        id: string
        displayName?: string
        name?: string
    }
}

export interface Dhis2OrganisationUnitMetadata {
    id: string
    displayName?: string
    name?: string
}

type DataEngineLike = {
    mutate: (...args: unknown[]) => Promise<unknown>
}

const metadataLabel = ({
    displayName,
    name,
    id,
}: {
    id: string
    displayName?: string
    name?: string
}) => displayName ?? name ?? id

const resolveMetadataId = (
    value: string,
    rows: Array<Pick<Dhis2DataElementMetadata, 'id' | 'displayName' | 'name'>>
) =>
    rows.find(
        (row) =>
            row.id === value || row.displayName === value || row.name === value
    )?.id ?? value

const unique = (values: Array<string | undefined>) =>
    Array.from(new Set(values.filter(Boolean))) as string[]

const valueByDataElement = (
    event: Dhis2Event,
    dataElementId?: string
): string | undefined => {
    if (!dataElementId) {
        return undefined
    }

    const value = event.dataValues?.find(
        (dataValue) => dataValue.dataElement === dataElementId
    )?.value

    return value === undefined || value === null ? undefined : String(value)
}

const getDataElementNamesById = async (
    engine: ReturnType<typeof useDataEngine>,
    ids: string[]
) => {
    if (ids.length === 0) {
        return new Map<string, string>()
    }

    const result = await engine.query({
        metadata: {
            resource: 'dataElements',
            params: {
                filter: `id:in:[${ids.join(',')}]`,
                fields: 'id,displayName,name',
                paging: false,
            },
        },
    })

    const rows = (result.metadata as DataElementsResponse).dataElements ?? []

    return new Map(
        rows.map((row) => [row.id, row.displayName ?? row.name ?? row.id])
    )
}

const getOrganisationUnitsByIds = async (ids: string[]) => {
    if (ids.length === 0) {
        return new Map<
            string,
            {
                displayName: string
                ancestorIds: string[]
                ancestorNames: string[]
            }
        >()
    }

    const result = await fetchDhis2Json<OrganisationUnitHierarchyResponse>(
        `organisationUnits?filter=id:in:[${ids.join(',')}]&fields=id,displayName,name,ancestors[id,displayName,name]&paging=false`
    )

    const rows = result.organisationUnits ?? []

    return new Map(
        rows.map((row) => [
            row.id,
            {
                displayName: row.displayName ?? row.name ?? row.id,
                ancestorIds: (row.ancestors ?? []).map((ancestor) => ancestor.id),
                ancestorNames: (row.ancestors ?? []).map(
                    (ancestor) =>
                        ancestor.displayName ?? ancestor.name ?? ancestor.id
                ),
            },
        ])
    )
}

export const resolveOrganisationUnitLevelLabel = (
    orgUnitId: string | undefined,
    orgUnitsById: Map<
        string,
        {
            ancestorIds: string[]
        }
    >,
    levelMap: Map<string, string>
) => {
    if (!orgUnitId) {
        return undefined
    }

    const orgUnit = orgUnitsById.get(orgUnitId)
    const candidateIds = [orgUnitId, ...(orgUnit?.ancestorIds ?? [])]
    const matchedId = candidateIds.find((id) => levelMap.has(id))

    return matchedId ? levelMap.get(matchedId) : undefined
}

const apiPath = (path: string) =>
    path.startsWith('/api/') ? path : `/api/${path.replace(/^\/+/, '')}`

const fetchDhis2Json = async <T,>(path: string): Promise<T> => {
    const response = await fetch(apiPath(path), {
        credentials: 'include',
        headers: {
            Accept: 'application/json',
        },
    })

    if (!response.ok) {
        const details = await response.text().catch(() => '')
        throw new Error(
            details
                ? `DHIS2 request failed (${response.status}): ${details}`
                : `DHIS2 request failed (${response.status})`
        )
    }

    return (await response.json()) as T
}

export const useMappingConfig = (fallback: MappingConfig) => {
    const engine = useDataEngine()

    return useQuery({
        queryKey: ['mapping-config'],
        queryFn: async () => {
            try {
                const result = await engine.query({
                    mapping: {
                        resource: `dataStore/${DATASTORE_NAMESPACE}/${MAPPING_KEY}`,
                    },
                })

                return (result.mapping ?? fallback) as MappingConfig
            } catch {
                return fallback
            }
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })
}

export const useDhis2DataElements = () => {
    return useQuery<Dhis2DataElementMetadata[]>({
        queryKey: ['dhis2-data-elements'],
        queryFn: async () => {
            const result = await fetchDhis2Json<DataElementsResponse>(
                'dataElements?fields=id,displayName,name,optionSet[id,displayName,name]&paging=false&order=displayName:asc'
            )
            const dataElements = result.dataElements ?? []

            return dataElements
                .map<Dhis2DataElementMetadata>((dataElement) => ({
                    id: dataElement.id,
                    displayName: dataElement.displayName,
                    name: dataElement.name,
                    optionSet: dataElement.optionSet,
                }))
                .sort((a, b) =>
                    metadataLabel(a).localeCompare(metadataLabel(b))
                )
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })
}

export const useDhis2OptionSet = (optionSetId?: string) => {
    return useQuery<Dhis2OptionSetMetadata | undefined>({
        queryKey: ['dhis2-option-set', optionSetId],
        enabled: Boolean(optionSetId),
        queryFn: async () => {
            if (!optionSetId) {
                return undefined
            }

            const result = await fetchDhis2Json<OptionSetsResponse>(
                `optionSets/${encodeURIComponent(
                    optionSetId
                )}?fields=id,displayName,name,options[id,displayName,name,code]`
            )

            return result.optionSet ?? undefined
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })
}

export const getDataElementSelectValue = (
    value: string,
    dataElements: Dhis2DataElementMetadata[]
) => resolveMetadataId(value, dataElements)

export const getOptionSelectValue = (
    value: string,
    options: Dhis2DataElementOption[]
) =>
    options.find(
        (option) =>
            option.value === value ||
            option.label === value ||
            option.id === value
    )?.value ?? value

export const toDhis2DataElementOptions = (
    dataElements: Dhis2DataElementMetadata[]
) =>
    dataElements.map<Dhis2DataElementOption>((dataElement) => ({
        id: dataElement.id,
        value: dataElement.id,
        label: metadataLabel(dataElement),
    }))

export const toOptionSetOptions = (
    optionSet?: Dhis2OptionSetMetadata | null
) =>
    (optionSet?.options ?? []).map<Dhis2DataElementOption>((option) => ({
        id: option.id,
        value: option.code ?? option.id,
        label: metadataLabel(option),
    }))

export const toOrganisationUnitOptions = (
    organisationUnits: Dhis2OrganisationUnitMetadata[]
) =>
    organisationUnits.map<Dhis2DataElementOption>((orgUnit) => ({
        id: orgUnit.id,
        value: orgUnit.id,
        label: metadataLabel(orgUnit),
    }))

export const useDhis2OrganisationUnits = (level: number) => {
    return useQuery<Dhis2OrganisationUnitMetadata[]>({
        queryKey: ['dhis2-organisation-units', level],
        queryFn: async () => {
            const result = await fetchDhis2Json<OrganisationUnitsResponse>(
                `organisationUnits?level=${level}&fields=id,displayName,name&paging=false&order=displayName:asc`
            )

            return (result.organisationUnits ?? [])
                .map<Dhis2OrganisationUnitMetadata>((orgUnit) => ({
                    id: orgUnit.id,
                    displayName: orgUnit.displayName,
                    name: orgUnit.name,
                }))
                .sort((a, b) => metadataLabel(a).localeCompare(metadataLabel(b)))
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })
}

export const usePrograms = () => {
    const { data, isLoading, isFetching, error } = useQuery<ProgramOption[]>({
        queryKey: ['programs'],
        queryFn: async () => {
            const result = await fetchDhis2Json<{
                programs?: Array<{
                    id: string
                    displayName?: string
                    name?: string
                }>
            }>(
                'programs?fields=id,displayName&paging=false&order=displayName:asc'
            )

            return (result.programs ?? [])
                .map<ProgramOption>((program) => ({
                    id: program.id,
                    displayName:
                        program.displayName ?? program.name ?? program.id,
                    programStages: [],
                }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })

    return {
        data: data ?? [],
        error,
        isLoading,
        isFetching,
    }
}

export const useProgramStages = (programId: string) => {
    return useQuery<ProgramOption | undefined>({
        queryKey: ['program-stages', programId],
        enabled: Boolean(programId),
        queryFn: async () => {
            if (!programId) {
                return undefined
            }

            const result = await fetchDhis2Json<{
                id: string
                displayName?: string
                name?: string
                programStages?: Array<{
                    id: string
                    displayName?: string
                    name?: string
                }>
            }>(
                `programs/${encodeURIComponent(
                    programId
                )}?fields=id,displayName,programStages[id,displayName]`
            )

            return {
                id: result.id,
                displayName: result.displayName ?? result.name ?? result.id,
                programStages:
                    result.programStages?.map((stage) => ({
                        id: stage.id,
                        displayName:
                            stage.displayName ?? stage.name ?? stage.id,
                    })) ?? [],
            }
        },
        staleTime: Infinity,
        cacheTime: Infinity,
    })
}

export const saveMappingConfig = async (
    engine: DataEngineLike,
    config: MappingConfig
) => {
    const payload = {
        ...config,
        updatedAt: new Date().toISOString(),
    }
    const mutation = {
        resource: `dataStore/${DATASTORE_NAMESPACE}/${MAPPING_KEY}`,
        data: payload,
    }

    try {
        await engine.mutate({
            ...mutation,
            type: 'update',
        })
    } catch (updateError) {
        try {
            await engine.mutate({
                ...mutation,
                type: 'create',
            })
        } catch (createError) {
            const updateMessage =
                updateError instanceof Error
                    ? updateError.message
                    : String(updateError)
            const createMessage =
                createError instanceof Error
                    ? createError.message
                    : String(createError)
            throw new Error(
                `Failed to save mapping to ${mutation.resource}. Update failed: ${updateMessage}. Create failed: ${createMessage}`
            )
        }
    }

    return payload
}

export const useSaveMappingConfig = () => {
    const engine = useDataEngine()
    const queryClient = useQueryClient()
    const { show: showSuccess } = useAlert(i18n.t('Mapping saved'), {
        success: true,
    })
    const { show: showError } = useAlert(
        ({ message }) =>
            message
                ? `${i18n.t('Could not save mapping')}: ${message}`
                : i18n.t('Could not save mapping'),
        {
            critical: true,
        }
    )

    return useMutation({
        mutationFn: async (config: MappingConfig) => {
            return saveMappingConfig(engine, config)
        },
        onSuccess: (config) => {
            queryClient.setQueryData(['mapping-config'], config)
            showSuccess()
        },
        onError: (error: Error) => {
            showError({ message: error.message })
        },
    })
}

export const useDhis2Events = ({
    config,
    enabled,
}: {
    config: MappingConfig['dhis2']
    enabled: boolean
}) => {
    const engine = useDataEngine()

    return useQuery({
        queryKey: ['dhis2-events', config],
        enabled:
            enabled &&
            Boolean(config.programId) &&
            config.programStageIds.length > 0 &&
            Boolean(config.startDate) &&
            Boolean(config.endDate),
        queryFn: async () => {
            const events: Dhis2Event[] = []
            const pageSize = Math.max(1, Math.min(config.pageSize, 1000))
            const maxPages = 100

            for (const programStageId of config.programStageIds) {
                for (let page = 1; page <= maxPages; page += 1) {
                    const result = await engine.query({
                        events: {
                            resource: 'tracker/events',
                            params: {
                                program: config.programId,
                                programStage: programStageId,
                                occurredAfter: config.startDate,
                                occurredBefore: config.endDate,
                                page,
                                pageSize,
                                totalPages: false,
                                fields: 'event,status,program,programStage,orgUnit,occurredAt,dataValues[dataElement,value]',
                            },
                        },
                    })

                    const response = result.events as EventsResponse
                    const pageEvents =
                        response.events ?? response.instances ?? []
                    events.push(...pageEvents)

                    const pager = response.pager
                    const hasNextPage =
                        Boolean(pager?.nextPage) ||
                        (pager?.pageCount !== undefined &&
                            page < pager.pageCount)

                    if (!hasNextPage || pageEvents.length < pageSize) {
                        break
                    }

                    if (page === maxPages) {
                        throw new Error(
                            `DHIS2 returned more than ${maxPages * pageSize} events for one program stage. Narrow the date range or reduce the query scope.`
                        )
                    }
                }
            }

            const dataElementNames = await getDataElementNamesById(
                engine,
                unique(
                    events.flatMap((event) =>
                        (event.dataValues ?? []).map(
                            (dataValue) => dataValue.dataElement
                        )
                    )
                )
            )
            const [level2Units, level3Units, orgUnitsById] = await Promise.all([
                fetchDhis2Json<OrganisationUnitsResponse>(
                    'organisationUnits?level=2&fields=id,displayName,name&paging=false&order=displayName:asc'
                ),
                fetchDhis2Json<OrganisationUnitsResponse>(
                    'organisationUnits?level=3&fields=id,displayName,name&paging=false&order=displayName:asc'
                ),
                getOrganisationUnitsByIds(unique(events.map((event) => event.orgUnit))),
            ])

            const regionById = new Map(
                (level2Units.organisationUnits ?? []).map((row) => [
                    row.id,
                    row.displayName ?? row.name ?? row.id,
                ])
            )
            const countryById = new Map(
                (level3Units.organisationUnits ?? []).map((row) => [
                    row.id,
                    row.displayName ?? row.name ?? row.id,
                ])
            )

            return events.flatMap<Dhis2ValueRow>((event) => {
                const occurredAt = event.occurredAt ?? event.eventDate
                const period = getPeriodFromDate(occurredAt)
                const country =
                    valueByDataElement(event, config.countryDataElementId) ??
                    resolveOrganisationUnitLevelLabel(
                        event.orgUnit,
                        orgUnitsById,
                        countryById
                    )
                const region =
                    valueByDataElement(event, config.regionDataElementId) ??
                    resolveOrganisationUnitLevelLabel(
                        event.orgUnit,
                        orgUnitsById,
                        regionById
                    )
                const goCode = valueByDataElement(
                    event,
                    config.goCodeDataElementId
                )

                return (event.dataValues ?? []).map((dataValue) => ({
                    event: event.event,
                    status: event.status,
                    orgUnit: event.orgUnit,
                    orgUnitName:
                        orgUnitsById.get(event.orgUnit ?? '')?.displayName ??
                        event.orgUnit ??
                        '',
                    country,
                    region,
                    goCode,
                    occurredAt,
                    period,
                    dataElement: dataValue.dataElement,
                    dataElementName:
                        dataElementNames.get(dataValue.dataElement) ??
                        dataValue.dataElement,
                    value:
                        dataValue.value === undefined ||
                        dataValue.value === null
                            ? ''
                            : String(dataValue.value),
                }))
            })
        },
        staleTime: 5 * 60 * 1000,
        cacheTime: 10 * 60 * 1000,
    })
}
