import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Box,
  Button,
  DialogActionTrigger,
  DialogRoot,
  DialogTrigger,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { FaEdit } from "react-icons/fa"

import {
  type RoleTemplatePublic,
  type RoleTemplateUpdate,
  RoleTemplatesService,
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

interface EditRoleTemplateProps {
  template: RoleTemplatePublic
}

const EditRoleTemplate = ({ template }: EditRoleTemplateProps) => {
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
  } = useForm<RoleTemplateUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      role_id: template.role_id,
      template_name: template.template_name || "",
      is_active: template.is_active || "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleTemplateUpdate) =>
      RoleTemplatesService.updateRoleTemplate({
        roleTemplateId: template.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("角色模板更新成功")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["role-templates"] })
    },
  })

  const onSubmit: SubmitHandler<RoleTemplateUpdate> = async (data) => {
    // 确保role_id是数字类型
    const submitData = {
      ...data,
      role_id: data.role_id ? Number(data.role_id) : undefined,
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
        <Button variant="ghost" size="sm" colorScheme="blue">
          <FaEdit fontSize="16px" />
          编辑
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>编辑角色模板</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
              <Field
                label="关联角色"
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
                        {role.name}
                      </option>
                    ))}
                  </select>
                </Box>
              </Field>

              <Field
                label="模板名称"
                invalid={!!errors.template_name}
                errorText={errors.template_name?.message}
              >
                <Input
                  id="template_name"
                  {...register("template_name", {
                    maxLength: {
                      value: 255,
                      message: "模板名称不能超过255个字符",
                    },
                  })}
                  type="text"
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
                    <option value="">请选择</option>
                    <option value="Y">激活</option>
                    <option value="N">未激活</option>
                  </select>
                </Box>
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

export default EditRoleTemplate
