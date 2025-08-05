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
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type React from "react"
import { useState } from "react"
import { FiRefreshCcw, FiSearch } from "react-icons/fi"
import { z } from "zod"

import {
  RolesService,
  type TaskCreatRolePromptPublic,
  TaskCreatRolePromptsService,
} from "@/client"
import { TaskCreatRolePromptActionsMenu } from "@/components/Common/TaskCreatRolePromptActionsMenu"
import PendingTaskCreatRolePrompts from "@/components/Pending/PendingTaskCreatRolePrompts"
import AddTaskCreatRolePrompt from "@/components/TaskCreatRolePrompts/AddTaskCreatRolePrompt"
import { Field } from "@/components/ui/field"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"

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
    <Box p={6} bg="gray.50" borderRadius="lg" mb={6} shadow="sm">
      <Heading size="md" mb={4} color="gray.700">
        搜索条件
      </Heading>

      <Grid
        templateColumns={{
          base: "1fr",
          md: "repeat(3, 1fr)",
        }}
        gap={4}
        mb={4}
      >
        <GridItem>
          <Field label="任务名称">
            <Input
              placeholder="输入任务名称"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px blue.500",
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
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #E2E8F0",
                  fontSize: "14px",
                  backgroundColor: "white",
                  cursor: "pointer",
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
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #E2E8F0",
                  fontSize: "14px",
                  backgroundColor: "white",
                  cursor: "pointer",
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
      </Grid>

      <Flex gap={3} justify={{ base: "center", md: "flex-start" }}>
        <Button
          colorScheme="blue"
          onClick={handleSearch}
          size="md"
          minW="100px"
        >
          <FiSearch style={{ marginRight: "6px" }} />
          搜索
        </Button>
        <Button variant="outline" onClick={handleReset} size="md" minW="100px">
          <FiRefreshCcw style={{ marginRight: "6px" }} />
          重置
        </Button>
      </Flex>
    </Box>
  )
}

function TaskCreatRolePromptsTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, task_name, task_state, role_id } = searchParams

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

  return (
    <>
      <Flex justifyContent="space-between" alignItems="center" mb={4}>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <Button
          colorScheme="teal"
          onClick={handleRefresh}
          size="md"
          minW="100px"
        >
          <FiRefreshCcw style={{ marginRight: "6px" }} />
          刷新数据
        </Button>
      </Flex>

      <Table.Root size={{ base: "sm", md: "md" }} variant="outline">
        <Table.Header>
          <Table.Row bg="gray.50">
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
            return (
              <Table.Row
                key={task.id}
                opacity={isPlaceholderData ? 0.5 : 1}
                _hover={{ bg: "gray.50" }}
              >
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
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        任务管理
      </Heading>

      <AddTaskCreatRolePrompt />
      <TaskCreatRolePromptsTable />
    </Container>
  )
}
