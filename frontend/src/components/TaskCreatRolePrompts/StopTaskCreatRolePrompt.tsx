import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MenuItem } from "@chakra-ui/react"
import { FiSquare } from "react-icons/fi"

import useCustomToast from "@/hooks/useCustomToast"
import type { TaskCreatRolePromptPublic } from "@/client"

interface StopTaskCreatRolePromptProps {
  task: TaskCreatRolePromptPublic
}

export default function StopTaskCreatRolePrompt({ task }: StopTaskCreatRolePromptProps) {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const stopTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await fetch(`/api/v1/task-creat-role-prompts/${taskId}/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "停止任务失败")
      }
      
      return response.json()
    },
    onSuccess: () => {
      showSuccessToast("任务已停止")
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
    onError: (error: Error) => {
      showErrorToast(error.message || "停止任务失败")
    },
  })

  const handleStopTask = () => {
    if (!["W", "R"].includes(task.task_state)) {
      showErrorToast("只有等待中或运行中的任务才能停止")
      return
    }
    
    stopTaskMutation.mutate(task.id)
  }

  // 只有等待中和运行中状态的任务才显示停止按钮
  if (!["W", "R"].includes(task.task_state)) {
    return null
  }

  return (
    <MenuItem
      onClick={handleStopTask}
      color="red.600"
      disabled={stopTaskMutation.isPending}
    >
      <FiSquare style={{ marginRight: "8px" }} />
      {stopTaskMutation.isPending ? "停止中..." : "停止任务"}
    </MenuItem>
  )
}