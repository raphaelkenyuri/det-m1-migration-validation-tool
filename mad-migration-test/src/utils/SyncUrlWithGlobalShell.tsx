import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

export const SyncUrlWithGlobalShell = () => {
    const location = useLocation()

    useEffect(() => {
        dispatchEvent(new PopStateEvent('popstate'))
    }, [location.key])

    return <Outlet />
}
