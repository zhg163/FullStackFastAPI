import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useState, useEffect } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Box,
  Button,
  DialogActionTrigger,
  DialogRoot,
  DialogTrigger,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { FaEdit } from "react-icons/fa"

import {
  type RolePromptPublic,
  type RolePromptUpdate,
  RolePromptsService,
  RolesService,
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
  DialogTitle,
} from "../ui/dialog"
import { Field } from "../ui/field"

interface EditRolePromptProps {
  prompt: RolePromptPublic
}

const EditRolePrompt = ({ prompt }: EditRolePromptProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  // 获取角色列表
  const { data: rolesData } = useQuery({
    queryKey: ["roles", "all"],
    queryFn: () => RolesService.readRoles({ skip: 0, limit: 100 }),
  })

  const [promptText, setPromptText] = useState("")

  useEffect(() => {
    if (prompt.user_prompt) {
      setPromptText(JSON.stringify(prompt.user_prompt, null, 2))
    }
  }, [prompt.user_prompt])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RolePromptUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      role_id: prompt.role_id,
      version: prompt.version,
      is_active: prompt.is_active || "Y",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RolePromptUpdate) =>
      RolePromptsService.updateRolePrompt({
        rolePromptId: prompt.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("角色提示词更新成功")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["role-prompts"] })
    },
  })

  const onSubmit: SubmitHandler<RolePromptUpdate> = async (data) => {
    // 解析JSON提示词
    let userPrompt = {}
    try {
      userPrompt = promptText ? JSON.parse(promptText) : {}
    } catch (error) {
      // 如果不是有效JSON，将其作为字符串存储
      userPrompt = { content: promptText }
    }

    const submitData = {
      ...data,
      role_id: data.role_id ? Number(data.role_id) : undefined,
      version: data.version ? Number(data.version) : undefined,
      user_prompt: userPrompt,
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
        <Button variant="ghost" size="sm" colorScheme="blue">
          <FaEdit fontSize="16px" />
          编辑
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>编辑角色提示词</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
              <Field
                label="所属角色"
                invalid={!!errors.role_id}
                errorText={errors.role_id?.message}
              >
                <Box>
                  <select
                    {...register("role_id")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      width: "100%",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer",
                    }}
                  >
                    {rolesData?.data.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} - {role.role_dir?.ip}
                      </option>
                    ))}
                  </select>
                </Box>
              </Field>

              <Field
                label="版本号"
                invalid={!!errors.version}
                errorText={errors.version?.message}
                required
              >
                <Input
                  id="version"
                  {...register("version", {
                    required: "版本号是必需的",
                    min: {
                      value: 1,
                      message: "版本号必须大于0",
                    },
                  })}
                  type="number"
                />
              </Field>

              <Field
                label="激活状态"
                invalid={!!errors.is_active}
                errorText={errors.is_active?.message}
              >
                <Box>
                  <select
                    {...register("is_active")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      width: "100%",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer",
                    }}
                  >
                    <option value="Y">激活</option>
                    <option value="N">未激活</option>
                  </select>
                </Box>
              </Field>

              <Field
                label="用户提示词内容"
                invalid={!!promptText && promptText.length === 0}
                errorText="提示词内容不能为空"
                required
              >
                <Textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="输入JSON格式的提示词内容"
                  rows={8}
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
              colorScheme="blue"
              type="submit"
              loading={isSubmitting}
              disabled={!promptText.trim()}
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

export default EditRolePrompt
