import React from "react"
import { IconButton } from "@chakra-ui/react"
import { FaEllipsisV } from "react-icons/fa"

import { type RoleTemplatePublic } from "@/client"
import DeleteRoleTemplate from "../RoleTemplates/DeleteRoleTemplate"
import EditRoleTemplate from "../RoleTemplates/EditRoleTemplate"
import {
  MenuContent,
  MenuRoot,
  MenuTrigger,
} from "../ui/menu"

interface RoleTemplateActionsMenuProps {
  template: RoleTemplatePublic
  disabled?: boolean
}

export const RoleTemplateActionsMenu = ({ template, disabled }: RoleTemplateActionsMenuProps) => {
  return (
    <MenuRoot closeOnSelect={false}>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <FaEllipsisV fontSize="16px" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <EditRoleTemplate template={template} />
        <DeleteRoleTemplate id={template.id.toString()} />
      </MenuContent>
    </MenuRoot>
  )
} 