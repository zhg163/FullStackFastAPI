import React, { useState } from "react"
import { Badge, Container, Flex, Heading, Table, Box, Input, Button, Grid, GridItem, Text } from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { FiSearch, FiRefreshCcw } from "react-icons/fi"

import { type RolePromptPublic, RolePromptsService, RolesService } from "@/client"
import AddRolePrompt from "@/components/RolePrompts/AddRolePrompt"
import { RolePromptActionsMenu } from "@/components/Common/RolePromptActionsMenu"
import PendingRolePrompts from "@/components/Pending/PendingRolePrompts"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { Field } from "@/components/ui/field"

const rolePromptsSearchSchema = z.object({
  page: z.number().catch(1),
  role_id: z.number().optional(),
  version: z.number().optional(),
  is_active: z.string().optional(),
})

const PER_PAGE = 5

function getRolePromptsQueryOptions({ 
  page, 
  role_id, 
  version,
  is_active,
}: { 
  page: number
  role_id?: number
  version?: number
  is_active?: string
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }
  
  if (role_id) params.roleId = role_id
  if (version) params.version = version
  if (is_active) params.isActive = is_active

  return {
    queryFn: () => RolePromptsService.readRolePrompts(params),
    queryKey: ["role-prompts", { page, role_id, version, is_active }],
  }
}

export const Route = createFileRoute("/_layout/role-prompts")({
  component: RolePrompts,
  validateSearch: rolePromptsSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    role_id?: number
    version?: number
    is_active?: string
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [roleId, setRoleId] = useState("")
  const [version, setVersion] = useState("")
  const [isActive, setIsActive] = useState("")

  // 获取角色列表用于下拉选择
  const { data: rolesData } = useQuery({
    queryKey: ["roles", "all"],
    queryFn: () => RolesService.readRoles({ skip: 0, limit: 100 }),
  })

  const handleSearch = () => {
    const filters: any = {}
    if (roleId.trim()) filters.role_id = parseInt(roleId.trim())
    if (version.trim()) filters.version = parseInt(version.trim())
    if (isActive.trim()) filters.is_active = isActive.trim()
    
    console.log("搜索条件:", filters)
    onSearch(filters)
  }

  const handleReset = () => {
    setRoleId("")
    setVersion("")
    setIsActive("")
    onReset()
  }

  return (
    <Box p={6} bg="gray.50" borderRadius="lg" mb={6} shadow="sm">
      <Heading size="md" mb={4} color="gray.700">搜索条件</Heading>
      
      <Grid 
        templateColumns={{ 
          base: "1fr", 
          md: "repeat(3, 1fr)" 
        }} 
        gap={4} 
        mb={4}
      >
        <GridItem>
          <Field label="所属角色">
            <Box>
              <select
                value={roleId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRoleId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #E2E8F0",
                  fontSize: "14px",
                  backgroundColor: "white",
                  cursor: "pointer"
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
          <Field label="版本号">
            <Input
              placeholder="输入版本号"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
              type="number"
            />
          </Field>
        </GridItem>
        
        <GridItem>
          <Field label="激活状态">
            <Box>
              <select
                value={isActive}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setIsActive(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #E2E8F0",
                  fontSize: "14px",
                  backgroundColor: "white",
                  cursor: "pointer"
                }}
              >
                <option value="">全部状态</option>
                <option value="Y">激活</option>
                <option value="N">未激活</option>
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

function RolePromptsTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, role_id, version, is_active } = searchParams

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getRolePromptsQueryOptions({ page, role_id, version, is_active }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    role_id?: number
    version?: number
    is_active?: string
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

  const rolePrompts = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  console.log("当前搜索参数:", { page, role_id, version, is_active })
  console.log("查询结果:", { rolePrompts: rolePrompts.length, count })

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingRolePrompts />
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
            <Table.ColumnHeader w="md" fontWeight="bold">所属角色</Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">版本号</Table.ColumnHeader>
            <Table.ColumnHeader w="lg" fontWeight="bold">用户提示词</Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">激活状态</Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">创建时间</Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">操作</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rolePrompts?.map((prompt) => (
            <Table.Row key={prompt.id} opacity={isPlaceholderData ? 0.5 : 1} _hover={{ bg: "gray.50" }}>
              <Table.Cell>
                <Badge colorScheme="green">{prompt.id}</Badge>
              </Table.Cell>
              <Table.Cell fontWeight="medium">
                {prompt.role?.name || "未知角色"}
                {prompt.role?.role_dir?.ip && (
                  <Text fontSize="xs" color="gray.500">
                    {prompt.role.role_dir.ip}
                  </Text>
                )}
              </Table.Cell>
              <Table.Cell>
                <Badge colorScheme="blue" variant="outline">
                  v{prompt.version}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Box 
                  maxW="300px" 
                  overflow="hidden" 
                  textOverflow="ellipsis" 
                  whiteSpace="nowrap"
                  title={JSON.stringify(prompt.user_prompt, null, 2)}
                >
                  {typeof prompt.user_prompt === 'object' 
                    ? JSON.stringify(prompt.user_prompt).substring(0, 100) + "..."
                    : String(prompt.user_prompt)
                  }
                </Box>
              </Table.Cell>
              <Table.Cell>
                <Badge 
                  colorScheme={prompt.is_active === "Y" ? "green" : "gray"}
                  variant={prompt.is_active === "Y" ? "solid" : "outline"}
                >
                  {prompt.is_active === "Y" ? "激活" : "未激活"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                {prompt.created_at 
                  ? new Date(prompt.created_at).toLocaleString('zh-CN')
                  : "未知"
                }
              </Table.Cell>
              <Table.Cell>
                <RolePromptActionsMenu prompt={prompt} />
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
          {role_id || version || is_active ? "未找到匹配的角色提示词" : "暂无角色提示词数据"}
        </Box>
      )}
    </>
  )
}

function RolePrompts() {
  return (
    <Container maxW="full" p={6}>
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        角色提示词管理
      </Heading>

      <AddRolePrompt />
      <RolePromptsTable />
    </Container>
  )
} 