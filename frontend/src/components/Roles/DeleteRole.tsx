import { Button, DialogTitle, Text } from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { FiTrash2 } from "react-icons/fi"

import { RolesService } from "@/client"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTrigger,
} from "@/components/ui/dialog"
import useCustomToast from "@/hooks/useCustomToast"

const DeleteRole = ({ id }: { id: string }) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm()

  const deleteRole = async (id: string) => {
    await RolesService.deleteRole({ roleId: parseInt(id) })
  }

  const mutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      showSuccessToast("角色删除成功")
      setIsOpen(false)
    },
    onError: () => {
      showErrorToast("删除角色时发生错误")
    },
    onSettled: () => {
      queryClient.invalidateQueries()
    },
  })

  const onSubmit = async () => {
    mutation.mutate(id)
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "md" }}
      placement="center"
      role="alertdialog"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" colorScheme="red">
          <FiTrash2 fontSize="16px" />
          删除
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>删除角色</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>
              您确定要删除这个角色吗？此操作<strong>不可撤销</strong>。
            </Text>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button
                variant="outline"
                disabled={isSubmitting}
              >
                取消
              </Button>
            </DialogActionTrigger>
            <Button
              variant="solid"
              colorScheme="red"
              type="submit"
              loading={isSubmitting}
            >
              删除
            </Button>
          </DialogFooter>
          <DialogCloseTrigger />
        </form>
      </DialogContent>
    </DialogRoot>
  )
}

export default DeleteRole 