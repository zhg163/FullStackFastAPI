import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Input,
  Text,
  VStack,
  Select,
} from "@chakra-ui/react"
import { useState } from "react"
import { FaPlus } from "react-icons/fa"

import { type RoleCreate, RolesService, RoleDirsService } from "@/client"
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

const AddRole = () => {
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
    formState: { errors, isValid, isSubmitting },
  } = useForm<RoleCreate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      name: "",
      ip_id: 0,
      create_from: "",
      has_prompts: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleCreate) =>
      RolesService.createRole({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("角色创建成功")
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

  const onSubmit: SubmitHandler<RoleCreate> = (data) => {
    // 确保ip_id是数字类型
    const submitData = {
      ...data,
      ip_id: Number(data.ip_id),
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
        <Button
          variant="solid"
          colorScheme="teal"
          size="md"
          mb={4}
        >
          <FaPlus fontSize="16px" />
          添加角色
        </Button>
      </DialogTrigger>
      
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>添加角色</DialogTitle>
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
                  placeholder="例如：纳西妲、雷神、甘雨"
                  type="text"
                />
              </Field>
              
              <Field
                label="IP分类"
                invalid={!!errors.ip_id}
                errorText={errors.ip_id?.message}
                required
              >
                <Select
                  {...register("ip_id", {
                    required: "请选择IP分类",
                    validate: (value) => Number(value) > 0 || "请选择有效的IP分类"
                  })}
                  placeholder="请选择IP分类"
                >
                  {roleDirsData?.data.map((roleDir) => (
                    <option key={roleDir.id} value={roleDir.id}>
                      {roleDir.ip}
                    </option>
                  ))}
                </Select>
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
                  placeholder="请输入创建端（可选）"
                  type="text"
                />
              </Field>
              
              <Field
                label="是否有提示词"
                invalid={!!errors.has_prompts}
                errorText={errors.has_prompts?.message}
              >
                <Select
                  {...register("has_prompts")}
                  placeholder="请选择"
                >
                  <option value="Y">是</option>
                  <option value="N">否</option>
                </Select>
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

export default AddRole 