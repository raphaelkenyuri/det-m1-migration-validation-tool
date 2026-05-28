import {
    getDataElementSelectValue,
    getOptionSelectValue,
    resolveOrganisationUnitLevelLabel,
    saveMappingConfig,
    toOrganisationUnitOptions,
    toDhis2DataElementOptions,
    toOptionSetOptions,
} from './dhis2Api'

describe('DHIS2 metadata helpers', () => {
    it('resolves a data element by id or display name', () => {
        const dataElements = [
            {
                id: 'de123',
                displayName: 'Country of origin',
                name: 'Country of origin',
            },
            {
                id: 'de456',
                name: 'Region',
            },
        ]

        expect(getDataElementSelectValue('Country of origin', dataElements)).toBe(
            'de123'
        )
        expect(getDataElementSelectValue('de456', dataElements)).toBe('de456')
    })

    it('maps data elements to select options with display-name fallbacks', () => {
        expect(
            toDhis2DataElementOptions([
                {
                    id: 'de123',
                    displayName: 'Country of origin',
                },
                {
                    id: 'de456',
                    name: 'Region',
                },
            ])
        ).toEqual([
            {
                id: 'de123',
                label: 'Country of origin',
                value: 'de123',
            },
            {
                id: 'de456',
                label: 'Region',
                value: 'de456',
            },
        ])
    })

    it('maps option sets to values that match stored DHIS2 values', () => {
        const optionSet = {
            id: 'os123',
            options: [
                {
                    id: 'opt1',
                    displayName: 'Yes',
                    code: 'Y',
                },
                {
                    id: 'opt2',
                    name: 'No',
                },
            ],
        }

        const options = toOptionSetOptions(optionSet)

        expect(options).toEqual([
            {
                id: 'opt1',
                label: 'Yes',
                value: 'Y',
            },
            {
                id: 'opt2',
                label: 'No',
                value: 'opt2',
            },
        ])
        expect(getOptionSelectValue('Yes', options)).toBe('Y')
    })

    it('maps org units to select options and resolves level labels from ancestry', () => {
        expect(
            toOrganisationUnitOptions([
                {
                    id: 'ou-2',
                    displayName: 'Africa region',
                },
                {
                    id: 'ou-3',
                    name: 'Kenya',
                },
            ])
        ).toEqual([
            {
                id: 'ou-2',
                label: 'Africa region',
                value: 'ou-2',
            },
            {
                id: 'ou-3',
                label: 'Kenya',
                value: 'ou-3',
            },
        ])

        const orgUnitsById = new Map([
            [
                'facility-1',
                {
                    ancestorIds: ['ou-3', 'ou-2', 'ou-1'],
                },
            ],
        ])
        const regionById = new Map([['ou-2', 'Africa region']])
        const countryById = new Map([['ou-3', 'Kenya']])

        expect(
            resolveOrganisationUnitLevelLabel(
                'facility-1',
                orgUnitsById,
                regionById
            )
        ).toBe('Africa region')
        expect(
            resolveOrganisationUnitLevelLabel(
                'facility-1',
                orgUnitsById,
                countryById
            )
        ).toBe('Kenya')
    })

    it('falls back from update to create when saving mapping config', async () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2024-05-28T07:00:00.000Z'))

        const engine = {
            mutate: jest
                .fn()
                .mockRejectedValueOnce(new Error('missing record'))
                .mockResolvedValueOnce(undefined),
        }

        const config = {
            version: 1,
            dhis2: {
                programId: 'program-1',
                programStageIds: ['stage-1'],
                startDate: '2024-01-01',
                endDate: '2024-06-30',
                pageSize: 5000,
            },
            mappings: [],
        }

        await expect(saveMappingConfig(engine, config)).resolves.toMatchObject({
            version: 1,
            dhis2: {
                programId: 'program-1',
                programStageIds: ['stage-1'],
            },
        })

        expect(engine.mutate).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                resource: 'dataStore/mad-migration-test/det-m1-mapping',
                type: 'update',
            })
        )
        expect(engine.mutate).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                resource: 'dataStore/mad-migration-test/det-m1-mapping',
                type: 'create',
            })
        )

        jest.useRealTimers()
    })
})
