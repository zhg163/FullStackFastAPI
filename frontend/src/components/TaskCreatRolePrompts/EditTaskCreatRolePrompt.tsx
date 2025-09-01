import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Box,
  Button,
  DialogActionTrigger,
  DialogTitle,
  HStack,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { FaEdit } from "react-icons/fa"

import {
  RolesService,
  type TaskCreatRolePromptPublic,
  type TaskCreatRolePromptUpdate,
  TaskCreatRolePromptsService,
} from "@/client"
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
import { Field } from "../ui/field"
import { MenuItem } from "../ui/menu"

interface EditTaskCreatRolePromptProps {
  task: TaskCreatRolePromptPublic
}

const EditTaskCreatRolePrompt = ({ task }: EditTaskCreatRolePromptProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  // 获取角色列表
  const { data: rolesData } = useQuery({
    queryKey: ["roles", "all"],
    queryFn: () => RolesService.readRoles({ skip: 0, limit: 100 }),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskCreatRolePromptUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      task_name: task.task_name || "",
      task_state: task.task_state || "",
      role_id: task.role_id || undefined,
    },
  })

  const [taskCmdText, setTaskCmdText] = useState(
    JSON.stringify(task.task_cmd, null, 2) || "",
  )
  const [roleItemPromptText, setRoleItemPromptText] = useState(
    JSON.stringify(task.role_item_prompt, null, 2) || "",
  )

  const mutation = useMutation({
    mutationFn: (data: TaskCreatRolePromptUpdate) =>
      TaskCreatRolePromptsService.updateTaskCreatRolePrompt({
        taskPromptId: task.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("任务更新成功")
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
  })

  const onSubmit: SubmitHandler<TaskCreatRolePromptUpdate> = (data) => {
    // 解析JSON字段
    let taskCmd = {}
    let roleItemPrompt = {}

    try {
      taskCmd = taskCmdText ? JSON.parse(taskCmdText) : {}
    } catch (error) {
      taskCmd = { command: taskCmdText }
    }

    try {
      roleItemPrompt = roleItemPromptText ? JSON.parse(roleItemPromptText) : {}
    } catch (error) {
      roleItemPrompt = { content: roleItemPromptText }
    }

    const submitData: TaskCreatRolePromptUpdate = {
      ...data,
      role_id: data.role_id ? Number(data.role_id) : undefined,
      task_cmd: taskCmd,
      role_item_prompt: roleItemPrompt,
    }
    mutation.mutate(submitData)
  }

  const resetForm = () => {
    reset({
      task_name: task.task_name || "",
      task_state: task.task_state || "",
      role_id: task.role_id || undefined,
    })
    setTaskCmdText(JSON.stringify(task.task_cmd, null, 2) || "")
    setRoleItemPromptText(JSON.stringify(task.role_item_prompt, null, 2) || "")
  }

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={({ open }) => {
        setIsOpen(open)
        if (open) {
          resetForm()
        }
      }}
      size={{ base: "sm", md: "lg" }}
      placement="center"
    >
      <DialogTrigger asChild>
        <MenuItem value="edit" color="blue.600">
          <FaEdit fontSize="16px" />
          编辑任务
        </MenuItem>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>编辑任务</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
              <Field
                label="任务名称"
                invalid={!!errors.task_name}
                errorText={errors.task_name?.message}
              >
                <Input
                  id="task_name"
                  {...register("task_name", {
                    maxLength: {
                      value: 255,
                      message: "任务名称不能超过255个字符",
                    },
                  })}
                  placeholder="例如：初始化角色、生成提示词"
                  type="text"
                />
              </Field>

              <Field
                label="任务状态"
                invalid={!!errors.task_state}
                errorText={errors.task_state?.message}
              >
                <Box>
                  <select
                    {...register("task_state")}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #E2E8F0",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">不更改</option>
                    <option value="P">进行中</option>
                    <option value="W">等待中</option>
                    <option value="C">已完成</option>
                    <option value="F">失败</option>
                  </select>
                </Box>
              </Field>

              <Field
                label="所属角色"
                invalid={!!errors.role_id}
                errorText={errors.role_id?.message}
              >
                <Box>
                  <select
                    {...register("role_id")}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #E2E8F0",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">不更改</option>
                    {rolesData?.data.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} - {role.role_dir?.ip}
                      </option>
                    ))}
                  </select>
                </Box>
              </Field>

              <Field label="任务命令">
                <VStack gap={2}>
                  <HStack gap={2} width="100%" justifyContent="flex-end">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        try {
                          let cleanText = taskCmdText
                          
                          // 移除开头和结尾的多余引号
                          while (cleanText.startsWith('"') && cleanText.endsWith('"')) {
                            try {
                              cleanText = JSON.parse(cleanText)
                            } catch {
                              // 如果JSON.parse失败，手动去掉引号
                              cleanText = cleanText.slice(1, -1)
                            }
                          }
                          
                          // 清理转义符
                          if (typeof cleanText === 'string') {
                            cleanText = cleanText
                              .replace(/\\n/g, '\n')        // 清理 \n 转为真正的换行
                              .replace(/\\"/g, '"')         // 清理 \" 转为 "
                              .replace(/\\'/g, "'")         // 清理 \' 转为 '
                              .replace(/\\\\/g, '\\')       // 清理 \\ 转为 \
                              .replace(/\\r/g, '\r')        // 清理 \r
                              .replace(/\\t/g, '\t')        // 清理 \t 转为制表符
                          }
                          
                          // 尝试解析为JSON并格式化
                          try {
                            const parsed = JSON.parse(cleanText)
                            setTaskCmdText(JSON.stringify(parsed, null, 2))
                          } catch {
                            // 如果不是有效JSON，直接使用清理后的文本
                            setTaskCmdText(cleanText)
                          }
                        } catch (error) {
                          console.error('格式化失败:', error)
                          // 发生错误时保持原文本不变
                        }
                      }}
                    >
                      格式化/清理转义符
                    </Button>
                  </HStack>
                  <Textarea
                    value={taskCmdText}
                    onChange={(e) => setTaskCmdText(e.target.value)}
                    placeholder='输入JSON格式的任务命令，例如：
{
  "command": "create_full_role",
  "params": {"version": 1}
}'
                    rows={4}
                    resize="vertical"
                    fontFamily="monospace"
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    请输入有效的JSON格式，或者普通文本（将自动转换为JSON）。点击"格式化/清理转义符"按钮可自动清理 \n、\"、\' 等转义字符
                  </Text>
                </VStack>
              </Field>

              <Field label="角色条目提示词">
                <VStack gap={2}>
                  <HStack gap={2} width="100%" justifyContent="flex-end">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        try {
                          // 先清理转义符和换行符，然后尝试解析JSON
                          let cleanText = roleItemPromptText
                            .replace(/\\n/g, ' ')           // 清理 \n
                            .replace(/\\"/g, '"')           // 清理 \" 转为 "
                            .replace(/\\'/g, "'")           // 清理 \' 转为 '
                            .replace(/\\\\/g, '\\')         // 清理 \\ 转为 \
                            .replace(/\\r/g, '')            // 清理 \r
                            .replace(/\\t/g, ' ')           // 清理 \t 转为空格
                          
                          // 尝试解析为JSON并格式化
                          const parsed = JSON.parse(cleanText)
                          setRoleItemPromptText(JSON.stringify(parsed, null, 2))
                        } catch {
                          // 如果不是JSON，就直接清理转义符
                          const cleanText = roleItemPromptText
                            .replace(/\\n/g, ' ')           // 清理 \n
                            .replace(/\\"/g, '"')           // 清理 \" 转为 "
                            .replace(/\\'/g, "'")           // 清理 \' 转为 '
                            .replace(/\\\\/g, '\\')         // 清理 \\ 转为 \
                            .replace(/\\r/g, '')            // 清理 \r
                            .replace(/\\t/g, ' ')           // 清理 \t 转为空格
                          setRoleItemPromptText(cleanText)
                        }
                      }}
                    >
                      格式化/清理转义符
                    </Button>
                  </HStack>
                  <Textarea
                    value={roleItemPromptText}
                    onChange={(e) => setRoleItemPromptText(e.target.value)}
                    placeholder='输入JSON格式的角色条目提示词，例如：
{
  "prompt_type": "basic",
  "category": "combat"
}'
                    rows={4}
                    resize="vertical"
                    fontFamily="monospace"
                  />
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    请输入有效的JSON格式，或者普通文本（将自动转换为JSON）。点击"格式化/清理转义符"按钮可自动清理 \n、\"、\' 等转义字符
                  </Text>
                </VStack>
              </Field>
            </VStack>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button variant="outline" disabled={isSubmitting}>
                取消
              </Button>
            </DialogActionTrigger>
            <Button
              variant="solid"
              colorScheme="blue"
              type="submit"
              loading={isSubmitting}
            >
              更新
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default EditTaskCreatRolePrompt
