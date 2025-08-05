import { Button } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import React from "react"
import { FiPlay } from "react-icons/fi"

import type { TaskCreatRolePromptPublic } from "@/client"
import useCustomToast from "@/hooks/useCustomToast"
import { MenuItem } from "../ui/menu"

interface StartTaskCreatRolePromptProps {
  task: TaskCreatRolePromptPublic
}

export default function StartTaskCreatRolePrompt({
  task,
}: StartTaskCreatRolePromptProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const startTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      // 调用启动任务的API
      const token = localStorage.getItem("access_token")
      const response = await fetch(`/api/v1/task-creat-role-prompts/${taskId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "启动任务失败")
      }
      
      return response.json()
    },
    onSuccess: () => {
      showSuccessToast("任务启动成功")
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message || "启动任务失败")
    },
  })

  const handleStartTask = () => {
    if (!["P", "F"].includes(task.task_state)) {
      showErrorToast("只有待启动或失败状态的任务才能启动")
      return
    }
    
    startTaskMutation.mutate(task.id)
  }

  // 只有待启动和失败状态的任务才显示启动按钮
  if (!["P", "F"].includes(task.task_state)) {
    return null
  }

  // 根据任务状态显示不同的按钮文本
  const buttonText = task.task_state === "F" ? "重新启动" : "启动任务"

  return (
    <MenuItem
      onClick={handleStartTask}
      color="green.600"
      disabled={startTaskMutation.isPending}
    >
      <FiPlay style={{ marginRight: "8px" }} />
      {startTaskMutation.isPending ? "启动中..." : buttonText}
    </MenuItem>
  )
}