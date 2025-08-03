import { IconButton } from "@chakra-ui/react"
import { FaEllipsisV } from "react-icons/fa"

import type { RoleDirPublic } from "@/client"
import DeleteRoleDir from "../RoleDirs/DeleteRoleDir"
import EditRoleDir from "../RoleDirs/EditRoleDir"
import { MenuContent, MenuRoot, MenuTrigger } from "../ui/menu"

interface RoleDirActionsMenuProps {
  roleDir: RoleDirPublic
  disabled?: boolean
}

export const RoleDirActionsMenu = ({
  roleDir,
  disabled,
}: RoleDirActionsMenuProps) => {
  return (
    <MenuRoot closeOnSelect={false}>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <FaEllipsisV fontSize="16px" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <EditRoleDir roleDir={roleDir} />
        <DeleteRoleDir id={roleDir.id.toString()} />
      </MenuContent>
    </MenuRoot>
  )
}
