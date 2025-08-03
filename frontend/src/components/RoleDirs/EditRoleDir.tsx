import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  Button,
  DialogActionTrigger,
  DialogRoot,
  DialogTrigger,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useState } from "react"
import { FaEdit } from "react-icons/fa"

import {
  type RoleDirPublic,
  type RoleDirUpdate,
  RoleDirsService,
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

interface EditRoleDirProps {
  roleDir: RoleDirPublic
}

const EditRoleDir = ({ roleDir }: EditRoleDirProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RoleDirUpdate>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      ip: roleDir.ip,
      ip_desc: roleDir.ip_desc || "",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: RoleDirUpdate) =>
      RoleDirsService.updateRoleDir({
        roleDirId: roleDir.id,
        requestBody: data,
      }),
    onSuccess: () => {
      showSuccessToast("角色分类更新成功")
      reset()
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["roleDirs"] })
    },
  })

  const onSubmit: SubmitHandler<RoleDirUpdate> = async (data) => {
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
        <Button variant="ghost" size="sm" colorScheme="blue">
          <FaEdit fontSize="16px" />
          编辑
        </Button>
      </DialogTrigger>

      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>编辑角色分类</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4}>
              <Field
                label="IP分类名称"
                invalid={!!errors.ip}
                errorText={errors.ip?.message}
                required
              >
                <Input
                  id="ip"
                  {...register("ip", {
                    required: "IP分类名称是必需的",
                    minLength: {
                      value: 1,
                      message: "IP分类名称至少需要1个字符",
                    },
                    maxLength: {
                      value: 255,
                      message: "IP分类名称不能超过255个字符",
                    },
                  })}
                  type="text"
                />
              </Field>

              <Field
                label="IP描述"
                invalid={!!errors.ip_desc}
                errorText={errors.ip_desc?.message}
              >
                <Input
                  id="ip_desc"
                  {...register("ip_desc", {
                    maxLength: {
                      value: 255,
                      message: "IP描述不能超过255个字符",
                    },
                  })}
                  type="text"
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

export default EditRoleDir
