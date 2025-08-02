import React from "react"
import { IconButton } from "@chakra-ui/react"
import { FaEllipsisV } from "react-icons/fa"

import { type RoleTemplateItemPublic } from "@/client"
import DeleteRoleTemplateItem from "../RoleTemplateItems/DeleteRoleTemplateItem"
import EditRoleTemplateItem from "../RoleTemplateItems/EditRoleTemplateItem"
import {
  MenuContent,
  MenuRoot,
  MenuTrigger,
} from "../ui/menu"

interface RoleTemplateItemActionsMenuProps {
  item: RoleTemplateItemPublic
  disabled?: boolean
}

export const RoleTemplateItemActionsMenu = ({ item, disabled }: RoleTemplateItemActionsMenuProps) => {
  return (
    <MenuRoot closeOnSelect={false}>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <FaEllipsisV fontSize="16px" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <EditRoleTemplateItem item={item} />
        <DeleteRoleTemplateItem id={item.id.toString()} />
      </MenuContent>
    </MenuRoot>
  )
} 