import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  List,
  ListItem,
  Select,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import React from "react"
import { useForm } from "react-hook-form"

interface TaskBasicInfoData {
  taskName: string
  taskDescription?: string
  generationStrategy: "ai" | "template" | "hybrid"
}

interface TaskBasicInfoProps {
  data: TaskBasicInfoData
  onUpdate: (data: TaskBasicInfoData) => void
  onNext: () => void
}

const TaskBasicInfo = ({ data, onUpdate, onNext }: TaskBasicInfoProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
  } = useForm<TaskBasicInfoData>({
    mode: "onChange",
    defaultValues: data,
  })

  const watchedStrategy = watch("generationStrategy")

  const onSubmit = (formData: TaskBasicInfoData) => {
    onUpdate(formData)
    onNext()
  }

  const getStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case "ai":
        return {
          title: "智能生成 (AI自动生成)",
          description: "完全由AI根据角色信息和模板要求自动生成提示词内容",
          color: "blue",
        }
      case "template":
        return {
          title: "模板填充 (基于现有模板)",
          description: "基于预设模板和规则填充生成提示词内容",
          color: "green",
        }
      case "hybrid":
        return {
          title: "混合模式 (AI+模板)",
          description: "结合模板结构和AI智能生成，平衡质量和效率",
          color: "purple",
        }
      default:
        return {
          title: "请选择生成策略",
          description: "",
          color: "gray",
        }
    }
  }

  const strategyInfo = getStrategyDescription(watchedStrategy)

  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      p={8}
      shadow="sm"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <VStack spacing={6} align="stretch">
          <Text fontSize="20px" fontWeight="700" color="gray.700" mb={2}>
            📝 任务基础信息
          </Text>

          {/* 任务名称 */}
          <FormControl isRequired isInvalid={!!errors.taskName}>
            <FormLabel fontSize="16px" fontWeight="600" color="gray.600">
              任务名称
            </FormLabel>
            <Input
              {...register("taskName", {
                required: "任务名称是必需的",
                minLength: { value: 1, message: "任务名称不能为空" },
                maxLength: { value: 255, message: "任务名称不能超过255个字符" },
              })}
              placeholder="例如：可莉和胡桃角色提示词批量生成"
              size="lg"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px blue.500",
              }}
            />
            <FormHelperText color="gray.500">
              ↳ 例如: "可莉和胡桃角色提示词批量生成"
            </FormHelperText>
            {errors.taskName && (
              <Text color="red.500" fontSize="sm" mt={1}>
                {errors.taskName.message}
              </Text>
            )}
          </FormControl>

          {/* 任务描述 */}
          <FormControl>
            <FormLabel fontSize="16px" fontWeight="600" color="gray.600">
              任务描述
            </FormLabel>
            <Textarea
              {...register("taskDescription")}
              placeholder="可选，描述此次批量生成的目的..."
              rows={4}
              resize="vertical"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px blue.500",
              }}
            />
            <FormHelperText color="gray.500">
              ↳ 可选，描述此次批量生成的目的
            </FormHelperText>
          </FormControl>

          {/* 生成策略 */}
          <FormControl isRequired>
            <FormLabel fontSize="16px" fontWeight="600" color="gray.600">
              生成策略
            </FormLabel>
            <Select
              {...register("generationStrategy", {
                required: "请选择生成策略",
              })}
              size="lg"
              borderColor="gray.300"
              _hover={{ borderColor: "gray.400" }}
              _focus={{
                borderColor: "blue.500",
                boxShadow: "0 0 0 1px blue.500",
              }}
            >
              <option value="ai">智能生成 (AI自动生成)</option>
              <option value="template">模板填充 (基于现有模板)</option>
              <option value="hybrid">混合模式 (AI+模板)</option>
            </Select>

            {/* 策略说明 */}
            {watchedStrategy && (
              <Alert status="info" mt={3} borderRadius="md">
                <AlertIcon />
                <Box>
                  <Text fontWeight="600" color={`${strategyInfo.color}.600`}>
                    {strategyInfo.title}
                  </Text>
                  <Text fontSize="sm" color="gray.600" mt={1}>
                    {strategyInfo.description}
                  </Text>
                </Box>
              </Alert>
            )}

            <Box mt={4} p={4} bg="gray.50" borderRadius="md">
              <Text fontSize="12px" fontWeight="500" color="gray.500" mb={2}>
                策略选项说明:
              </Text>
              <List spacing={1} fontSize="12px" color="gray.500">
                <ListItem>
                  ├─ 智能生成: AI根据角色信息自动创作，创意性强但可能不够稳定
                </ListItem>
                <ListItem>
                  ├─ 模板填充: 基于预设模板填充，稳定性高但创意性有限
                </ListItem>
                <ListItem>└─ 混合模式: 结合两者优势，平衡质量和效率</ListItem>
              </List>
            </Box>
          </FormControl>

          {/* 操作按钮 */}
          <Flex justify="flex-end" mt={6}>
            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              px={8}
              isDisabled={!isValid}
              rightIcon={<Text>→</Text>}
            >
              下一步
            </Button>
          </Flex>
        </VStack>
      </form>
    </Box>
  )
}

export default TaskBasicInfo
