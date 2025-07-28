import { Badge, Container, Flex, Heading, Table, Box, Input, Button, Stack, Grid, GridItem, Select } from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"
import { FiSearch, FiRefreshCcw } from "react-icons/fi"

import { type RolePublic, RolesService, RoleDirsService } from "@/client"
import AddRole from "@/components/Roles/AddRole"
import { RoleActionsMenu } from "@/components/Common/RoleActionsMenu"
import PendingRoles from "@/components/Pending/PendingRoles"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { Field } from "@/components/ui/field"

const rolesSearchSchema = z.object({
  page: z.number().catch(1),
  name: z.string().optional(),
  ip_id: z.number().optional(),
  create_from: z.string().optional(),
  has_prompts: z.string().optional(),
})

const PER_PAGE = 5

function getRolesQueryOptions({ 
  page, 
  name, 
  ip_id,
  create_from,
  has_prompts
}: { 
  page: number
  name?: string
  ip_id?: number
  create_from?: string
  has_prompts?: string
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }
  
  if (name) params.name = name
  if (ip_id) params.ipId = ip_id
  if (create_from) params.createFrom = create_from
  if (has_prompts) params.hasPrompts = has_prompts

  return {
    queryFn: () => RolesService.readRoles(params),
    queryKey: ["roles", { page, name, ip_id, create_from, has_prompts }],
  }
}

export const Route = createFileRoute("/_layout/roles")({
  component: Roles,
  validateSearch: rolesSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    name?: string
    ip_id?: number
    create_from?: string
    has_prompts?: string
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [name, setName] = useState("")
  const [ipId, setIpId] = useState("")
  const [createFrom, setCreateFrom] = useState("")
  const [hasPrompts, setHasPrompts] = useState("")

  // 获取角色分类列表用于下拉选择
  const { data: roleDirsData } = useQuery({
    queryKey: ["roleDirs", "all"],
    queryFn: () => RoleDirsService.readRoleDirs({ skip: 0, limit: 100 }),
  })

  const handleSearch = () => {
    const filters: any = {}
    if (name.trim()) filters.name = name.trim()
    if (ipId.trim()) filters.ip_id = parseInt(ipId.trim())
    if (createFrom.trim()) filters.create_from = createFrom.trim()
    if (hasPrompts) filters.has_prompts = hasPrompts
    
    console.log("搜索条件:", filters)
    onSearch(filters)
  }

  const handleReset = () => {
    setName("")
    setIpId("")
    setCreateFrom("")
    setHasPrompts("")
    onReset()
  }

  return (
    <Box p={6} bg="gray.50" borderRadius="lg" mb={6} shadow="sm">
      <Heading size="md" mb={4} color="gray.700">搜索条件</Heading>
      
      <Grid 
        templateColumns={{ 
          base: "1fr", 
          md: "repeat(2, 1fr)", 
          lg: "repeat(4, 1fr)" 
        }} 
        gap={4} 
        mb={4}
      >
        <GridItem>
          <Field label="角色名称">
            <Input
              placeholder="输入角色名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
            />
          </Field>
        </GridItem>
        
        <GridItem>
          <Field label="IP分类">
            <Select
              placeholder="选择IP分类"
              value={ipId}
              onChange={(e) => setIpId(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
            >
              {roleDirsData?.data.map((roleDir) => (
                <option key={roleDir.id} value={roleDir.id}>
                  {roleDir.ip}
                </option>
              ))}
            </Select>
          </Field>
        </GridItem>
        
        <GridItem>
          <Field label="创建端">
            <Input
              placeholder="输入创建端"
              value={createFrom}
              onChange={(e) => setCreateFrom(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
            />
          </Field>
        </GridItem>
        
        <GridItem>
          <Field label="是否有提示词">
            <Select
              placeholder="选择状态"
              value={hasPrompts}
              onChange={(e) => setHasPrompts(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
            >
              <option value="Y">是</option>
              <option value="N">否</option>
            </Select>
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
        <Button
          variant="outline"
          onClick={handleReset}
          size="md"
          minW="100px"
        >
          <FiRefreshCcw style={{ marginRight: "6px" }} />
          重置
        </Button>
      </Flex>
    </Box>
  )
}

function RolesTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, name, ip_id, create_from, has_prompts } = searchParams

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getRolesQueryOptions({ page, name, ip_id, create_from, has_prompts }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    name?: string
    ip_id?: number
    create_from?: string
    has_prompts?: string
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

  const roles = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  console.log("当前搜索参数:", { page, name, ip_id, create_from, has_prompts })
  console.log("查询结果:", { roles: roles.length, count })

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingRoles />
      </>
    )
  }

  return (
    <>
      <SearchForm onSearch={handleSearch} onReset={handleReset} />
      
      <Table.Root size={{ base: "sm", md: "md" }} variant="outline">
        <Table.Header>
          <Table.Row bg="gray.50">
            <Table.ColumnHeader w="sm" fontWeight="bold">ID</Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">角色名称</Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">IP分类</Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">创建端</Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">有提示词</Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">创建时间</Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">操作</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {roles?.map((role) => (
            <Table.Row key={role.id} opacity={isPlaceholderData ? 0.5 : 1} _hover={{ bg: "gray.50" }}>
              <Table.Cell>
                <Badge colorScheme="blue">{role.id}</Badge>
              </Table.Cell>
              <Table.Cell fontWeight="medium">
                {role.name}
              </Table.Cell>
              <Table.Cell>
                {role.role_dir?.ip || `ID:${role.ip_id}`}
              </Table.Cell>
              <Table.Cell color={!role.create_from ? "gray.500" : "inherit"}>
                {role.create_from || "未指定"}
              </Table.Cell>
              <Table.Cell>
                <Badge 
                  colorScheme={role.has_prompts === "Y" ? "green" : role.has_prompts === "N" ? "red" : "gray"}
                  variant="subtle"
                >
                  {role.has_prompts === "Y" ? "是" : role.has_prompts === "N" ? "否" : "未知"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                {role.created_at 
                  ? new Date(role.created_at).toLocaleString('zh-CN')
                  : "未知"
                }
              </Table.Cell>
              <Table.Cell>
                <RoleActionsMenu role={role} />
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
        <Box textAlign="center" py={8} color="gray.500" bg="white" borderRadius="md" shadow="sm">
          {name || ip_id || create_from || has_prompts ? "未找到匹配的角色" : "暂无角色数据"}
        </Box>
      )}
    </>
  )
}

function Roles() {
  return (
    <Container maxW="full" p={6}>
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        角色管理
      </Heading>

      <AddRole />
      <RolesTable />
    </Container>
  )
} 