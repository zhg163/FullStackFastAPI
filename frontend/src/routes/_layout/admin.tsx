import { Badge, Container, Flex, Heading, Table, Box, Input, Button, Stack } from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"
import { FiSearch, FiRefreshCcw } from "react-icons/fi"

import { type UserPublic, UsersService } from "@/client"
import AddUser from "@/components/Admin/AddUser"
import { UserActionsMenu } from "@/components/Common/UserActionsMenu"
import PendingUsers from "@/components/Pending/PendingUsers"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { Field } from "@/components/ui/field"

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
  status 
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
  
  if (full_name) params.full_name = full_name
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
    <Box p={4} bg="gray.50" borderRadius="md" mb={4}>
      <Heading size="md" mb={4}>搜索条件</Heading>
      <Flex gap={4} wrap="wrap" align="end">
        <Field label="全名">
          <Input
            placeholder="输入全名"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            w="200px"
          />
        </Field>
        
        <Field label="邮箱">
          <Input
            placeholder="输入邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            w="200px"
          />
        </Field>
        
        <Field label="角色">
          <Box>
            <select
              value={role}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)}
              style={{
                width: "150px",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #E2E8F0",
                fontSize: "14px"
              }}
            >
              <option value="">选择角色</option>
              <option value="superuser">超级管理员</option>
              <option value="user">普通用户</option>
            </select>
          </Box>
        </Field>
        
        <Field label="状态">
          <Box>
            <select
              value={status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value)}
              style={{
                width: "150px",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #E2E8F0",
                fontSize: "14px"
              }}
            >
              <option value="">选择状态</option>
              <option value="active">活跃</option>
              <option value="inactive">未激活</option>
            </select>
          </Box>
        </Field>
        
        <Stack direction="row" gap={2}>
          <Button
            colorScheme="blue"
            onClick={handleSearch}
          >
            <FiSearch style={{ marginRight: "4px" }} />
            搜索
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
          >
            <FiRefreshCcw style={{ marginRight: "4px" }} />
            重置
          </Button>
        </Stack>
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
    navigate({
      search: () => ({ ...filters, page: 1 }),
    })
  }

  const handleReset = () => {
    navigate({
      search: () => ({ page: 1 }),
    })
  }

  const users = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

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
      
      <Table.Root size={{ base: "sm", md: "md" }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="sm">Full name</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Email</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Role</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Status</Table.ColumnHeader>
            <Table.ColumnHeader w="sm">Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {users?.map((user) => (
            <Table.Row key={user.id} opacity={isPlaceholderData ? 0.5 : 1}>
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
                {user.is_superuser ? "Superuser" : "User"}
              </Table.Cell>
              <Table.Cell>{user.is_active ? "Active" : "Inactive"}</Table.Cell>
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
        <Box textAlign="center" py={8} color="gray.500">
          {full_name || email || role || status ? "未找到匹配的用户" : "暂无用户数据"}
        </Box>
      )}
    </>
  )
}

function Admin() {
  return (
    <Container maxW="full">
      <Heading size="lg" pt={12}>
        Users Management
      </Heading>

      <AddUser />
      <UsersTable />
    </Container>
  )
}
