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
  type RoleTemplateItemCreate,
  RoleTemplateItemsService,
  RoleTemplatesService,
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

const AddRoleTemplateItem = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  // 获取角色模板列表
  const { data: roleTemplatesData } = useQuery({
    queryKey: ["role-templates", "all"],
    queryFn: () =>
      RoleTemplatesService.readRoleTemplates({ skip: 0, limit: 100 }),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<RoleTemplateItemCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      role_tmp_id: 0,
      item_name: "",
      item_prompt_desc: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleTemplateItemCreate) =>
      RoleTemplateItemsService.createRoleTemplateItem({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("模板条目创建成功")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["role-template-items"] })
    },
  })

  const onSubmit: SubmitHandler<RoleTemplateItemCreate> = (data) => {
    // 确保role_tmp_id是数字类型
    const submitData = {
      ...data,
      role_tmp_id: Number(data.role_tmp_id),
    }
    mutation.mutate(submitData)
  }

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
      size={{ base: "sm", md: "md" }}
      placement="center"
    >
      <DialogTrigger asChild>
        <Button variant="solid" colorScheme="purple" size="md" mb={4}>
          <FaPlus fontSize="16px" />
          添加模板条目
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>添加模板条目</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
              <Field
                label="所属角色模板"
                invalid={!!errors.role_tmp_id}
                errorText={errors.role_tmp_id?.message}
                required
              >
                <Box>
                  <select
                    {...register("role_tmp_id", {
                      required: "请选择角色模板",
                      validate: (value) =>
                        Number(value) > 0 || "请选择有效的角色模板",
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
                    <option value="">请选择角色模板</option>
                    {roleTemplatesData?.data.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.template_name || `ID:${template.id}`}
                      </option>
                    ))}
                  </select>
                </Box>
              </Field>

              <Field
                label="条目名称"
                invalid={!!errors.item_name}
                errorText={errors.item_name?.message}
                required
              >
                <Input
                  id="item_name"
                  {...register("item_name", {
                    required: "条目名称是必需的",
                    minLength: {
                      value: 1,
                      message: "条目名称至少需要1个字符",
                    },
                    maxLength: {
                      value: 255,
                      message: "条目名称不能超过255个字符",
                    },
                  })}
                  placeholder="例如：技能模块、对话模块、战斗模块"
                  type="text"
                />
              </Field>

              <Field
                label="提示词描述"
                invalid={!!errors.item_prompt_desc}
                errorText={errors.item_prompt_desc?.message}
              >
                <Textarea
                  id="item_prompt_desc"
                  {...register("item_prompt_desc")}
                  placeholder="描述这个条目的具体作用和提示词内容"
                  rows={4}
                  resize="vertical"
                />
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
              colorScheme="purple"
              type="submit"
              loading={isSubmitting}
              disabled={!isValid}
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

export default AddRoleTemplateItem
