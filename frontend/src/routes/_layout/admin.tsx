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
  Stack,
  Table,
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { FiRefreshCcw, FiSearch } from "react-icons/fi"
import { z } from "zod"

import { type UserPublic, UsersService } from "@/client"
import AddUser from "@/components/Admin/AddUser"
import { UserActionsMenu } from "@/components/Common/UserActionsMenu"
import PendingUsers from "@/components/Pending/PendingUsers"
import { Field } from "@/components/ui/field"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"

const usersSearchSchema = z.object({
  page: z.number().catch(1),
  full_name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
})

const PER_PAGE = 5

function getUsersQueryOptions({
  page,
  full_name,
  email,
  role,
  status,
}: {
  page: number
  full_name?: string
  email?: string
  role?: string
  status?: string
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }

  if (full_name) params.fullName = full_name
  if (email) params.email = email
  if (role) params.role = role
  if (status) params.status = status

  return {
    queryFn: () => UsersService.readUsers(params),
    queryKey: ["users", { page, full_name, email, role, status }],
  }
}

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: usersSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    full_name?: string
    email?: string
    role?: string
    status?: string
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("")
  const [status, setStatus] = useState("")

  const handleSearch = () => {
    const filters: any = {}
    if (fullName.trim()) filters.full_name = fullName.trim()
    if (email.trim()) filters.email = email.trim()
    if (role) filters.role = role
    if (status) filters.status = status

    console.log("搜索条件:", filters) // 添加调试日志
    onSearch(filters)
  }

  const handleReset = () => {
    setFullName("")
    setEmail("")
    setRole("")
    setStatus("")
    onReset()
  }

  return (
    <Box p={6} bg="gray.50" borderRadius="lg" mb={6} shadow="sm">
      <Heading size="md" mb={4} color="gray.700">
        搜索条件
      </Heading>

      {/* 使用Grid布局实现响应式横向排列 */}
      <Grid
        templateColumns={{
          base: "1fr",
          md: "repeat(2, 1fr)",
          lg: "repeat(4, 1fr)",
        }}
        gap={4}
        mb={4}
      >
        <GridItem>
          <Field label="全名">
            <Input
              placeholder="输入全名"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
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
          <Field label="邮箱">
            <Input
              placeholder="输入邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          <Field label="角色">
            <Box>
              <select
                value={role}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setRole(e.target.value)
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
                <option value="superuser">超级管理员</option>
                <option value="user">普通用户</option>
              </select>
            </Box>
          </Field>
        </GridItem>

        <GridItem>
          <Field label="状态">
            <Box>
              <select
                value={status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setStatus(e.target.value)
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
                <option value="">选择状态</option>
                <option value="active">活跃</option>
                <option value="inactive">未激活</option>
              </select>
            </Box>
          </Field>
        </GridItem>
      </Grid>

      {/* 按钮区域 */}
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

function UsersTable() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, full_name, email, role, status } = searchParams

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getUsersQueryOptions({ page, full_name, email, role, status }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    full_name?: string
    email?: string
    role?: string
    status?: string
  }) => {
    console.log("执行搜索:", filters) // 添加调试日志
    navigate({
      search: () => ({ ...filters, page: 1 }),
    })
  }

  const handleReset = () => {
    console.log("执行重置") // 添加调试日志
    navigate({
      search: () => ({ page: 1 }),
    })
  }

  const users = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  // 添加当前搜索条件的显示
  console.log("当前搜索参数:", { page, full_name, email, role, status })
  console.log("查询结果:", { users: users.length, count })

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingUsers />
      </>
    )
  }

  return (
    <>
      <SearchForm onSearch={handleSearch} onReset={handleReset} />

      <Table.Root size={{ base: "sm", md: "md" }} variant="outline">
        <Table.Header>
          <Table.Row bg="gray.50">
            <Table.ColumnHeader w="sm" fontWeight="bold">
              Full name
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              Email
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              Role
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              Status
            </Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">
              Actions
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {users?.map((user) => (
            <Table.Row
              key={user.id}
              opacity={isPlaceholderData ? 0.5 : 1}
              _hover={{ bg: "gray.50" }}
            >
              <Table.Cell color={!user.full_name ? "gray" : "inherit"}>
                {user.full_name || "N/A"}
                {currentUser?.id === user.id && (
                  <Badge ml="1" colorScheme="teal">
                    You
                  </Badge>
                )}
              </Table.Cell>
              <Table.Cell truncate maxW="sm">
                {user.email}
              </Table.Cell>
              <Table.Cell>
                <Badge colorScheme={user.is_superuser ? "purple" : "green"}>
                  {user.is_superuser ? "Superuser" : "User"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge colorScheme={user.is_active ? "green" : "red"}>
                  {user.is_active ? "Active" : "Inactive"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <UserActionsMenu
                  user={user}
                  disabled={currentUser?.id === user.id}
                />
              </Table.Cell>
            </Table.Row>
          ))}
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
          {full_name || email || role || status
            ? "未找到匹配的用户"
            : "暂无用户数据"}
        </Box>
      )}
    </>
  )
}

function Admin() {
  return (
    <Container maxW="full" p={6}>
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        Users Management
      </Heading>

      <AddUser />
      <UsersTable />
    </Container>
  )
}
