// App.tsx — 极简路由（History API，无第三方依赖）+ 全局网格背景
import React, { useState, useEffect, useCallback } from 'react'
import { Home } from './Home'
import { Detail } from './Detail'
import { Watchlist } from './Watchlist'
import { Tactic } from './Tactic'

function useRoute() {
  const [loc, setLoc] = useState(() => ({
    path: location.pathname,
    search: location.search,
  }))

  useEffect(() => {
    const onPop = () => setLoc({ path: location.pathname, search: location.search })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string) => {
    history.pushState({}, '', to)
    setLoc({ path: location.pathname, search: location.search })
  }, [])

  return { ...loc, navigate }
}

export default function App() {
  const { path, search, navigate } = useRoute()
  const params = new URLSearchParams(search)

  let page: React.ReactNode
  if (path.startsWith('/items/')) {
    const id = decodeURIComponent(path.slice('/items/'.length))
    page = <Detail id={id} navigate={navigate} />
  } else if (path === '/watchlist' || path.startsWith('/watchlist')) {
    page = <Watchlist navigate={navigate} />
  } else if (path === '/tactic' || path.startsWith('/tactic')) {
    page = <Tactic navigate={navigate} />
  } else {
    page = <Home params={params} navigate={navigate} />
  }

  return (
    <>
      <div className="fx-grid" aria-hidden="true" />
      {page}
    </>
  )
}
