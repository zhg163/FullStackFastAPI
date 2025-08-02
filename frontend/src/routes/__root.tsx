import { Outlet, createRootRoute } from "@tanstack/react-router"
import React from "react"

import NotFound from "@/components/Common/NotFound"

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <NotFound />,
})
