import { MappingConfig } from './types'

export const defaultMappingConfig: MappingConfig = {
    version: 1,
    dhis2: {
        programId: '',
        programStageIds: [],
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        pageSize: 5000,
        goCodeDataElementId: 'CR11FIvy8Fi',
    },
    mappings: [
        {
            id: 'detainees-referred-transferred',
            indicator:
                'DET-M1 Detainees actually referred and transferred to external health facility',
            mode: 'option',
            oldMadColumns: ['M1_12_07000'],
            oldMadOption: 'Scabies',
            dhis2DataElement:
                'DET-M1 Detainees actually referred and transferred to external health facility',
            dhis2Value: '2',
        },
        {
            id: 'detainees-total',
            indicator:
                'DET-M1 Detainees actually referred and transferred to external health facility',
            mode: 'numeric',
            oldMadColumns: ['M1_12_07000'],
            dhis2DataElement:
                'DET-M1 Detainees actually referred and transferred to external health facility',
        },
        {
            id: 'acute-diseases-dental',
            indicator:
                'DET-M1 Are the 4 most frequent acute diseases / symptoms / syndroms (new cases only) accessible ?',
            mode: 'multiCode',
            oldMadColumns: [
                'LBL_M1_06_03100',
                'LBL_M1_06_03200',
                'LBL_M1_06_03000',
                'LBL_M1_06_03300',
            ],
            oldMadOption: 'Dental problem acute',
            dhis2DataElement: 'DET-M1 Dental problem acute',
            dhis2Value: 'True',
        },
    ],
}

export const requiredOldMadHeaders = [
    'DATERANGE',
    'REPORTPLACECOMMONNAME',
    'REPORTPLACECOUNTRYNAME',
    'REPORTPLACECOUNTRYREGION',
]
