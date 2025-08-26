import { useNavigate } from "@tanstack/react-router"
import { FaCode } from "react-icons/fa"
import type { RolePromptPublic } from "@/client"
import { MenuItem } from "../ui/menu"

interface GraphicEditRolePromptProps {
  prompt: RolePromptPublic
}

function GraphicEditRolePrompt({ prompt }: GraphicEditRolePromptProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    // 将提示词数据存储到 sessionStorage，供 amiya-editor 页面使用
    sessionStorage.setItem('editingPrompt', JSON.stringify({
      id: prompt.id,
      user_prompt: prompt.user_prompt,
      role_id: prompt.role_id,
      version: prompt.version
    }))
    
    // 导航到 amiya-editor 页面
    navigate({ to: '/amiya-editor' })
  }

  return (
    <MenuItem value="visual-json-editor" onClick={handleClick}>
      <FaCode style={{ marginRight: '8px' }} />
      可视化编辑器
      </MenuItem>
  )
}

export default GraphicEditRolePrompt