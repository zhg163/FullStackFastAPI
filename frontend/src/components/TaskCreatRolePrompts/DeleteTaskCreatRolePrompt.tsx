import { useMutation, useQueryClient } from "@tanstack/react-query"
import React from "react"
import { FaTrash } from "react-icons/fa"

import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Text,
} from "@chakra-ui/react"

import { TaskCreatRolePromptsService } from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTrigger,
} from "../ui/dialog"
import { MenuItem } from "../ui/menu"

interface DeleteTaskCreatRolePromptProps {
  id: string
}

const DeleteTaskCreatRolePrompt = ({ id }: DeleteTaskCreatRolePromptProps) => {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  const mutation = useMutation({
    mutationFn: () =>
      TaskCreatRolePromptsService.deleteTaskCreatRolePrompt({
        taskPromptId: Number.parseInt(id),
      }),
    onSuccess: () => {
      showSuccessToast("任务已删除")
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
  })

  return (
    <DialogRoot size="md" placement="center">
      <DialogTrigger asChild>
        <MenuItem value="delete" color="red.600">
          <FaTrash fontSize="16px" />
          删除任务
        </MenuItem>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除任务</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Text>确定要删除此任务吗？此操作无法撤销。</Text>
        </DialogBody>

        <DialogFooter gap={2}>
          <DialogActionTrigger asChild>
            <Button variant="outline">取消</Button>
          </DialogActionTrigger>
          <Button
            colorScheme="red"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            删除
          </Button>
        </DialogFooter>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  )
}

export default DeleteTaskCreatRolePrompt
