import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  CheckboxGroup,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  Stat,
  StatLabel,
  StatNumber,
  Switch,
  Text,
  VStack,
} from "@chakra-ui/react"
import React from "react"
import { FiCheck, FiClock, FiSettings } from "react-icons/fi"

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

interface TaskData {
  taskName: string
  taskDescription?: string
  generationStrategy: "ai" | "template" | "hybrid"
  selectedRoles: RoleWithTemplates[]
  options: {
    parallelGeneration: boolean
    autoActivate: boolean
    sendNotification: boolean
  }
}

interface ContentConfirmationProps {
  taskData: TaskData
  onUpdate: (updates: Partial<TaskData>) => void
  onNext: () => void
  onPrevious: () => void
}

const ContentConfirmation = ({
  taskData,
  onUpdate,
  onNext,
  onPrevious,
}: ContentConfirmationProps) => {
  // 计算任务统计信息
  const getTaskStats = () => {
    const totalRoles = taskData.selectedRoles.length
    const totalTemplates = taskData.selectedRoles.reduce(
      (sum, role) => sum + role.templates.length,
      0,
    )
    const totalItems = taskData.selectedRoles.reduce(
      (sum, role) =>
        sum +
        role.templates.reduce(
          (templateSum, template) =>
            templateSum + template.items.filter((item) => item.selected).length,
          0,
        ),
      0,
    )

    const estimatedTime =
      totalItems <= 5
        ? "2-5分钟"
        : totalItems <= 15
          ? "5-10分钟"
          : totalItems <= 30
            ? "10-20分钟"
            : "20-30分钟"

    return { totalRoles, totalTemplates, totalItems, estimatedTime }
  }

  const stats = getTaskStats()

  // 切换模板条目选择状态
  const handleItemToggle = (
    roleId: number,
    templateId: number,
    itemId: number,
    checked: boolean,
  ) => {
    const updatedRoles = taskData.selectedRoles.map((role) => {
      if (role.id === roleId) {
        return {
          ...role,
          templates: role.templates.map((template) => {
            if (template.id === templateId) {
              return {
                ...template,
                items: template.items.map((item) =>
                  item.id === itemId ? { ...item, selected: checked } : item,
                ),
              }
            }
            return template
          }),
        }
      }
      return role
    })

    onUpdate({ selectedRoles: updatedRoles })
  }

  // 切换整个模板的选择状态
  const handleTemplateToggle = (
    roleId: number,
    templateId: number,
    checked: boolean,
  ) => {
    const updatedRoles = taskData.selectedRoles.map((role) => {
      if (role.id === roleId) {
        return {
          ...role,
          templates: role.templates.map((template) => {
            if (template.id === templateId) {
              return {
                ...template,
                items: template.items.map((item) => ({
                  ...item,
                  selected: checked,
                })),
              }
            }
            return template
          }),
        }
      }
      return role
    })

    onUpdate({ selectedRoles: updatedRoles })
  }

  // 更新选项
  const handleOptionChange = (
    option: keyof TaskData["options"],
    value: boolean,
  ) => {
    onUpdate({
      options: {
        ...taskData.options,
        [option]: value,
      },
    })
  }

  // 检查是否可以继续
  const canProceed = stats.totalItems > 0

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
          🎯 确认要生成的内容
        </Text>

        {/* 角色模板展示 */}
        <VStack spacing={4} align="stretch">
          {taskData.selectedRoles.map((role) => (
            <Card
              key={role.id}
              borderWidth="2px"
              borderColor="blue.200"
              bg="blue.50"
            >
              <CardHeader pb={3}>
                <Flex align="center" justify="space-between">
                  <HStack>
                    <Text fontSize="16px" fontWeight="700" color="blue.700">
                      {role.name}
                    </Text>
                    <Badge colorScheme="blue" variant="solid">
                      {role.ip_name}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.600">
                    {role.templates.length}个模板
                  </Text>
                </Flex>
              </CardHeader>

              <CardBody pt={0}>
                <VStack spacing={4} align="stretch">
                  {role.templates.map((template) => {
                    const selectedItemsCount = template.items.filter(
                      (item) => item.selected,
                    ).length
                    const allSelected =
                      selectedItemsCount === template.items.length
                    const someSelected =
                      selectedItemsCount > 0 &&
                      selectedItemsCount < template.items.length

                    return (
                      <Box
                        key={template.id}
                        p={4}
                        bg="white"
                        borderRadius="md"
                        borderWidth="1px"
                      >
                        <HStack justify="space-between" mb={3}>
                          <HStack>
                            <Checkbox
                              isChecked={allSelected}
                              isIndeterminate={someSelected}
                              onChange={(e) =>
                                handleTemplateToggle(
                                  role.id,
                                  template.id,
                                  e.target.checked,
                                )
                              }
                              colorScheme="green"
                            >
                              <Text fontWeight="600" color="green.700">
                                📋 {template.template_name}
                              </Text>
                            </Checkbox>
                            <Badge colorScheme="green" variant="outline">
                              {selectedItemsCount}/{template.items.length}
                            </Badge>
                          </HStack>

                          {allSelected && (
                            <Badge colorScheme="green" variant="solid">
                              <FiCheck
                                size="12px"
                                style={{ marginRight: "4px" }}
                              />
                              已选择
                            </Badge>
                          )}
                        </HStack>

                        <Box pl={6}>
                          <VStack spacing={2} align="stretch">
                            {template.items.map((item) => (
                              <Checkbox
                                key={item.id}
                                isChecked={item.selected}
                                onChange={(e) =>
                                  handleItemToggle(
                                    role.id,
                                    template.id,
                                    item.id,
                                    e.target.checked,
                                  )
                                }
                                colorScheme="green"
                              >
                                <HStack spacing={2}>
                                  <Text fontSize="sm" fontWeight="500">
                                    {item.item_name}
                                  </Text>
                                  {item.item_prompt_desc && (
                                    <Text fontSize="xs" color="gray.500">
                                      - {item.item_prompt_desc}
                                    </Text>
                                  )}
                                </HStack>
                              </Checkbox>
                            ))}
                          </VStack>
                        </Box>
                      </Box>
                    )
                  })}
                </VStack>
              </CardBody>
            </Card>
          ))}
        </VStack>

        <Divider />

        {/* 任务统计 */}
        <Card bg="gray.50" borderWidth="1px">
          <CardBody>
            <HStack spacing={4} mb={4}>
              <Text fontSize="16px" fontWeight="600" color="gray.700">
                💡 预计生成任务:
              </Text>
            </HStack>

            <Grid
              templateColumns="repeat(auto-fit, minmax(150px, 1fr))"
              gap={4}
              mb={4}
            >
              <Stat textAlign="center">
                <StatLabel color="gray.600">主任务</StatLabel>
                <StatNumber color="blue.600">{stats.totalRoles}个</StatNumber>
                <Text fontSize="xs" color="gray.500">
                  每个角色1个
                </Text>
              </Stat>

              <Stat textAlign="center">
                <StatLabel color="gray.600">子任务</StatLabel>
                <StatNumber color="green.600">{stats.totalItems}个</StatNumber>
                <Text fontSize="xs" color="gray.500">
                  每个条目1个
                </Text>
              </Stat>

              <Stat textAlign="center">
                <StatLabel color="gray.600">预计用时</StatLabel>
                <StatNumber color="orange.600">
                  {stats.estimatedTime}
                </StatNumber>
                <Text fontSize="xs" color="gray.500">
                  根据内容量估算
                </Text>
              </Stat>
            </Grid>
          </CardBody>
        </Card>

        {/* 高级选项 */}
        <Card borderWidth="1px">
          <CardHeader>
            <HStack>
              <FiSettings />
              <Text fontSize="16px" fontWeight="600" color="gray.700">
                ⚙️ 高级选项
              </Text>
            </HStack>
          </CardHeader>

          <CardBody pt={0}>
            <VStack spacing={4} align="stretch">
              <FormControl display="flex" alignItems="center">
                <FormLabel htmlFor="parallel-generation" mb="0" flex="1">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="500">并行生成</Text>
                    <Text fontSize="sm" color="gray.500">
                      更快但消耗更多资源
                    </Text>
                  </VStack>
                </FormLabel>
                <Switch
                  id="parallel-generation"
                  isChecked={taskData.options.parallelGeneration}
                  onChange={(e) =>
                    handleOptionChange("parallelGeneration", e.target.checked)
                  }
                  colorScheme="blue"
                />
              </FormControl>

              <FormControl display="flex" alignItems="center">
                <FormLabel htmlFor="auto-activate" mb="0" flex="1">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="500">生成完成后自动激活</Text>
                    <Text fontSize="sm" color="gray.500">
                      自动将生成结果设为活跃状态
                    </Text>
                  </VStack>
                </FormLabel>
                <Switch
                  id="auto-activate"
                  isChecked={taskData.options.autoActivate}
                  onChange={(e) =>
                    handleOptionChange("autoActivate", e.target.checked)
                  }
                  colorScheme="green"
                />
              </FormControl>

              <FormControl display="flex" alignItems="center">
                <FormLabel htmlFor="send-notification" mb="0" flex="1">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="500">发送完成通知</Text>
                    <Text fontSize="sm" color="gray.500">
                      任务完成时发送通知提醒
                    </Text>
                  </VStack>
                </FormLabel>
                <Switch
                  id="send-notification"
                  isChecked={taskData.options.sendNotification}
                  onChange={(e) =>
                    handleOptionChange("sendNotification", e.target.checked)
                  }
                  colorScheme="purple"
                />
              </FormControl>
            </VStack>
          </CardBody>
        </Card>

        {/* 警告提示 */}
        {!canProceed && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            请至少选择一个模板条目才能创建任务
          </Alert>
        )}

        {stats.totalItems > 20 && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            您选择了较多的生成内容({stats.totalItems}
            项)，建议启用并行生成以提高效率
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
            colorScheme="green"
            size="lg"
            px={8}
            isDisabled={!canProceed}
          >
            创建任务
          </Button>
        </Flex>
      </VStack>
    </Box>
  )
}

export default ContentConfirmation
