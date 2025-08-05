import { IconButton } from "@chakra-ui/react"
import React from "react"
import { FaEllipsisV } from "react-icons/fa"

import type { TaskCreatRolePromptPublic } from "@/client"
import DeleteTaskCreatRolePrompt from "../TaskCreatRolePrompts/DeleteTaskCreatRolePrompt"
import EditTaskCreatRolePrompt from "../TaskCreatRolePrompts/EditTaskCreatRolePrompt"
import StartTaskCreatRolePrompt from "../TaskCreatRolePrompts/StartTaskCreatRolePrompt"
import StopTaskCreatRolePrompt from "../TaskCreatRolePrompts/StopTaskCreatRolePrompt"
import { MenuContent, MenuRoot, MenuTrigger } from "../ui/menu"

interface TaskCreatRolePromptActionsMenuProps {
  task: TaskCreatRolePromptPublic
  disabled?: boolean
}

export const TaskCreatRolePromptActionsMenu = ({
  task,
  disabled,
}: TaskCreatRolePromptActionsMenuProps) => {
  return (
    <MenuRoot closeOnSelect={false}>
      <MenuTrigger asChild>
        <IconButton variant="ghost" color="inherit" disabled={disabled}>
          <FaEllipsisV fontSize="16px" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <StartTaskCreatRolePrompt task={task} />
        <StopTaskCreatRolePrompt task={task} />
        <EditTaskCreatRolePrompt task={task} />
        <DeleteTaskCreatRolePrompt id={task.id.toString()} />
      </MenuContent>
    </MenuRoot>
  )
}
