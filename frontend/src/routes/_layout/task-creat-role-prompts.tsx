import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  GridItem,
  Heading,
  Input,
  Table,
  Text,
} from "@chakra-ui/react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type React from "react"
import { useState } from "react"
import { FiRefreshCcw, FiSearch, FiPlay, FiSquare, FiTrash2 } from "react-icons/fi"
import { z } from "zod"

import {
  RolesService,
  type TaskCreatRolePromptPublic,
  TaskCreatRolePromptsService,
} from "@/client"
import { TaskCreatRolePromptActionsMenu } from "@/components/Common/TaskCreatRolePromptActionsMenu"
import PendingTaskCreatRolePrompts from "@/components/Pending/PendingTaskCreatRolePrompts"
import AddTaskCreatRolePrompt from "@/components/TaskCreatRolePrompts/AddTaskCreatRolePrompt"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { toaster } from "@/components/ui/toaster"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination"

const taskCreatRolePromptsSearchSchema = z.object({
  page: z.number().catch(1),
  task_name: z.string().optional(),
  task_state: z.string().optional(),
  role_id: z.number().optional(),
})

const PER_PAGE = 5

function getTaskCreatRolePromptsQueryOptions({
  page,
  task_name,
  task_state,
  role_id,
}: {
  page: number
  task_name?: string
  task_state?: string
  role_id?: number
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }

  if (task_name) params.taskName = task_name
  if (task_state) params.taskState = task_state
  if (role_id) params.roleId = role_id

  return {
    queryFn: () => TaskCreatRolePromptsService.readTaskCreatRolePrompts(params),
    queryKey: [
      "task-creat-role-prompts",
      { page, task_name, task_state, role_id },
    ],
  }
}

export const Route = createFileRoute("/_layout/task-creat-role-prompts")({
  component: TaskCreatRolePrompts,
  validateSearch: taskCreatRolePromptsSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    task_name?: string
    task_state?: string
    role_id?: number
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [taskName, setTaskName] = useState("")
  const [taskState, setTaskState] = useState("")
  const [roleId, setRoleId] = useState("")

  // 获取角色列表用于下拉选择
  const { data: rolesData } = useQuery({
    queryKey: ["roles", "all"],
    queryFn: () => RolesService.readRoles({ skip: 0, limit: 100 }),
  })

  const handleSearch = () => {
    const filters: any = {}
    if (taskName.trim()) filters.task_name = taskName.trim()
    if (taskState.trim()) filters.task_state = taskState.trim()
    if (roleId.trim()) filters.role_id = Number.parseInt(roleId.trim())

    console.log("搜索条件:", filters)
    onSearch(filters)
  }

  const handleReset = () => {
    setTaskName("")
    setTaskState("")
    setRoleId("")
    onReset()
  }

  return (
    <Box bg="white" borderRadius="lg" border="1px solid" borderColor="gray.200" p={4} mb={4}>
      <Grid
        templateColumns={{
          base: "1fr",
          md: "1fr 1fr 1fr auto",
        }}
        gap={4}
        alignItems="end"
      >
        <GridItem>
          <Field label="任务名称">
            <Input
              placeholder="输入任务名称"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              size="sm"
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{
                borderColor: "teal.500",
                boxShadow: "0 0 0 1px teal.500",
              }}
            />
          </Field>
        </GridItem>

        <GridItem>
          <Field label="任务状态">
            <Box>
              <select
                value={taskState}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTaskState(e.target.value)
                }
                style={{
                  width: "100%",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #D1D5DB",
                  fontSize: "14px",
                  backgroundColor: "white",
                  cursor: "pointer",
                  height: "32px",
                }}
              >
                <option value="">全部状态</option>
                <option value="C">已完成</option>
                <option value="P">待启动</option>
                <option value="F">失败</option>
                <option value="W">等待中</option>
              </select>
            </Box>
          </Field>
        </GridItem>

        <GridItem>
          <Field label="所属角色">
            <Box>
              <select
                value={roleId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setRoleId(e.target.value)
                }
                style={{
                  width: "100%",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #D1D5DB",
                  fontSize: "14px",
                  backgroundColor: "white",
                  cursor: "pointer",
                  height: "32px",
                }}
              >
                <option value="">选择角色</option>
                {rolesData?.data.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} - {role.role_dir?.ip}
                  </option>
                ))}
              </select>
            </Box>
          </Field>
        </GridItem>

        <GridItem>
          <Flex gap={2}>
            <Button
              colorScheme="teal"
              onClick={handleSearch}
              size="sm"
              minW="60px"
            >
              <FiSearch style={{ marginRight: "4px" }} />
              搜索
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              size="sm"
              minW="60px"
            >
              重置
            </Button>
          </Flex>
        </GridItem>
      </Grid>
    </Box>
  )
}

function TaskCreatRolePromptsTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, task_name, task_state, role_id } = searchParams

  // 批量操作状态
  const [selectedTasks, setSelectedTasks] = useState<number[]>([])
  const [selectAll, setSelectAll] = useState(false)

  // 启动单个任务的API调用
  const startSingleTask = async (taskId: number) => {
    const response = await fetch(`/api/v1/task-creat-role-prompts/${taskId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token')}` || ''
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || '启动任务失败')
    }
    
    return response.json()
  }

  // 批量启动任务 (调用AI API生成内容)
  const batchStartMutation = useMutation({
    mutationFn: async (taskIds: number[]) => {
      const promises = taskIds.map(taskId => startSingleTask(taskId))
      return Promise.all(promises)
    },
    onSuccess: () => {
      toaster.create({
        title: "批量启动成功",
        description: `已启动 ${selectedTasks.length} 个任务`,
        status: "success"
      })
      setSelectedTasks([])
      setSelectAll(false)
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
    onError: (error) => {
      toaster.create({
        title: "批量启动失败",
        description: error.message || "操作失败，请重试",
        status: "error"
      })
    }
  })

  // 批量停止任务 (设置状态为 P - 待启动)
  const batchStopMutation = useMutation({
    mutationFn: async (taskIds: number[]) => {
      const promises = taskIds.map(taskId => 
        TaskCreatRolePromptsService.updateTaskCreatRolePrompt({
          taskPromptId: taskId,
          requestBody: { task_state: "P" }
        })
      )
      return Promise.all(promises)
    },
    onSuccess: () => {
      toaster.create({
        title: "批量停止成功",
        description: `已停止 ${selectedTasks.length} 个任务`,
        status: "success"
      })
      setSelectedTasks([])
      setSelectAll(false)
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
    onError: (error) => {
      toaster.create({
        title: "批量停止失败",
        description: error.message || "操作失败，请重试",
        status: "error"
      })
    }
  })

  // 批量删除任务
  const batchDeleteMutation = useMutation({
    mutationFn: async (taskIds: number[]) => {
      const promises = taskIds.map(taskId => 
        TaskCreatRolePromptsService.deleteTaskCreatRolePrompt({
          taskPromptId: taskId
        })
      )
      return Promise.all(promises)
    },
    onSuccess: () => {
      toaster.create({
        title: "批量删除成功",
        description: `已删除 ${selectedTasks.length} 个任务`,
        status: "success"
      })
      setSelectedTasks([])
      setSelectAll(false)
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
    onError: (error) => {
      toaster.create({
        title: "批量删除失败",
        description: error.message || "操作失败，请重试",
        status: "error"
      })
    }
  })

  // 同步到角色提示词
  const syncToRolePromptsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v1/sync/sync-batch-to-role-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || "同步失败")
      }
      return response.json()
    },
    onSuccess: (data) => {
      const successResults = data.results.filter((r: any) => r.status === "success")
      const skippedResults = data.results.filter((r: any) => r.status === "skipped")
      const errorResults = data.results.filter((r: any) => r.status === "error")

      let message = `同步完成！`
      if (successResults.length > 0) {
        message += ` 成功同步 ${successResults.length} 个批次`
      }
      if (skippedResults.length > 0) {
        message += ` 跳过 ${skippedResults.length} 个批次`
      }
      if (errorResults.length > 0) {
        message += ` 失败 ${errorResults.length} 个批次`
      }

      toaster.create({
        title: message,
        description: data.results.map((r: any) => 
          `批次${r.batch_number}: ${r.status === "success" ? "成功" : r.status === "skipped" ? r.reason : r.error}`
        ).join("\n"),
        status: errorResults.length > 0 ? "warning" : "success",
        duration: 6000,
      })
      
      // 刷新数据
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
    onError: (error: Error) => {
      toaster.create({
        title: "同步失败",
        description: error.message,
        status: "error",
      })
    },
  })

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getTaskCreatRolePromptsQueryOptions({
      page,
      task_name,
      task_state,
      role_id,
    }),
    placeholderData: (prevData) => prevData,
    staleTime: 1000 * 30, // 30秒后数据过期
    refetchOnWindowFocus: true, // 窗口聚焦时重新获取
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    task_name?: string
    task_state?: string
    role_id?: number
  }) => {
    console.log("执行搜索:", filters)
    navigate({
      search: () => ({ ...filters, page: 1 }),
    })
  }

  const handleReset = () => {
    console.log("执行重置")
    navigate({
      search: () => ({ page: 1 }),
    })
  }

  const taskPrompts = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  console.log("当前搜索参数:", { page, task_name, task_state, role_id })
  console.log("查询结果:", { taskPrompts: taskPrompts.length, count })

  // 任务状态映射
  const getTaskStateDisplay = (state: string | null | undefined) => {
    switch (state) {
      case "C":
        return { label: "已完成", color: "green" }
      case "S":
        return { label: "已同步", color: "teal" }
      case "P":
        return { label: "待启动", color: "orange" }
      case "F":
        return { label: "失败", color: "red" }
      case "W":
        return { label: "等待中", color: "yellow" }
      case "R":
        return { label: "运行中", color: "blue" }
      default:
        return { label: "未知", color: "gray" }
    }
  }

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingTaskCreatRolePrompts />
      </>
    )
  }

  const handleRefresh = () => {
    console.log("手动刷新任务列表")
    queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
  }

  const handleSyncToRolePrompts = () => {
    if (window.confirm("确定要同步已完成的任务到角色提示词吗？只有批次内所有任务都完成的才会被同步。")) {
      syncToRolePromptsMutation.mutate()
    }
  }

  // 批量操作处理函数
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      const allTaskIds = taskPrompts.map(task => task.id)
      setSelectedTasks(allTaskIds)
    } else {
      setSelectedTasks([])
    }
  }

  const handleSelectTask = (taskId: number, checked: boolean) => {
    if (checked) {
      setSelectedTasks(prev => [...prev, taskId])
    } else {
      setSelectedTasks(prev => prev.filter(id => id !== taskId))
      setSelectAll(false)
    }
  }

  const handleBatchStart = () => {
    if (selectedTasks.length === 0) {
      toaster.create({
        title: "请选择任务",
        description: "请先选择要启动的任务",
        status: "warning"
      })
      return
    }
    batchStartMutation.mutate(selectedTasks)
  }

  const handleBatchStop = () => {
    if (selectedTasks.length === 0) {
      toaster.create({
        title: "请选择任务",
        description: "请先选择要停止的任务",
        status: "warning"
      })
      return
    }
    batchStopMutation.mutate(selectedTasks)
  }

  const handleBatchDelete = () => {
    if (selectedTasks.length === 0) {
      toaster.create({
        title: "请选择任务",
        description: "请先选择要删除的任务",
        status: "warning"
      })
      return
    }
    
    // 添加确认对话框
    if (window.confirm(`确定要删除选中的 ${selectedTasks.length} 个任务吗？此操作不可撤销。`)) {
      batchDeleteMutation.mutate(selectedTasks)
    }
  }

  return (
    <>
      <SearchForm onSearch={handleSearch} onReset={handleReset} />

      <Flex justifyContent="space-between" alignItems="center" mb={4}>
        {/* 批量操作按钮组 */}
        <Flex gap={2}>
          {selectedTasks.length > 0 && (
            <>
              <Button
                colorScheme="green"
                size="sm"
                onClick={handleBatchStart}
                disabled={selectedTasks.length === 0}
                loading={batchStartMutation.isPending}
              >
                <FiPlay style={{ marginRight: "4px" }} />
                批量启动 ({selectedTasks.length})
              </Button>
              <Button
                colorScheme="orange"
                size="sm"
                onClick={handleBatchStop}
                disabled={selectedTasks.length === 0}
                loading={batchStopMutation.isPending}
              >
                <FiSquare style={{ marginRight: "4px" }} />
                批量停止 ({selectedTasks.length})
              </Button>
              <Button
                colorScheme="red"
                size="sm"
                onClick={handleBatchDelete}
                disabled={selectedTasks.length === 0}
                loading={batchDeleteMutation.isPending}
              >
                <FiTrash2 style={{ marginRight: "4px" }} />
                批量删除 ({selectedTasks.length})
              </Button>
            </>
          )}
        </Flex>

        {/* 右侧按钮组 */}
        <Flex gap={3}>
          <AddTaskCreatRolePrompt />
          <Button
            colorScheme="blue"
            onClick={handleSyncToRolePrompts}
            size="sm"
            minW="120px"
            height="32px"
            border="2px solid"
            borderColor="red.500"
          >
            同步到角色提示词
          </Button>
          <Button
            colorScheme="teal"
            onClick={handleRefresh}
            size="sm"
            minW="80px"
            height="32px"
          >
            <FiRefreshCcw style={{ marginRight: "4px" }} />
            刷新数据
          </Button>
        </Flex>
      </Flex>

      <Table.Root size={{ base: "sm", md: "md" }} variant="outline">
        <Table.Header>
          <Table.Row bg="gray.50">
            <Table.ColumnHeader w="12" fontWeight="bold">
              <Checkbox
                size="sm"
                checked={selectAll}
                onCheckedChange={({ checked }) => handleSelectAll(!!checked)}
              />
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              ID
            </Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">
              任务名称
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              任务状态
            </Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">
              所属角色
            </Table.ColumnHeader>
            <Table.ColumnHeader w="lg" fontWeight="bold">
              任务命令
            </Table.ColumnHeader>
            <Table.ColumnHeader w="lg" fontWeight="bold">
              角色条目提示词
            </Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">
              创建时间
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              操作
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {taskPrompts?.map((task) => {
            const stateDisplay = getTaskStateDisplay(task.task_state)
            const isSelected = selectedTasks.includes(task.id)
            return (
              <Table.Row
                key={task.id}
                opacity={isPlaceholderData ? 0.5 : 1}
                _hover={{ bg: "gray.50" }}
                bg={isSelected ? "blue.50" : "transparent"}
              >
                <Table.Cell>
                  <Checkbox
                    size="sm"
                    checked={isSelected}
                    onCheckedChange={({ checked }) => handleSelectTask(task.id, !!checked)}
                  />
                </Table.Cell>
                <Table.Cell>
                  <Badge colorScheme="teal">{task.id}</Badge>
                </Table.Cell>
                <Table.Cell fontWeight="medium">
                  {task.task_name || "未命名任务"}
                </Table.Cell>
                <Table.Cell>
                  <Badge colorScheme={stateDisplay.color} variant="solid">
                    {stateDisplay.label}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {task.role?.name || "未知角色"}
                  {task.role?.role_dir?.ip && (
                    <Text fontSize="xs" color="gray.500">
                      {task.role.role_dir.ip}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Box
                    maxW="200px"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    title={JSON.stringify(task.task_cmd, null, 2)}
                  >
                    {typeof task.task_cmd === "object"
                      ? `${JSON.stringify(task.task_cmd).substring(0, 50)}...`
                      : String(task.task_cmd)}
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  <Box
                    maxW="200px"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    title={JSON.stringify(task.role_item_prompt, null, 2)}
                  >
                    {typeof task.role_item_prompt === "object"
                      ? `${JSON.stringify(task.role_item_prompt).substring(0, 50)}...`
                      : String(task.role_item_prompt)}
                  </Box>
                </Table.Cell>
                <Table.Cell>
                  {task.created_at
                    ? new Date(task.created_at).toLocaleString("zh-CN")
                    : "未知"}
                </Table.Cell>
                <Table.Cell>
                  <TaskCreatRolePromptActionsMenu task={task} />
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>

      {count > 0 && (
        <Flex justifyContent="flex-end" mt={4}>
          <PaginationRoot
            count={count}
            pageSize={PER_PAGE}
            onPageChange={({ page }) => setPage(page)}
          >
            <Flex>
              <PaginationPrevTrigger />
              <PaginationItems />
              <PaginationNextTrigger />
            </Flex>
          </PaginationRoot>
        </Flex>
      )}

      {count === 0 && (
        <Box
          textAlign="center"
          py={8}
          color="gray.500"
          bg="white"
          borderRadius="md"
          shadow="sm"
        >
          {task_name || task_state || role_id
            ? "未找到匹配的任务"
            : "暂无任务数据"}
        </Box>
      )}
    </>
  )
}

function TaskCreatRolePrompts() {
  return (
    <Container maxW="full" p={6}>
      <Box pt={12} mb={6} />
      <TaskCreatRolePromptsTable />
    </Container>
  )
}
