import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useCallback, useRef, useEffect } from "react"
import {
  Box,
  Button,
  DialogActionTrigger,
  DialogRoot,
  Text,
  Flex,
  VStack,
  HStack,
  Grid,
  Input,
  Badge,
} from "@chakra-ui/react"
import { 
  FiEdit, 
  FiSave,
  FiChevronDown,
  FiChevronRight,
  FiX
} from "react-icons/fi"

import {
  RolePromptsService,
  type RolePromptPublic,
  type RolePromptUpdate,
} from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { toaster } from "@/components/ui/toaster"
import { MenuItem } from "../ui/menu"

interface GraphicEditRolePromptProps {
  prompt: RolePromptPublic
}

interface JsonNode {
  [key: string]: any
}

interface JsonStats {
  nodes: number
  objects: number
  arrays: number
  chars: number
}

type NodeType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'

const GraphicEditRolePrompt = ({ prompt }: GraphicEditRolePromptProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  const [jsonData, setJsonData] = useState<JsonNode>({})
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 更新角色提示词的 mutation
  const updateMutation = useMutation({
    mutationFn: (data: RolePromptUpdate) =>
      RolePromptsService.updateRolePrompt({
        rolePromptId: prompt.id,
        requestBody: data
      }),
    onSuccess: () => {
      showSuccessToast("角色提示词更新成功")
      queryClient.invalidateQueries({ queryKey: ["rolePrompts"] })
      setIsOpen(false)
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  // 获取数据类型
  const getType = useCallback((value: any): NodeType => {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    return typeof value as NodeType
  }, [])

  // 计算统计信息
  const getStats = useCallback((data: any): JsonStats => {
    const stats: JsonStats = { nodes: 0, objects: 0, arrays: 0, chars: 0 }
    
    const count = (obj: any) => {
      if (obj === null || obj === undefined) {
        stats.nodes++
        return
      }
      
      if (Array.isArray(obj)) {
        stats.arrays++
        stats.nodes++
        obj.forEach(count)
      } else if (typeof obj === 'object') {
        stats.objects++
        stats.nodes++
        Object.values(obj).forEach(count)
      } else {
        stats.nodes++
      }
    }
    
    count(data)
    stats.chars = JSON.stringify(data).length
    return stats
  }, [])

  // 解析路径
  const resolvePath = useCallback((path: string, data: JsonNode) => {
    if (path === 'root') return { val: data, parent: null, key: null }

    const keys = path
      .replace(/^root\.?/, '')
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')

    let current: any = data

    for (let i = 0; i < keys.length - 1; i++) {
      if (current == null) {
        return { val: undefined, parent: null, key: keys[keys.length - 1] }
      }
      current = current[keys[i]]
    }

    const finalKey = keys[keys.length - 1]
    if (current == null) {
      return { val: undefined, parent: null, key: finalKey }
    }

    return {
      val: current[finalKey],
      parent: current,
      key: finalKey,
    }
  }, [])

  // 设置值
  const setValue = useCallback((path: string, value: any) => {
    if (path === 'root') {
      setJsonData(value)
      return
    }
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      const { parent, key } = resolvePath(path, newData)
      if (parent && key !== null) {
        parent[key] = value
      }
      return newData
    })
  }, [resolvePath])

  // 删除节点
  const deleteNode = useCallback((path: string) => {
    try {
      setJsonData(prev => {
        const newData = JSON.parse(JSON.stringify(prev))
        const { parent, key } = resolvePath(path, newData)

        if (parent != null && key !== null) {
          if (Array.isArray(parent)) {
            const index = Number(key)
            if (!Number.isNaN(index)) parent.splice(index, 1)
          } else if (Object.prototype.hasOwnProperty.call(parent, key as any)) {
            delete parent[key as any]
          }
        }
        return newData
      })

      // 清理折叠状态
      setCollapsedNodes(prev => {
        const newCollapsed = new Set(prev)
        Array.from(newCollapsed).forEach(p => {
          if (p.startsWith(path)) {
            newCollapsed.delete(p)
          }
        })
        return newCollapsed
      })
    } catch {
      // 忽略删除期间的非预期错误，避免阻断交互
    }
  }, [resolvePath])

  // 添加节点
  const addNode = useCallback((path: string, type: NodeType) => {
    const defaultValues = {
      string: '',
      number: 0,
      boolean: true,
      null: null,
      object: {},
      array: []
    }
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      const { val: target } = resolvePath(path, newData)
      
      if (Array.isArray(target)) {
        target.push(defaultValues[type])
      } else if (typeof target === 'object' && target !== null) {
        let key = 'new_key'
        let i = 1
        while (target[key]) {
          key = `new_key_${i++}`
        }
        target[key] = defaultValues[type]
      }
      
      return newData
    })
  }, [resolvePath])

  // 重命名键
  const renameKey = useCallback((parentPath: string, oldKey: string, newKey: string) => {
    if (!newKey.trim() || oldKey === newKey) return
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      const { val: parent } = resolvePath(parentPath, newData)
      
      if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
        if (Object.prototype.hasOwnProperty.call(parent, newKey)) {
          toaster.create({ title: '键名已存在' })
          return prev
        }
        if (!Object.prototype.hasOwnProperty.call(parent, oldKey)) {
          return prev
        }
        
        const newParent: any = {}
        Object.keys(parent).forEach(key => {
          if (key === oldKey) {
            newParent[newKey] = parent[oldKey]
          } else {
            newParent[key] = parent[key]
          }
        })
        
        if (parentPath === 'root') {
          return newParent
        } else {
          const { parent: grandparent, key: parentKey } = resolvePath(parentPath, newData)
          if (grandparent && parentKey !== null) {
            grandparent[parentKey] = newParent
          }
        }
      }
      
      return newData
    })
  }, [resolvePath])

  // 切换折叠状态
  const toggleCollapse = useCallback((path: string) => {
    setCollapsedNodes(prev => {
      const newCollapsed = new Set(prev)
      if (newCollapsed.has(path)) {
        newCollapsed.delete(path)
      } else {
        newCollapsed.add(path)
      }
      return newCollapsed
    })
  }, [])

  // 全部展开
  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set())
  }, [])

  // 全部折叠
  const collapseAll = useCallback(() => {
    const getAllPaths = (data: any, path = 'root'): string[] => {
      const paths: string[] = []
      
      if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data)) {
          data.forEach((item, index) => {
            const itemPath = `${path}[${index}]`
            if (typeof item === 'object' && item !== null) {
              paths.push(itemPath)
              paths.push(...getAllPaths(item, itemPath))
            }
          })
        } else {
          Object.entries(data).forEach(([key, value]) => {
            const itemPath = `${path}.${key}`
            if (typeof value === 'object' && value !== null) {
              paths.push(itemPath)
              paths.push(...getAllPaths(value, itemPath))
            }
          })
        }
      }
      
      return paths
    }
    
    const allPaths = getAllPaths(jsonData)
    setCollapsedNodes(new Set(allPaths))
  }, [jsonData])

  // 清空全部
  const clearAll = useCallback(() => {
    if (confirm('确定要清空所有数据吗？此操作不可撤销。')) {
      setJsonData({})
      setCollapsedNodes(new Set())
      toaster.create({ title: '数据已清空' })
    }
  }, [])

  // 导入JSON
  const importJson = useCallback(() => {
    if (!fileInputRef.current) return
    
    const file = fileInputRef.current.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = e.target?.result
        if (typeof result === 'string') {
          const data = JSON.parse(result)
          setJsonData(data)
          setCollapsedNodes(new Set())
          toaster.create({ title: '导入成功' })
        }
      } catch (error) {
        toaster.create({ title: 'JSON 解析失败' })
      }
    }
    reader.readAsText(file)
    fileInputRef.current.value = ''
  }, [])

  // 解析输入值
  const parseInput = useCallback((value: string, type: NodeType) => {
    if (type === 'number') return Number(value) || 0
    if (type === 'boolean') return value === 'true'
    if (type === 'null') return null
    return value
  }, [])

  // 渲染空状态
  const renderEmptyState = () => (
    <Box textAlign="center" py={10} color="gray.500">
      <Text mb={6}>暂无数据，开始创建您的 JSON 结构</Text>
      <HStack justify="center" gap={4}>
        <Button
          colorScheme="blue"
          onClick={() => setJsonData({ "new_key": "value" })}
        >
          📦 创建对象 {}
        </Button>
        <Button
          colorScheme="green"
          onClick={() => setJsonData(["item"])}
        >
          📋 创建数组 []
        </Button>
      </HStack>
    </Box>
  )

  // 渲染添加菜单
  const renderAddMenu = (path: string) => (
    <HStack gap={2} mt={2} ml={5}>
      <Button
        size="xs"
        variant="outline"
        onClick={() => addNode(path, 'object')}
      >
        📦 Object
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={() => addNode(path, 'array')}
      >
        📋 Array
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={() => addNode(path, 'string')}
      >
        🔤 String
      </Button>
    </HStack>
  )

  // 渲染值输入框
  const renderValueInput = (value: any, path: string) => {
    const type = getType(value)
    
    return (
      <Input
        size="sm"
        value={String(value)}
        color={
          type === 'string' ? 'green.600' :
          type === 'number' ? 'blue.600' :
          'gray.600'
        }
        onChange={(e) => setValue(path, parseInput(e.target.value, type))}
        bg="transparent"
        border="1px solid transparent"
        _hover={{ border: '1px solid', borderColor: 'gray.300', bg: 'white' }}
        _focus={{ border: '1px solid', borderColor: 'blue.500', bg: 'white' }}
      />
    )
  }

  // 渲染对象节点
  const renderObjectNode = (obj: any, path: string): JSX.Element => {
    const entries = Object.entries(obj as Record<string, any>)
    
    return (
      <Box ml={5} borderLeft="2px solid" borderColor="gray.200" pl={3}>
        {entries.map(([key, value]) => {
          const itemPath = `${path}.${key}`
          const type = getType(value)
          const isCollapsed = collapsedNodes.has(itemPath)
          const isComplex = ['object', 'array'].includes(type)
          
          return (
            <Box key={key} mb={2}>
              <HStack gap={2} align="center">
                {isComplex && (
                  <Button
                    size="xs"
                    variant="ghost"
                    p={0}
                    minW="auto"
                    h="auto"
                    onClick={() => toggleCollapse(itemPath)}
                  >
                    {isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
                  </Button>
                )}
                
                <Input
                  size="sm"
                  value={key}
                  fontWeight="bold"
                  color="purple.600"
                  w="auto"
                  minW="80px"
                  onChange={(e) => renameKey(path, key, e.target.value)}
                  bg="transparent"
                  border="1px solid transparent"
                  _hover={{ border: '1px solid', borderColor: 'gray.300', bg: 'white' }}
                  _focus={{ border: '1px solid', borderColor: 'blue.500', bg: 'white' }}
                />
                
                <Text>:</Text>
                
                {isComplex ? (
                  <Badge colorScheme={type === 'object' ? 'blue' : 'green'}>
                    {type === 'object' ? `{${Object.keys(value as object).length}}` : `[${(value as any[]).length}]`}
                  </Badge>
                ) : (
                  renderValueInput(value, itemPath)
                )}
                
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => deleteNode(itemPath)}
                >
                  <FiX />
                </Button>
              </HStack>
              
              {isComplex && !isCollapsed && (
                <Box mt={2}>
                  {type === 'object' ? 
                    renderObjectNode(value, itemPath) : 
                    renderArrayNode(value as any[], itemPath)
                  }
                </Box>
              )}
            </Box>
          )
        })}
        {renderAddMenu(path)}
      </Box>
    )
  }

  // 渲染数组节点
  const renderArrayNode = (arr: any[], path: string): JSX.Element => {
    return (
      <Box ml={5} borderLeft="2px solid" borderColor="gray.200" pl={3}>
        {arr.map((value, index) => {
          const itemPath = `${path}[${index}]`
          const type = getType(value)
          const isCollapsed = collapsedNodes.has(itemPath)
          const isComplex = ['object', 'array'].includes(type)
          
          return (
            <Box key={index} mb={2}>
              <HStack gap={2} align="center">
                {isComplex && (
                  <Button
                    size="xs"
                    variant="ghost"
                    p={0}
                    minW="auto"
                    h="auto"
                    onClick={() => toggleCollapse(itemPath)}
                  >
                    {isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
                  </Button>
                )}
                
                <Text fontWeight="bold" color="purple.600" minW="20px">
                  {index}:
                </Text>
                
                {isComplex ? (
                  <Badge colorScheme={type === 'object' ? 'blue' : 'green'}>
                    {type === 'object' ? `{${Object.keys(value as object).length}}` : `[${(value as any[]).length}]`}
                  </Badge>
                ) : (
                  renderValueInput(value, itemPath)
                )}
                
                <Button
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  onClick={() => deleteNode(itemPath)}
                >
                  <FiX />
                </Button>
              </HStack>
              
              {isComplex && !isCollapsed && (
                <Box mt={2}>
                  {type === 'object' ? 
                    renderObjectNode(value, itemPath) : 
                    renderArrayNode(value as any[], itemPath)
                  }
                </Box>
              )}
            </Box>
          )
        })}
        {renderAddMenu(path)}
      </Box>
    )
  }

  // 渲染主要内容
  const renderContent = () => {
    const type = getType(jsonData)
    
    if (type === 'object' && Object.keys(jsonData).length === 0) {
      return renderEmptyState()
    }
    
    if (type === 'array' && (jsonData as any[]).length === 0) {
      return renderEmptyState()
    }
    
    if (type === 'object') {
      return renderObjectNode(jsonData, 'root')
    }
    
    if (type === 'array') {
      return renderArrayNode(jsonData as any[], 'root')
    }
    
    return <Text color="red.500">根节点必须是对象或数组</Text>
  }

  // 保存更新功能
  const handleSaveUpdate = useCallback(() => {
    try {
      updateMutation.mutate({
        role_id: prompt.role_id,
        version: prompt.version + 1,
        user_prompt: jsonData,
        is_active: prompt.is_active
      })
    } catch (err) {
      toaster.create({ title: 'JSON 格式错误，请检查编辑器内容' })
    }
  }, [prompt, updateMutation, jsonData])

  // 添加测试数据功能
  const handleAddTestData = useCallback(() => {
    const testData = {
      "basic_info": {
        "name": "测试角色",
        "code_name": "角色代号",
        "gender": "女",
        "race": "千机族",
        "height": "142cm",
        "birthday": "12月23日",
        "birthplace": "雷鸣龙族"
      },
      "battle_experience": ["三年", "五年"],
      "skills": ["技能1", "技能2", "技能3"],
      "personality": "活泼开朗"
    }
    setJsonData(testData)
    setCollapsedNodes(new Set())
    toaster.create({ title: '测试数据已加载' })
  }, [])

  // 当弹窗打开时，加载现有的 JSON 数据
  useEffect(() => {
    if (isOpen) {
      if (prompt.user_prompt && typeof prompt.user_prompt === 'object') {
        setJsonData(prompt.user_prompt)
      } else {
        setJsonData({})
      }
      setCollapsedNodes(new Set())
    }
  }, [isOpen, prompt.user_prompt])

  const stats = getStats(jsonData)

  return (
    <>
      <MenuItem onClick={() => setIsOpen(true)} value="graphic-edit">
        <FiEdit style={{ marginRight: '8px' }} />
        图形编辑
      </MenuItem>

      <DialogRoot size="full" open={isOpen} onOpenChange={({ open }) => setIsOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>图形编辑提示词 - 版本 {prompt.version}</DialogTitle>
          </DialogHeader>

          <DialogBody>
            <VStack gap={4} align="stretch">
              {/* 工具栏 */}
              <Flex gap={4} wrap="wrap" align="center">
                <Button
                  colorScheme="red"
                  onClick={clearAll}
                >
                  🗑️ 清空全部
                </Button>
                
                <Button
                  colorScheme="green"
                  onClick={handleSaveUpdate}
                  loading={updateMutation.isPending}
                >
                  <FiSave style={{ marginRight: '6px' }} />
                  💾 保存更新
                </Button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={importJson}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 导入文件
                </Button>
                
                <Button
                  onClick={expandAll}
                >
                  👁️ 全部展开
                </Button>
                
                <Button
                  onClick={collapseAll}
                >
                  🙈 全部折叠
                </Button>
                
                <Button
                  onClick={handleAddTestData}
                  colorScheme="cyan"
                >
                  加载测试数据
                </Button>

                <Button
                  onClick={() => {
                    console.log('当前jsonData:', jsonData)
                    console.log('当前collapsedNodes:', Array.from(collapsedNodes))
                    alert('调试信息已输出到控制台')
                  }}
                  colorScheme="gray"
                >
                  调试信息
                </Button>
                
                <Text fontSize="sm" color="gray.600" ml="auto">
                  节点: {stats.nodes} | 对象: {stats.objects} | 数组: {stats.arrays} | 字符: {stats.chars}
                </Text>
              </Flex>
              
              {/* 主要内容区 */}
              <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={6} h="70vh">
                {/* 编辑区域 */}
                <Box
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="lg"
                  overflow="hidden"
                >
                  <Box
                    p={3}
                    bg="gray.50"
                    borderBottom="1px solid"
                    borderColor="gray.200"
                    fontWeight="bold"
                  >
                    可视化编辑区
                  </Box>
                  <Box
                    p={4}
                    h="calc(100% - 60px)"
                    overflowY="auto"
                    style={{
                      scrollbarWidth: 'thin'
                    }}
                  >
                    {renderContent()}
                  </Box>
                </Box>
                
                {/* 预览区域 */}
                <Box
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="lg"
                  overflow="hidden"
                >
                  <Box
                    p={3}
                    bg="gray.50"
                    borderBottom="1px solid"
                    borderColor="gray.200"
                    fontWeight="bold"
                  >
                    JSON 实时预览
                  </Box>
                  <Box
                    p={4}
                    h="calc(100% - 60px)"
                    overflowY="auto"
                    style={{
                      scrollbarWidth: 'thin'
                    }}
                  >
                    <Text
                      as="pre"
                      fontSize="sm"
                      fontFamily="Consolas, Monaco, 'Courier New', monospace"
                      whiteSpace="pre-wrap"
                    >
                      {JSON.stringify(jsonData, null, 2)}
                    </Text>
                  </Box>
                </Box>
              </Grid>
            </VStack>
          </DialogBody>

          <DialogFooter>
            <DialogActionTrigger asChild>
              <Button variant="outline">关闭</Button>
            </DialogActionTrigger>
          </DialogFooter>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

export default GraphicEditRolePrompt
