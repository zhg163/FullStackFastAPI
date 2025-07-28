import { IconButton } from "@chakra-ui/react"
import { FaEllipsisV } from "react-icons/fa"

import { type RolePublic } from "@/client"
import DeleteRole from "../Roles/DeleteRole"
import EditRole from "../Roles/EditRole"
import {
  MenuContent,
  MenuRoot,
  MenuTrigger,
} from "../ui/menu"

interface RoleActionsMenuProps {
  role: RolePublic
  disabled?: boolean
}

export const RoleActionsMenu = ({ role, disabled }: RoleActionsMenuProps) => {
  return (
    <MenuRoot closeOnSelect={false}>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <FaEllipsisV fontSize="16px" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <EditRole role={role} />
        <DeleteRole id={role.id.toString()} />
      </MenuContent>
    </MenuRoot>
  )
} 