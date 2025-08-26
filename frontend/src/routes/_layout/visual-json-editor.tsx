import { createFileRoute } from '@tanstack/react-router'
import { Container, Heading, Text, VStack } from '@chakra-ui/react'
import VisualJSONEditor from '@/components/JSONEditor/VisualJSONEditor'

function VisualJSONEditorPage() {
  // 示例数据
  const sampleData = {
    "name": "阿米娅",
    "code_name": "AMIYA",
    "profession": "Caster",
    "position": "Melee",
    "tags": ["治疗", "支援"],
    "rarity": 5,
    "cost": 16,
    "block_count": 1,
    "attack_speed": "Standard",
    "arts_damage": true,
    "skills": [
      {
        "name": "Empathic Heal",
        "description": "治疗范围内生命值最低的友方单位，并恢复其技力",
        "sp_cost": 15,
        "duration": 25,
        "skill_type": "Manual Trigger"
      },
      {
        "name": "Chimera",
        "description": "攻击力大幅提升，无法被治疗",
        "sp_cost": 25,
        "duration": 15,
        "skill_type": "Manual Trigger"
      }
    ],
    "stats": {
      "hp": 1122,
      "attack": 378,
      "defense": 126,
      "arts_resistance": 20
    },
    "recruitment": {
      "obtainable": true,
      "headhunting": true,
      "recruitment_pool": false
    }
  }

  const handleSave = (data: any) => {
    console.log('保存的数据:', data)
    // 这里可以添加保存到后端的逻辑
  }

  return (
    <Container maxW="full" py={8}>
      <VStack gap={6} align="stretch">
        <VStack gap={2} align="center">
          <Heading size="lg">可视化 JSON 编辑器</Heading>
          <Text color="gray.600" textAlign="center">
            基于 1.html 完整移植到 React，保留所有原始功能
          </Text>
        </VStack>
        
        <VisualJSONEditor 
          initialData={sampleData}
          onSave={handleSave}
        />
      </VStack>
    </Container>
  )
}

export const Route = createFileRoute('/_layout/visual-json-editor')({
  component: VisualJSONEditorPage,
})
