import { IconButton } from "@chakra-ui/react"
import React from "react"
import { FaEllipsisV } from "react-icons/fa"

import type { RolePromptPublic } from "@/client"
import DeleteRolePrompt from "../RolePrompts/DeleteRolePrompt"
import EditRolePrompt from "../RolePrompts/EditRolePrompt"
import { MenuContent, MenuRoot, MenuTrigger } from "../ui/menu"

interface RolePromptActionsMenuProps {
  prompt: RolePromptPublic
  disabled?: boolean
}

export const RolePromptActionsMenu = ({
  prompt,
  disabled,
}: RolePromptActionsMenuProps) => {
  return (
    <MenuRoot closeOnSelect={false}>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <FaEllipsisV fontSize="16px" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <EditRolePrompt prompt={prompt} />
        <DeleteRolePrompt id={prompt.id.toString()} />
      </MenuContent>
    </MenuRoot>
  )
}
