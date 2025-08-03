import { Box, Circle, Flex, Progress, Text, VStack } from "@chakra-ui/react"
import React from "react"

interface StepInfo {
  id: number
  title: string
  description: string
}

interface StepNavigationProps {
  currentStep: number
  steps: StepInfo[]
  onStepChange: (step: number) => void
}

interface StepIndicatorProps {
  step: number
  title: string
  isActive: boolean
  isCompleted: boolean
  onClick: () => void
}

const StepIndicator = ({
  step,
  title,
  isActive,
  isCompleted,
  onClick,
}: StepIndicatorProps) => {
  return (
    <Flex
      direction="column"
      align="center"
      cursor="pointer"
      onClick={onClick}
      opacity={isActive || isCompleted ? 1 : 0.6}
      transition="all 0.2s"
      _hover={{ opacity: 1 }}
    >
      <Circle
        size="40px"
        bg={isActive ? "blue.500" : isCompleted ? "green.500" : "gray.300"}
        color="white"
        fontWeight="bold"
        fontSize="16px"
        mb={2}
      >
        {step}
      </Circle>
      <Text
        fontSize="14px"
        fontWeight="600"
        color={isActive ? "blue.600" : isCompleted ? "green.600" : "gray.500"}
        textAlign="center"
        maxW="120px"
      >
        {title}
      </Text>
    </Flex>
  )
}

const StepNavigation = ({
  currentStep,
  steps,
  onStepChange,
}: StepNavigationProps) => {
  const progressValue = (currentStep / steps.length) * 100

  return (
    <VStack spacing={4}>
      {/* 进度条 */}
      <Box w="full" px={4}>
        <Progress
          value={progressValue}
          colorScheme="blue"
          size="sm"
          borderRadius="full"
          bg="gray.200"
        />
      </Box>

      {/* 步骤指示器 */}
      <Flex justify="space-between" w="full" px={4}>
        {steps.map((step) => (
          <StepIndicator
            key={step.id}
            step={step.id}
            title={step.title}
            isActive={currentStep === step.id}
            isCompleted={currentStep > step.id}
            onClick={() => onStepChange(step.id)}
          />
        ))}
      </Flex>
    </VStack>
  )
}

export default StepNavigation
