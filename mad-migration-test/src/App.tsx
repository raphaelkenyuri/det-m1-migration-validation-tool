import { Provider as RuntimeProvider, useAlerts } from '@dhis2/app-runtime'
import { AlertBar, AlertStack, CssReset, CssVariables } from '@dhis2/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { MigrationTool } from './features/migration/MigrationTool'
import { SyncUrlWithGlobalShell } from './utils/SyncUrlWithGlobalShell'

const queryClient = new QueryClient()

const getInjectedBaseUrl = () => {
    const baseUrl = document
        .querySelector('meta[name="dhis2-base-url"]')
        ?.getAttribute('content')
    if (baseUrl && baseUrl !== '__DHIS2_BASE_URL__') {
        return baseUrl
    }
    return null
}

const runtimeConfig = {
    baseUrl: getInjectedBaseUrl() || process.env.REACT_APP_DHIS2_BASE_URL || '',
    appName: process.env.REACT_APP_DHIS2_APP_NAME || '',
    apiVersion: Number.parseInt(
        process.env.REACT_APP_DHIS2_API_VERSION || '41',
        10
    ),
}

const router = createHashRouter([
    {
        element: <SyncUrlWithGlobalShell />,
        children: [
            {
                path: '/',
                element: <MigrationTool />,
            },
        ],
    },
])

const AlertsRenderer = () => {
    const alerts = useAlerts()

    return (
        <AlertStack>
            {alerts.map((alert) => (
                <AlertBar
                    key={alert.id}
                    onHidden={() => alert.remove?.()}
                    {...(alert.options as Record<string, unknown>)}
                >
                    {alert.message}
                </AlertBar>
            ))}
        </AlertStack>
    )
}

const App = () => (
    <RuntimeProvider
        config={runtimeConfig}
        plugin={false}
        userInfo={undefined}
        parentAlertsAdd={undefined}
        showAlertsInPlugin={false}
    >
        <QueryClientProvider client={queryClient}>
            <CssReset />
            <CssVariables theme spacers colors elevations />
            <AlertsRenderer />
            <RouterProvider router={router} />
        </QueryClientProvider>
    </RuntimeProvider>
)

export default App
