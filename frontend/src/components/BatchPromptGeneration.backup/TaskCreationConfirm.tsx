import { TaskCreatRolePromptsService } from "@/client"
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Flex,
  Grid,
  GridItem,
  HStack,
  Icon,
  Link,
  Progress,
  Stat,
  StatHelpText,
  StatLabel,
  StatNumber,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import React, { useState } from "react"
import {
  FiCheck,
  FiClock,
  FiExternalLink,
  FiHome,
  FiList,
  FiPlay,
} from "react-icons/fi"

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

interface TaskCreationConfirmProps {
  taskData: TaskData
  onPrevious: () => void
}

const TaskCreationConfirm = ({
  taskData,
  onPrevious,
}: TaskCreationConfirmProps) => {
  const [createdTaskId, setCreatedTaskId] = useState<number | null>(null)
  const toast = useToast()
  const router = useRouter()

  // 创建任务的mutation
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // 这里需要创建多个任务，每个角色一个主任务
      const results = []

      for (const role of taskData.selectedRoles) {
        // 准备任务命令数据
        const taskCmd = {
          strategy: taskData.generationStrategy,
          parallelGeneration: taskData.options.parallelGeneration,
          autoActivate: taskData.options.autoActivate,
          sendNotification: taskData.options.sendNotification,
          totalItems: role.templates.reduce(
            (sum, template) =>
              sum + template.items.filter((item) => item.selected).length,
            0,
          ),
        }

        // 准备角色条目提示词数据
        const roleItemPrompt = {
          role: {
            id: role.id,
            name: role.name,
            ip_name: role.ip_name,
          },
          templates: role.templates
            .map((template) => ({
              id: template.id,
              name: template.template_name,
              items: template.items
                .filter((item) => item.selected)
                .map((item) => ({
                  id: item.id,
                  name: item.item_name,
                  description: item.item_prompt_desc,
                })),
            }))
            .filter((template) => template.items.length > 0),
        }

        // 创建任务
        const result =
          await TaskCreatRolePromptsService.createTaskCreatRolePrompt({
            requestBody: {
              task_name: `${taskData.taskName} - ${role.name}`,
              task_state: "P", // 进行中
              task_cmd: taskCmd,
              role_id: role.id,
              role_item_prompt: roleItemPrompt,
            },
          })

        results.push(result)
      }

      return results
    },
    onSuccess: (results) => {
      if (results.length > 0) {
        setCreatedTaskId(results[0].id)
      }

      toast({
        title: "任务创建成功！",
        description: `已创建 ${results.length} 个批量生成任务`,
        status: "success",
        duration: 5000,
        isClosable: true,
      })
    },
    onError: (error) => {
      console.error("创建任务失败:", error)
      toast({
        title: "任务创建失败",
        description: "请稍后重试或联系管理员",
        status: "error",
        duration: 5000,
        isClosable: true,
      })
    },
  })

  // 计算任务统计信息
  const getTaskStats = () => {
    const totalRoles = taskData.selectedRoles.length
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

    return { totalRoles, totalItems }
  }

  const stats = getTaskStats()

  // 处理任务创建
  const handleCreateTask = () => {
    createTaskMutation.mutate()
  }

  // 导航到任务列表
  const handleViewTasks = () => {
    router.navigate({ to: "/task-creat-role-prompts" })
  }

  // 返回首页
  const handleGoHome = () => {
    router.navigate({ to: "/" })
  }

  // 如果任务已创建成功
  if (createdTaskId) {
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
          {/* 成功标题 */}
          <Box textAlign="center" py={6}>
            <Icon as={FiCheck} boxSize="60px" color="green.500" mb={4} />
            <Text fontSize="24px" fontWeight="700" color="green.600" mb={2}>
              ✅ 任务创建成功！
            </Text>
            <Text fontSize="16px" color="gray.600">
              您的批量生成任务已创建并开始执行
            </Text>
          </Box>

          {/* 任务信息 */}
          <Card bg="green.50" borderColor="green.200" borderWidth="2px">
            <CardBody>
              <Grid
                templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
                gap={4}
              >
                <Stat textAlign="center">
                  <StatLabel color="green.600">主任务ID</StatLabel>
                  <StatNumber color="green.700">#{createdTaskId}</StatNumber>
                  <StatHelpText color="gray.600">任务已启动</StatHelpText>
                </Stat>

                <Stat textAlign="center">
                  <StatLabel color="green.600">涉及角色</StatLabel>
                  <StatNumber color="green.700">
                    {stats.totalRoles}个
                  </StatNumber>
                  <StatHelpText color="gray.600">将分别生成</StatHelpText>
                </Stat>

                <Stat textAlign="center">
                  <StatLabel color="green.600">生成条目</StatLabel>
                  <StatNumber color="green.700">
                    {stats.totalItems}个
                  </StatNumber>
                  <StatHelpText color="gray.600">预计完成</StatHelpText>
                </Stat>
              </Grid>
            </CardBody>
          </Card>

          {/* 进度提示 */}
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <VStack align="start" spacing={1} flex="1">
              <Text fontWeight="600">任务正在后台执行中</Text>
              <Text fontSize="sm" color="gray.600">
                ⏰ 任务将在后台自动执行，完成后会发送通知。您可以随时查看进度。
              </Text>
            </VStack>
          </Alert>

          {/* 执行选项提示 */}
          <Card>
            <CardBody>
              <Text fontWeight="600" mb={3}>
                🔗 执行配置:
              </Text>
              <VStack spacing={2} align="start">
                <HStack>
                  <Badge
                    colorScheme={
                      taskData.options.parallelGeneration ? "green" : "gray"
                    }
                  >
                    {taskData.options.parallelGeneration ? "✓" : "✗"}
                  </Badge>
                  <Text fontSize="sm">
                    并行生成:{" "}
                    {taskData.options.parallelGeneration ? "已启用" : "未启用"}
                  </Text>
                </HStack>

                <HStack>
                  <Badge
                    colorScheme={
                      taskData.options.autoActivate ? "green" : "gray"
                    }
                  >
                    {taskData.options.autoActivate ? "✓" : "✗"}
                  </Badge>
                  <Text fontSize="sm">
                    自动激活:{" "}
                    {taskData.options.autoActivate ? "已启用" : "未启用"}
                  </Text>
                </HStack>

                <HStack>
                  <Badge
                    colorScheme={
                      taskData.options.sendNotification ? "green" : "gray"
                    }
                  >
                    {taskData.options.sendNotification ? "✓" : "✗"}
                  </Badge>
                  <Text fontSize="sm">
                    完成通知:{" "}
                    {taskData.options.sendNotification ? "已启用" : "未启用"}
                  </Text>
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          {/* 快捷操作 */}
          <VStack spacing={3}>
            <Text fontWeight="600" color="gray.700">
              🔗 快捷操作:
            </Text>

            <Grid
              templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
              gap={3}
              w="full"
            >
              <Button
                leftIcon={<FiList />}
                onClick={handleViewTasks}
                colorScheme="blue"
                variant="outline"
                size="lg"
              >
                查看任务列表
              </Button>

              <Button
                leftIcon={<FiPlay />}
                as={Link}
                href={"/task-creat-role-prompts"}
                colorScheme="green"
                variant="outline"
                size="lg"
                textDecoration="none !important"
              >
                查看生成进度
              </Button>

              <Button
                leftIcon={<FiHome />}
                onClick={handleGoHome}
                colorScheme="gray"
                variant="outline"
                size="lg"
              >
                返回首页
              </Button>
            </Grid>
          </VStack>
        </VStack>
      </Box>
    )
  }

  // 任务创建前的确认界面
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
          🎯 最终确认并创建任务
        </Text>

        {/* 任务概览 */}
        <Card bg="blue.50" borderColor="blue.200" borderWidth="2px">
          <CardHeader>
            <Text fontSize="18px" fontWeight="600" color="blue.700">
              📋 任务概览
            </Text>
          </CardHeader>

          <CardBody pt={0}>
            <VStack spacing={3} align="stretch">
              <HStack justify="space-between">
                <Text fontWeight="500">任务名称:</Text>
                <Text color="blue.600" fontWeight="600">
                  {taskData.taskName}
                </Text>
              </HStack>

              {taskData.taskDescription && (
                <HStack justify="space-between" align="start">
                  <Text fontWeight="500">任务描述:</Text>
                  <Text color="gray.600" maxW="300px" textAlign="right">
                    {taskData.taskDescription}
                  </Text>
                </HStack>
              )}

              <HStack justify="space-between">
                <Text fontWeight="500">生成策略:</Text>
                <Badge colorScheme="purple" variant="solid">
                  {taskData.generationStrategy === "ai"
                    ? "智能生成"
                    : taskData.generationStrategy === "template"
                      ? "模板填充"
                      : "混合模式"}
                </Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* 任务统计 */}
        <Card>
          <CardBody>
            <Text fontSize="16px" fontWeight="600" color="gray.700" mb={4}>
              📊 将要创建的任务:
            </Text>

            <Grid
              templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}
              gap={6}
            >
              <Stat textAlign="center" p={4} bg="blue.50" borderRadius="md">
                <StatLabel color="blue.600">主任务数量</StatLabel>
                <StatNumber color="blue.700" fontSize="2xl">
                  {stats.totalRoles}
                </StatNumber>
                <StatHelpText color="gray.600">每个角色1个主任务</StatHelpText>
              </Stat>

              <Stat textAlign="center" p={4} bg="green.50" borderRadius="md">
                <StatLabel color="green.600">子任务数量</StatLabel>
                <StatNumber color="green.700" fontSize="2xl">
                  {stats.totalItems}
                </StatNumber>
                <StatHelpText color="gray.600">每个条目1个子任务</StatHelpText>
              </Stat>
            </Grid>
          </CardBody>
        </Card>

        {/* 角色列表预览 */}
        <Card>
          <CardBody>
            <Text fontSize="16px" fontWeight="600" color="gray.700" mb={4}>
              👥 涉及角色:
            </Text>

            <VStack spacing={2} align="stretch">
              {taskData.selectedRoles.map((role) => {
                const selectedItemsCount = role.templates.reduce(
                  (sum, template) =>
                    sum + template.items.filter((item) => item.selected).length,
                  0,
                )

                return (
                  <HStack
                    key={role.id}
                    justify="space-between"
                    p={3}
                    bg="gray.50"
                    borderRadius="md"
                  >
                    <HStack>
                      <Text fontWeight="500">{role.name}</Text>
                      <Badge colorScheme="blue" variant="subtle">
                        {role.ip_name}
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" color="gray.600">
                      {selectedItemsCount}个条目
                    </Text>
                  </HStack>
                )
              })}
            </VStack>
          </CardBody>
        </Card>

        {/* 加载状态 */}
        {createTaskMutation.isPending && (
          <Card bg="yellow.50" borderColor="yellow.200" borderWidth="2px">
            <CardBody>
              <VStack spacing={4}>
                <Text fontWeight="600" color="yellow.700">
                  🚀 正在创建任务...
                </Text>
                <Progress
                  size="lg"
                  isIndeterminate
                  colorScheme="yellow"
                  w="full"
                />
                <Text fontSize="sm" color="gray.600">
                  请稍等，正在为每个角色创建生成任务
                </Text>
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* 警告提示 */}
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <VStack align="start" spacing={1} flex="1">
            <Text fontWeight="600">确认创建任务</Text>
            <Text fontSize="sm" color="gray.600">
              任务创建后将立即开始执行，请确认以上信息无误。
            </Text>
          </VStack>
        </Alert>

        {/* 操作按钮 */}
        <Flex justify="space-between" mt={6}>
          <Button
            leftIcon={<Text>←</Text>}
            onClick={onPrevious}
            variant="outline"
            size="lg"
            px={8}
            isDisabled={createTaskMutation.isPending}
          >
            上一步
          </Button>

          <Button
            leftIcon={<FiPlay />}
            onClick={handleCreateTask}
            colorScheme="green"
            size="lg"
            px={8}
            isLoading={createTaskMutation.isPending}
            loadingText="创建中..."
          >
            确认创建任务
          </Button>
        </Flex>
      </VStack>
    </Box>
  )
}

export default TaskCreationConfirm
