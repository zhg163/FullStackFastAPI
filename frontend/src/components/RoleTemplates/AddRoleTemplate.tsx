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
  VStack,
} from "@chakra-ui/react"
import { FaPlus } from "react-icons/fa"

import {
  type RoleTemplateCreate,
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

const AddRoleTemplate = () => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()



  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting },
  } = useForm<RoleTemplateCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      template_name: "",
      is_active: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleTemplateCreate) =>
      RoleTemplatesService.createRoleTemplate({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("角色模板创建成功")
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

  const onSubmit: SubmitHandler<RoleTemplateCreate> = (data) => {
    mutation.mutate(data)
  }

  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
      size={{ base: "sm", md: "md" }}
      placement="center"
    >
      <DialogTrigger asChild>
        <Button variant="solid" colorScheme="teal" size="md" mb={4}>
          <FaPlus fontSize="16px" />
          添加角色模板
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>添加角色模板</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
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
                  placeholder="例如：基础战斗模板、对话模板"
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
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #E2E8F0",
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
              colorScheme="teal"
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

export default AddRoleTemplate
