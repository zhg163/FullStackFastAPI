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
  type RolePromptCreate,
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
  DialogRoot,
  DialogTrigger,
} from "../ui/dialog"
import { Field } from "../ui/field"

const AddRolePrompt = () => {
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
  } = useForm<RolePromptCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      role_id: 0,
      version: 1,
      user_prompt: {},
      is_active: "Y",
    },
  })

  const [promptText, setPromptText] = useState("")

  const mutation = useMutation({
    mutationFn: (data: RolePromptCreate) =>
      RolePromptsService.createRolePrompt({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("角色提示词创建成功")
      reset()
      setPromptText("")
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["role-prompts"] })
    },
  })

  const onSubmit: SubmitHandler<RolePromptCreate> = (data) => {
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
      role_id: Number(data.role_id),
      version: Number(data.version),
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
        <Button variant="solid" colorScheme="green" size="md" mb={4}>
          <FaPlus fontSize="16px" />
          添加角色提示词
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>添加角色提示词</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
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
                  placeholder="例如：1"
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
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #E2E8F0",
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
                  placeholder='输入JSON格式的提示词，例如：
{
  "system": "你是一个活泼的小女孩角色",
  "background": "蒙德城火花骑士",
  "personality": "天真、活泼、爱冒险"
}'
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
              colorScheme="green"
              type="submit"
              loading={isSubmitting}
              disabled={!isValid || !promptText.trim()}
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

export default AddRolePrompt
