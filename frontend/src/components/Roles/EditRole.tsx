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
} from "@chakra-ui/react"
import { FaEdit } from "react-icons/fa"

import { type RolePublic, type RoleUpdate, RolesService, RoleDirsService } from "@/client"
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

interface EditRoleProps {
  role: RolePublic
}

const EditRole = ({ role }: EditRoleProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  
  // 获取角色分类列表
  const { data: roleDirsData } = useQuery({
    queryKey: ["roleDirs", "all"],
    queryFn: () => RoleDirsService.readRoleDirs({ skip: 0, limit: 100 }),
  })
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RoleUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      name: role.name,
      ip_id: role.ip_id,
      create_from: role.create_from || "",
      has_prompts: role.has_prompts || "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleUpdate) =>
      RolesService.updateRole({ 
        roleId: role.id, 
        requestBody: data 
      }),
    onSuccess: () => {
      showSuccessToast("角色更新成功")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] })
    },
  })

  const onSubmit: SubmitHandler<RoleUpdate> = async (data) => {
    // 确保ip_id是数字类型
    const submitData = {
      ...data,
      ip_id: data.ip_id ? Number(data.ip_id) : undefined,
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
            <DialogTitle>编辑角色</DialogTitle>
          </DialogHeader>
          
          <DialogBody>
            <VStack gap={4}>
              <Field
                label="角色名称"
                invalid={!!errors.name}
                errorText={errors.name?.message}
                required
              >
                <Input
                  id="name"
                  {...register("name", {
                    required: "角色名称是必需的",
                    minLength: {
                      value: 1,
                      message: "角色名称至少需要1个字符",
                    },
                    maxLength: {
                      value: 60,
                      message: "角色名称不能超过60个字符",
                    },
                  })}
                  type="text"
                />
              </Field>
              
              <Field
                label="IP分类"
                invalid={!!errors.ip_id}
                errorText={errors.ip_id?.message}
              >
                <Box>
                  <select
                    {...register("ip_id")}
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
                    {roleDirsData?.data.map((roleDir) => (
                      <option key={roleDir.id} value={roleDir.id}>
                        {roleDir.ip}
                      </option>
                    ))}
                  </select>
                </Box>
              </Field>
              
              <Field
                label="创建端"
                invalid={!!errors.create_from}
                errorText={errors.create_from?.message}
              >
                <Input
                  id="create_from"
                  {...register("create_from", {
                    maxLength: {
                      value: 255,
                      message: "创建端不能超过255个字符",
                    },
                  })}
                  type="text"
                />
              </Field>
              
              <Field
                label="是否有提示词"
                invalid={!!errors.has_prompts}
                errorText={errors.has_prompts?.message}
              >
                <Box>
                  <select
                    {...register("has_prompts")}
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
                    <option value="">请选择</option>
                    <option value="Y">是</option>
                    <option value="N">否</option>
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

export default EditRole 