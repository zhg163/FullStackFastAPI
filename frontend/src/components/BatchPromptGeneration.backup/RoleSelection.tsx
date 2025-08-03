import {
  RoleTemplateItemsService,
  RoleTemplatesService,
  RolesService,
} from "@/client"
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Divider,
  Flex,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import React, { useState, useMemo } from "react"
import { FiPlus, FiSearch, FiUsers, FiX } from "react-icons/fi"

interface RoleWithTemplates {
  id: number
  name: string
  ip_name: string
  templates: Array<{
    id: number
    template_name: string
    items: Array<{
      id: number
      item_name: string
      item_prompt_desc: string
      selected: boolean
    }>
  }>
}

interface RoleSelectionProps {
  selectedRoles: RoleWithTemplates[]
  onUpdate: (selectedRoles: RoleWithTemplates[]) => void
  onNext: () => void
  onPrevious: () => void
}

const MAX_SELECTIONS = 10

const RoleSelection = ({
  selectedRoles,
  onUpdate,
  onNext,
  onPrevious,
}: RoleSelectionProps) => {
  const [searchTerm, setSearchTerm] = useState("")
  const [ipFilter, setIpFilter] = useState("")

  // 获取角色列表
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles", "all"],
    queryFn: () => RolesService.readRoles({ skip: 0, limit: 100 }),
  })

  // 获取角色分类列表
  const { data: roleDirsData } = useQuery({
    queryKey: ["role-dirs", "all"],
    queryFn: () => RolesService.readRoles({ skip: 0, limit: 100 }), // 这里应该是获取分类的API
  })

  // 筛选可选角色
  const availableRoles = useMemo(() => {
    if (!rolesData?.data) return []

    const selectedRoleIds = selectedRoles.map((r) => r.id)
    return rolesData.data
      .filter((role) => !selectedRoleIds.includes(role.id))
      .filter((role) => {
        if (
          searchTerm &&
          !role.name.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false
        }
        if (ipFilter && role.role_dir?.ip !== ipFilter) {
          return false
        }
        return true
      })
  }, [rolesData, selectedRoles, searchTerm, ipFilter])

  // 获取角色的模板信息
  const loadRoleTemplates = async (roleId: number) => {
    try {
      const templatesResponse = await RoleTemplatesService.readRoleTemplates({
        skip: 0,
        limit: 100,
        roleId: roleId,
      })

      const templatesWithItems = await Promise.all(
        templatesResponse.data.map(async (template) => {
          const itemsResponse =
            await RoleTemplateItemsService.readRoleTemplateItems({
              skip: 0,
              limit: 100,
              roleTmpId: template.id,
            })

          return {
            id: template.id,
            template_name: template.template_name || "",
            items: itemsResponse.data.map((item) => ({
              id: item.id,
              item_name: item.item_name,
              item_prompt_desc: item.item_prompt_desc || "",
              selected: true, // 默认全选
            })),
          }
        }),
      )

      return templatesWithItems
    } catch (error) {
      console.error("加载角色模板失败:", error)
      return []
    }
  }

  // 添加角色
  const handleAddRole = async (role: any) => {
    if (selectedRoles.length >= MAX_SELECTIONS) {
      return
    }

    const templates = await loadRoleTemplates(role.id)

    const roleWithTemplates: RoleWithTemplates = {
      id: role.id,
      name: role.name,
      ip_name: role.role_dir?.ip || "",
      templates,
    }

    onUpdate([...selectedRoles, roleWithTemplates])
  }

  // 移除角色
  const handleRemoveRole = (roleId: number) => {
    onUpdate(selectedRoles.filter((role) => role.id !== roleId))
  }

  // 清空搜索
  const handleClearSearch = () => {
    setSearchTerm("")
    setIpFilter("")
  }

  // 获取IP分类选项
  const ipOptions = useMemo(() => {
    if (!rolesData?.data) return []
    const ips = [
      ...new Set(
        rolesData.data.map((role) => role.role_dir?.ip).filter(Boolean),
      ),
    ]
    return ips
  }, [rolesData])

  if (rolesLoading) {
    return (
      <Box textAlign="center" py={8}>
        <Text>加载角色列表中...</Text>
      </Box>
    )
  }

  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      p={8}
      shadow="sm"
    >
      <VStack spacing={6} align="stretch">
        <Text fontSize="20px" fontWeight="700" color="gray.700" mb={2}>
          👥 选择要生成提示词的角色
        </Text>

        {/* 搜索和筛选区域 */}
        <Box p={6} bg="gray.50" borderRadius="lg">
          <Grid
            templateColumns={{ base: "1fr", md: "2fr 1fr 1fr" }}
            gap={4}
            mb={4}
          >
            <GridItem>
              <InputGroup size="lg">
                <InputLeftElement pointerEvents="none">
                  <FiSearch color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder="搜索角色名称..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  bg="white"
                  borderColor="gray.300"
                />
              </InputGroup>
            </GridItem>

            <GridItem>
              <Select
                placeholder="选择IP分类"
                value={ipFilter}
                onChange={(e) => setIpFilter(e.target.value)}
                size="lg"
                bg="white"
                borderColor="gray.300"
              >
                {ipOptions.map((ip) => (
                  <option key={ip} value={ip}>
                    {ip}
                  </option>
                ))}
              </Select>
            </GridItem>

            <GridItem>
              <Button
                leftIcon={<FiX />}
                onClick={handleClearSearch}
                size="lg"
                variant="outline"
                w="full"
              >
                重置筛选
              </Button>
            </GridItem>
          </Grid>

          <Text fontSize="12px" color="gray.500">
            IP分类筛选: {ipFilter || "全部"} | 搜索词: {searchTerm || "无"}
          </Text>
        </Box>

        {/* 已选角色区域 */}
        <Card bg="blue.50" borderColor="blue.200" borderWidth="2px">
          <CardBody>
            <Flex align="center" justify="space-between" mb={4}>
              <HStack>
                <FiUsers />
                <Text fontWeight="600" color="blue.700">
                  已选角色 ({selectedRoles.length}/{MAX_SELECTIONS})
                </Text>
              </HStack>

              {selectedRoles.length === MAX_SELECTIONS && (
                <Badge colorScheme="orange" variant="solid">
                  已达上限
                </Badge>
              )}
            </Flex>

            {selectedRoles.length === 0 ? (
              <Text color="gray.500" textAlign="center" py={4}>
                还没有选择任何角色，请从下方选择
              </Text>
            ) : (
              <VStack spacing={2} align="stretch">
                {selectedRoles.map((role) => (
                  <Flex
                    key={role.id}
                    align="center"
                    justify="space-between"
                    p={3}
                    bg="white"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="blue.100"
                  >
                    <HStack>
                      <Text fontWeight="500">{role.name}</Text>
                      <Badge colorScheme="blue" variant="subtle">
                        {role.ip_name}
                      </Badge>
                      <Text fontSize="sm" color="gray.500">
                        ({role.templates.length}个模板)
                      </Text>
                    </HStack>

                    <Tooltip label="移除此角色">
                      <IconButton
                        aria-label="移除角色"
                        icon={<FiX />}
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        onClick={() => handleRemoveRole(role.id)}
                      />
                    </Tooltip>
                  </Flex>
                ))}
              </VStack>
            )}
          </CardBody>
        </Card>

        {/* 可选角色区域 */}
        <Card>
          <CardBody>
            <Text fontWeight="600" color="gray.700" mb={4}>
              可选角色 ({availableRoles.length}个)
            </Text>

            {availableRoles.length === 0 ? (
              <Text color="gray.500" textAlign="center" py={8}>
                {searchTerm || ipFilter
                  ? "没有找到匹配的角色"
                  : "所有角色都已选择"}
              </Text>
            ) : (
              <Grid
                templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}
                gap={3}
              >
                {availableRoles.map((role) => (
                  <Flex
                    key={role.id}
                    align="center"
                    justify="space-between"
                    p={3}
                    borderWidth="1px"
                    borderColor="gray.200"
                    borderRadius="md"
                    _hover={{ bg: "gray.50", borderColor: "gray.300" }}
                  >
                    <HStack>
                      <Text fontWeight="500">{role.name}</Text>
                      <Badge colorScheme="gray" variant="subtle">
                        {role.role_dir?.ip}
                      </Badge>
                    </HStack>

                    <Button
                      leftIcon={<FiPlus />}
                      size="sm"
                      colorScheme="green"
                      variant="outline"
                      onClick={() => handleAddRole(role)}
                      isDisabled={selectedRoles.length >= MAX_SELECTIONS}
                    >
                      选择
                    </Button>
                  </Flex>
                ))}
              </Grid>
            )}
          </CardBody>
        </Card>

        {/* 提示信息 */}
        {selectedRoles.length === 0 && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            请至少选择一个角色才能继续下一步
          </Alert>
        )}

        {/* 操作按钮 */}
        <Flex justify="space-between" mt={6}>
          <Button
            leftIcon={<Text>←</Text>}
            onClick={onPrevious}
            variant="outline"
            size="lg"
            px={8}
          >
            上一步
          </Button>

          <Button
            rightIcon={<Text>→</Text>}
            onClick={onNext}
            colorScheme="blue"
            size="lg"
            px={8}
            isDisabled={selectedRoles.length === 0}
          >
            下一步
          </Button>
        </Flex>
      </VStack>
    </Box>
  )
}

export default RoleSelection
