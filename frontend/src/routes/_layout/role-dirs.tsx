import { Badge, Container, Flex, Heading, Table, Box, Input, Button, Stack, Grid, GridItem } from "@chakra-ui/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { useState } from "react"
import { FiSearch, FiRefreshCcw } from "react-icons/fi"

import { type RoleDirPublic, RoleDirsService } from "@/client"
import AddRoleDir from "@/components/RoleDirs/AddRoleDir"
import { RoleDirActionsMenu } from "@/components/Common/RoleDirActionsMenu"
import PendingRoleDirs from "@/components/Pending/PendingRoleDirs"
import {
  PaginationItems,
  PaginationNextTrigger,
  PaginationPrevTrigger,
  PaginationRoot,
} from "@/components/ui/pagination.tsx"
import { Field } from "@/components/ui/field"

const roleDirsSearchSchema = z.object({
  page: z.number().catch(1),
  ip: z.string().optional(),
  ip_desc: z.string().optional(),
})

const PER_PAGE = 5

function getRoleDirsQueryOptions({ 
  page, 
  ip, 
  ip_desc 
}: { 
  page: number
  ip?: string
  ip_desc?: string
}) {
  const params: any = {
    skip: (page - 1) * PER_PAGE,
    limit: PER_PAGE,
  }
  
  if (ip) params.ip = ip
  if (ip_desc) params.ipDesc = ip_desc

  return {
    queryFn: () => RoleDirsService.readRoleDirs(params),
    queryKey: ["roleDirs", { page, ip, ip_desc }],
  }
}

export const Route = createFileRoute("/_layout/role-dirs")({
  component: RoleDirs,
  validateSearch: roleDirsSearchSchema,
})

interface SearchFormProps {
  onSearch: (filters: {
    ip?: string
    ip_desc?: string
  }) => void
  onReset: () => void
}

function SearchForm({ onSearch, onReset }: SearchFormProps) {
  const [ip, setIp] = useState("")
  const [ipDesc, setIpDesc] = useState("")

  const handleSearch = () => {
    const filters: any = {}
    if (ip.trim()) filters.ip = ip.trim()
    if (ipDesc.trim()) filters.ip_desc = ipDesc.trim()
    
    console.log("搜索条件:", filters)
    onSearch(filters)
  }

  const handleReset = () => {
    setIp("")
    setIpDesc("")
    onReset()
  }

  return (
    <Box p={6} bg="gray.50" borderRadius="lg" mb={6} shadow="sm">
      <Heading size="md" mb={4} color="gray.700">搜索条件</Heading>
      
      <Grid 
        templateColumns={{ 
          base: "1fr", 
          md: "repeat(2, 1fr)", 
        }} 
        gap={4} 
        mb={4}
      >
        <GridItem>
          <Field label="IP分类名称">
            <Input
              placeholder="输入IP分类名称"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
            />
          </Field>
        </GridItem>
        
        <GridItem>
          <Field label="IP描述">
            <Input
              placeholder="输入IP描述"
              value={ipDesc}
              onChange={(e) => setIpDesc(e.target.value)}
              bg="white"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
            />
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

function RoleDirsTable() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const searchParams = Route.useSearch()
  const { page, ip, ip_desc } = searchParams

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...getRoleDirsQueryOptions({ page, ip, ip_desc }),
    placeholderData: (prevData) => prevData,
  })

  const setPage = (page: number) =>
    navigate({
      search: (prev: any) => ({ ...prev, page }),
    })

  const handleSearch = (filters: {
    ip?: string
    ip_desc?: string
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

  const roleDirs = data?.data.slice(0, PER_PAGE) ?? []
  const count = data?.count ?? 0

  console.log("当前搜索参数:", { page, ip, ip_desc })
  console.log("查询结果:", { roleDirs: roleDirs.length, count })

  if (isLoading) {
    return (
      <>
        <SearchForm onSearch={handleSearch} onReset={handleReset} />
        <PendingRoleDirs />
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
            <Table.ColumnHeader w="md" fontWeight="bold">IP分类名称</Table.ColumnHeader>
            <Table.ColumnHeader w="lg" fontWeight="bold">IP描述</Table.ColumnHeader>
            <Table.ColumnHeader w="md" fontWeight="bold">创建时间</Table.ColumnHeader>
            <Table.ColumnHeader w="sm" fontWeight="bold">操作</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {roleDirs?.map((roleDir) => (
            <Table.Row key={roleDir.id} opacity={isPlaceholderData ? 0.5 : 1} _hover={{ bg: "gray.50" }}>
              <Table.Cell>
                <Badge colorScheme="blue">{roleDir.id}</Badge>
              </Table.Cell>
              <Table.Cell fontWeight="medium">
                {roleDir.ip}
              </Table.Cell>
              <Table.Cell color={!roleDir.ip_desc ? "gray.500" : "inherit"}>
                {roleDir.ip_desc || "暂无描述"}
              </Table.Cell>
              <Table.Cell>
                {roleDir.created_at 
                  ? new Date(roleDir.created_at).toLocaleString('zh-CN')
                  : "未知"
                }
              </Table.Cell>
              <Table.Cell>
                <RoleDirActionsMenu roleDir={roleDir} />
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
          {ip || ip_desc ? "未找到匹配的角色分类" : "暂无角色分类数据"}
        </Box>
      )}
    </>
  )
}

function RoleDirs() {
  return (
    <Container maxW="full" p={6}>
      <Heading size="lg" pt={12} mb={6} color="gray.800">
        角色分类管理
      </Heading>

      <AddRoleDir />
      <RoleDirsTable />
    </Container>
  )
} 