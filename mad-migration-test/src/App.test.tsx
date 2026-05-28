jest.mock('@dhis2/app-adapter', () => ({
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

it('renders without crashing', () => {
    const container = document.createElement('div')
    const originalFetch = globalThis.fetch
    ;(globalThis as typeof globalThis & {
        fetch: typeof fetch
    }).fetch = jest.fn(async (input) => {
        const url =
            typeof input === 'string'
                ? input
                : input instanceof Request
                  ? input.url
                  : String(input)

        if (url.includes('/api/programs?')) {
            return new Response(
                JSON.stringify({
                    programs: [
                        {
                            id: 'program-1',
                            displayName: 'Program 1',
                        },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (url.includes('/api/dataElements?')) {
            return new Response(
                JSON.stringify({
                    dataElements: [
                        {
                            id: 'de-1',
                            displayName: 'Data element 1',
                        },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (url.includes('/api/organisationUnits?level=2')) {
            return new Response(
                JSON.stringify({
                    organisationUnits: [
                        {
                            id: 'ou-region-1',
                            displayName: 'Africa region',
                        },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        if (url.includes('/api/organisationUnits?level=3')) {
            return new Response(
                JSON.stringify({
                    organisationUnits: [
                        {
                            id: 'ou-country-1',
                            displayName: 'Kenya',
                        },
                    ],
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        }

        return new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    }) as typeof fetch

    const root = createRoot(container)
    root.render(<App />)

    root.unmount()
    ;(globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch =
        originalFetch
})
