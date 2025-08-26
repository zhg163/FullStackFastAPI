import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Box,
  Button,
  DialogActionTrigger,
  DialogTitle,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { FaPlus } from "react-icons/fa"

import {
  RolesService,
  type TaskCreatRolePromptCreate,
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

const AddTaskCreatRolePrompt = () => {
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
    setValue,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<TaskCreatRolePromptCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      task_name: "",
      task_state: "P",
      task_cmd: {},
      role_id: 0,
      role_item_prompt: {},
    },
  })

  const [taskCmdText, setTaskCmdText] = useState("")
  const [roleItemPromptText, setRoleItemPromptText] = useState("")

  const mutation = useMutation({
    mutationFn: (data: TaskCreatRolePromptCreate) =>
      TaskCreatRolePromptsService.createTaskCreatRolePrompt({
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("任务创建成功")
      reset()
      setTaskCmdText("")
      setRoleItemPromptText("")
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
  })

  const onSubmit: SubmitHandler<TaskCreatRolePromptCreate> = (data) => {
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

    const submitData = {
      ...data,
      role_id: Number(data.role_id),
      task_cmd: taskCmd,
      role_item_prompt: roleItemPrompt,
    }
    mutation.mutate(submitData)
  }

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
      size={{ base: "sm", md: "lg" }}
      placement="center"
    >
      <DialogTrigger asChild>
        <Button variant="solid" colorScheme="teal" size="sm" height="32px">
          <FaPlus fontSize="14px" />
          添加任务
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>添加任务</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
              <Field
                label="任务名称"
                invalid={!!errors.task_name}
                errorText={errors.task_name?.message}
                required
              >
                <Input
                  id="task_name"
                  {...register("task_name", {
                    required: "任务名称是必需的",
                    minLength: {
                      value: 1,
                      message: "任务名称至少需要1个字符",
                    },
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
                required
              >
                <Box>
                  <select
                    {...register("role_id", {
                      required: "请选择角色",
                      validate: (value) =>
                        Number(value) > 0 || "请选择有效的角色",
                    })}
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
                    <option value="">请选择角色</option>
                    {rolesData?.data.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} - {role.role_dir?.ip}
                      </option>
                    ))}
                  </select>
                </Box>
              </Field>

              <Field
                label="任务命令"
                invalid={!!taskCmdText && taskCmdText.length === 0}
                errorText="任务命令不能为空"
                required
              >
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
                  请输入有效的JSON格式，或者普通文本（将自动转换为JSON）
                </Text>
              </Field>

              <Field
                label="角色条目提示词"
                invalid={
                  !!roleItemPromptText && roleItemPromptText.length === 0
                }
                errorText="角色条目提示词不能为空"
                required
              >
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
                  请输入有效的JSON格式，或者普通文本（将自动转换为JSON）
                </Text>
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
              colorScheme="teal"
              type="submit"
              loading={isSubmitting}
              disabled={
                !isValid || !taskCmdText.trim() || !roleItemPromptText.trim()
              }
            >
              添加
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default AddTaskCreatRolePrompt
