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
} from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type React from "react"
import { useState } from "react"
import { FiRefreshCcw, FiSearch } from "react-icons/fi"
import { z } from "zod"

import {
  type RoleTemplateItemPublic,
  RoleTemplateItemsService,
  RoleTemplatesService,
} from "@/client"
import { RoleTemplateItemActionsMenu } from "@/components/Common/RoleTemplateItemActionsMenu"
import PendingRoleTemplateItems from "@/components/Pending/PendingRoleTemplateItems"
import AddRoleTemplateItem from "@/components/RoleTemplateItems/AddRoleTemplateItem"
import { Field } from "@/components/ui/field"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"

const roleTemplateItemsSearchSchema = z.object({
  page: z.number().catch(1),
  item_name: z.string().optional(),
  role_tmp_id: z.number().optional(),
})

const PER_PAGE = 5

function getRoleTemplateItemsQueryOptions({
  page,
  item_name,
  role_tmp_id,
}: {
  page: number
  item_name?: string
  role_tmp_id?: number
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }

  if (item_name) params.itemName = item_name
  if (role_tmp_id) params.roleTmpId = role_tmp_id

  return {
    queryFn: () => RoleTemplateItemsService.readRoleTemplateItems(params),
    queryKey: ["role-template-items", { page, item_name, role_tmp_id }],
  }
}

export const Route = createFileRoute("/_layout/role-template-items")({
  component: RoleTemplateItems,
  validateSearch: roleTemplateItemsSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    item_name?: string
    role_tmp_id?: number
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [itemName, setItemName] = useState("")
  const [roleTmpId, setRoleTmpId] = useState("")

  // 获取角色模板列表用于下拉选择
  const { data: roleTemplatesData } = useQuery({
    queryKey: ["role-templates", "all"],
    queryFn: () =>
      RoleTemplatesService.readRoleTemplates({ skip: 0, limit: 100 }),
  })

  const handleSearch = () => {
    const filters: any = {}
    if (itemName.trim()) filters.item_name = itemName.trim()
    if (roleTmpId.trim())
      filters.role_tmp_id = Number.parseInt(roleTmpId.trim())

    console.log("搜索条件:", filters)
    onSearch(filters)
  }

  const handleReset = () => {
    setItemName("")
    setRoleTmpId("")
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
          md: "repeat(2, 1fr)",
        }}
        gap={4}
        mb={4}
      >
        <GridItem>
          <Field label="条目名称">
            <Input
              placeholder="输入条目名称"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
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
          <Field label="所属模板">
            <Box>
              <select
                value={roleTmpId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setRoleTmpId(e.target.value)
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
                <option value="">选择角色模板</option>
                {roleTemplatesData?.data.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.template_name || `ID:${template.id}`} -{" "}
                    {template.role?.name}
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

function RoleTemplateItemsTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, item_name, role_tmp_id } = searchParams

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getRoleTemplateItemsQueryOptions({ page, item_name, role_tmp_id }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    item_name?: string
    role_tmp_id?: number
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

  const roleTemplateItems = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  console.log("当前搜索参数:", { page, item_name, role_tmp_id })
  console.log("查询结果:", {
    roleTemplateItems: roleTemplateItems.length,
    count,
  })

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingRoleTemplateItems />
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
              ID
            </Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">
              条目名称
            </Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">
              所属模板
            </Table.ColumnHeader>
            <Table.ColumnHeader w="lg" fontWeight="bold">
              提示词描述
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
          {roleTemplateItems?.map((item) => (
            <Table.Row
              key={item.id}
              opacity={isPlaceholderData ? 0.5 : 1}
              _hover={{ bg: "gray.50" }}
            >
              <Table.Cell>
                <Badge colorScheme="purple">{item.id}</Badge>
              </Table.Cell>
              <Table.Cell fontWeight="medium">{item.item_name}</Table.Cell>
              <Table.Cell>
                {item.template?.template_name || "未知模板"}
                {item.template?.role?.name && ` (${item.template.role.name})`}
              </Table.Cell>
              <Table.Cell>
                <Box
                  maxW="200px"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                  title={item.item_prompt_desc || ""}
                >
                  {item.item_prompt_desc || "无描述"}
                </Box>
              </Table.Cell>
              <Table.Cell>
                {item.created_at
                  ? new Date(item.created_at).toLocaleString("zh-CN")
                  : "未知"}
              </Table.Cell>
              <Table.Cell>
                <RoleTemplateItemActionsMenu item={item} />
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
          {item_name || role_tmp_id
            ? "未找到匹配的模板条目"
            : "暂无模板条目数据"}
        </Box>
      )}
    </>
  )
}

function RoleTemplateItems() {
  return (
    <Container maxW="full" p={6}>
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        模板条目管理
      </Heading>

      <AddRoleTemplateItem />
      <RoleTemplateItemsTable />
    </Container>
  )
}
