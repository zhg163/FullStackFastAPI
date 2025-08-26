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
  type RoleTemplatePublic,
  RoleTemplatesService,
} from "@/client"
import { RoleTemplateActionsMenu } from "@/components/Common/RoleTemplateActionsMenu"
import PendingRoleTemplates from "@/components/Pending/PendingRoleTemplates"
import AddRoleTemplate from "@/components/RoleTemplates/AddRoleTemplate"
import { Field } from "@/components/ui/field"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"

const roleTemplatesSearchSchema = z.object({
  page: z.number().catch(1),
  template_name: z.string().optional(),
  is_active: z.string().optional(),
})

const PER_PAGE = 5

function getRoleTemplatesQueryOptions({
  page,
  template_name,
  is_active,
}: {
  page: number
  template_name?: string
  is_active?: string
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }

  if (template_name) params.templateName = template_name
  if (is_active) params.isActive = is_active

  return {
    queryFn: () => RoleTemplatesService.readRoleTemplates(params),
    queryKey: ["role-templates", { page, template_name, is_active }],
  }
}

export const Route = createFileRoute("/_layout/role-templates")({
  component: RoleTemplates,
  validateSearch: roleTemplatesSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    template_name?: string
    is_active?: string
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [templateName, setTemplateName] = useState("")
  const [isActive, setIsActive] = useState("")

  const handleSearch = () => {
    const filters: any = {}
    if (templateName.trim()) filters.template_name = templateName.trim()
    if (isActive) filters.is_active = isActive

    console.log("搜索条件:", filters)
    onSearch(filters)
  }

  const handleReset = () => {
    setTemplateName("")
    setIsActive("")
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
          <Field label="模板名称">
            <Input
              placeholder="输入模板名称"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
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
          <Field label="激活状态">
            <Box>
              <select
                value={isActive}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setIsActive(e.target.value)
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
        <Button variant="outline" onClick={handleReset} size="md" minW="100px">
          <FiRefreshCcw style={{ marginRight: "6px" }} />
          重置
        </Button>
      </Flex>
    </Box>
  )
}

function RoleTemplatesTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, template_name, is_active } = searchParams

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getRoleTemplatesQueryOptions({
      page,
      template_name,
      is_active,
    }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    template_name?: string
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

  const roleTemplates = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  console.log("当前搜索参数:", { page, template_name, is_active })
  console.log("查询结果:", { roleTemplates: roleTemplates.length, count })

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingRoleTemplates />
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
              模板名称
            </Table.ColumnHeader>

            <Table.ColumnHeader w="sm" fontWeight="bold">
              激活状态
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
          {roleTemplates?.map((template) => (
            <Table.Row
              key={template.id}
              opacity={isPlaceholderData ? 0.5 : 1}
              _hover={{ bg: "gray.50" }}
            >
              <Table.Cell>
                <Badge colorScheme="blue">{template.id}</Badge>
              </Table.Cell>
              <Table.Cell fontWeight="medium">
                {template.template_name || "未设置"}
              </Table.Cell>

              <Table.Cell>
                <Badge
                  colorScheme={
                    template.is_active === "Y"
                      ? "green"
                      : template.is_active === "N"
                        ? "red"
                        : "gray"
                  }
                  variant="subtle"
                >
                  {template.is_active === "Y"
                    ? "激活"
                    : template.is_active === "N"
                      ? "未激活"
                      : "未知"}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                {template.created_at
                  ? new Date(template.created_at).toLocaleString("zh-CN")
                  : "未知"}
              </Table.Cell>
              <Table.Cell>
                <RoleTemplateActionsMenu template={template} />
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
          {template_name || is_active
            ? "未找到匹配的角色模板"
            : "暂无角色模板数据"}
        </Box>
      )}
    </>
  )
}

function RoleTemplates() {
  return (
    <Container maxW="full" p={6}>
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        角色模板管理
      </Heading>

      <AddRoleTemplate />
      <RoleTemplatesTable />
    </Container>
  )
}
