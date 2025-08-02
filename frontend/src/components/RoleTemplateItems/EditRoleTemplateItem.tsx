import React, { useState } from "react"
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Button,
  DialogActionTrigger,
  DialogRoot,
  DialogTrigger,
  Input,
  Text,
  VStack,
  Box,
  Textarea,
} from "@chakra-ui/react"
import { FaEdit } from "react-icons/fa"

import { type RoleTemplateItemPublic, type RoleTemplateItemUpdate, RoleTemplateItemsService, RoleTemplatesService } from "@/client"
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

interface EditRoleTemplateItemProps {
  item: RoleTemplateItemPublic
}

const EditRoleTemplateItem = ({ item }: EditRoleTemplateItemProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  
  // 获取角色模板列表
  const { data: roleTemplatesData } = useQuery({
    queryKey: ["role-templates", "all"],
    queryFn: () => RoleTemplatesService.readRoleTemplates({ skip: 0, limit: 100 }),
  })
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RoleTemplateItemUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      role_tmp_id: item.role_tmp_id,
      item_name: item.item_name || "",
      item_prompt_desc: item.item_prompt_desc || "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleTemplateItemUpdate) =>
      RoleTemplateItemsService.updateRoleTemplateItem({ 
        roleTemplateItemId: item.id, 
        requestBody: data 
      }),
    onSuccess: () => {
      showSuccessToast("模板条目更新成功")
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

  const onSubmit: SubmitHandler<RoleTemplateItemUpdate> = async (data) => {
    // 确保role_tmp_id是数字类型
    const submitData = {
      ...data,
      role_tmp_id: data.role_tmp_id ? Number(data.role_tmp_id) : undefined,
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
            <DialogTitle>编辑模板条目</DialogTitle>
          </DialogHeader>
          
          <DialogBody>
            <VStack gap={4}>
              <Field
                label="所属角色模板"
                invalid={!!errors.role_tmp_id}
                errorText={errors.role_tmp_id?.message}
              >
                <Box>
                  <select
                    {...register("role_tmp_id")}
                    style={{ 
                      padding: "8px 12px", 
                      borderRadius: "6px", 
                      border: "1px solid #e2e8f0",
                      width: "100%",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer"
                    }}
                  >
                    {roleTemplatesData?.data.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.template_name || `ID:${template.id}`} - {template.role?.name}
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

export default EditRoleTemplateItem 