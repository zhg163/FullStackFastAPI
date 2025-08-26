import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Box,
  Button,
  Flex,
  Grid,
  Text,
  Input,
  VStack,
  HStack,
  Code,
  Badge,
  IconButton,
} from "@chakra-ui/react"
import {
  FiPlus,
  FiChevronDown,
  FiChevronRight,
  FiTrash2,
  FiDownload,
  FiUpload,
  FiMaximize2,
  FiMinimize2,
} from "react-icons/fi"

export interface JsonNode {
  [key: string]: any
}

interface JsonStats {
  nodes: number
  objects: number
  arrays: number
  chars: number
}

interface VisualJSONEditorProps {
  initialData?: JsonNode
  onSave?: (data: JsonNode) => void
  readOnly?: boolean
}

const VisualJSONEditor: React.FC<VisualJSONEditorProps> = ({
  initialData = {},
  onSave,
  readOnly = false
}) => {
  const [jsonData, setJsonData] = useState<JsonNode>(initialData)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 获取数据类型
  const getType = (value: any): string => {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    return typeof value
  }

  // 获取统计信息
  const getStats = useCallback((data: any): JsonStats => {
    const stats = { nodes: 0, objects: 0, arrays: 0, chars: 0 }
    
    const traverse = (obj: any) => {
      if (obj === null || obj === undefined) {
        stats.nodes++
        return
      }
      
      if (Array.isArray(obj)) {
        stats.arrays++
        stats.nodes++
        obj.forEach(traverse)
      } else if (typeof obj === 'object') {
        stats.objects++
        stats.nodes++
        Object.values(obj).forEach(traverse)
      } else {
        stats.nodes++
      }
    }
    
    traverse(data)
    stats.chars = JSON.stringify(data).length
    return stats
  }, [])

  const stats = getStats(jsonData)

  // 路径解析
  const resolvePath = (path: string) => {
    if (path === 'root') return jsonData
    
    const keys = path.replace('root.', '').split(/[\.\[\]]/).filter(Boolean)
    let current = jsonData
    
    for (const key of keys) {
      if (current == null) return undefined
      current = current[key]
    }
    
    return current
  }

  // 设置值
  const setValue = useCallback((path: string, value: any) => {
    if (readOnly) return
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      
      if (path === 'root') {
        return value
      }
      
      const keys = path.replace('root.', '').split(/[\.\[\]]/).filter(Boolean)
      let current = newData
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      return newData
    })
  }, [readOnly])

  // 删除节点
  const deleteNode = useCallback((path: string) => {
    if (readOnly) return
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      const keys = path.replace('root.', '').split(/[\.\[\]]/).filter(Boolean)
      let current = newData
      
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]]
      }
      
      const lastKey = keys[keys.length - 1]
      if (Array.isArray(current)) {
        current.splice(parseInt(lastKey), 1)
      } else {
        delete current[lastKey]
      }
      
      return newData
    })
  }, [readOnly])

  // 添加节点
  const addNode = useCallback((parentPath: string, key: string, value: any) => {
    if (readOnly) return
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      let parent = newData
      
      if (parentPath !== 'root') {
        const keys = parentPath.replace('root.', '').split(/[\.\[\]]/).filter(Boolean)
        for (const k of keys) {
          parent = parent[k]
        }
      }
      
      if (Array.isArray(parent)) {
        parent.push(value)
      } else {
        parent[key] = value
      }
      
      return newData
    })
  }, [readOnly])

  // 重命名键
  const renameKey = useCallback((parentPath: string, oldKey: string, newKey: string) => {
    if (readOnly || !newKey || oldKey === newKey) return
    
    setJsonData(prev => {
      const newData = JSON.parse(JSON.stringify(prev))
      let parent = newData
      
      if (parentPath !== 'root') {
        const keys = parentPath.replace('root.', '').split(/[\.\[\]]/).filter(Boolean)
        for (const k of keys) {
          parent = parent[k]
        }
      }
      
      if (parent[oldKey] !== undefined) {
        parent[newKey] = parent[oldKey]
        delete parent[oldKey]
      }
      
      return newData
    })
  }, [readOnly])

  // 切换折叠
  const toggleCollapse = useCallback((path: string) => {
    setCollapsedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }, [])

  // 全部展开
  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set())
  }, [])

  // 全部折叠
  const collapseAll = useCallback(() => {
    const allPaths = new Set<string>()
    
    const traverse = (obj: any, path: string) => {
      if (obj && typeof obj === 'object') {
        allPaths.add(path)
        Object.entries(obj).forEach(([key, value]) => {
          const newPath = Array.isArray(obj) ? `${path}[${key}]` : `${path}.${key}`
          traverse(value, newPath)
        })
      }
    }
    
    traverse(jsonData, 'root')
    setCollapsedNodes(allPaths)
  }, [jsonData])

  // 清空全部
  const clearAll = useCallback(() => {
    if (readOnly) return
    setJsonData({})
    setCollapsedNodes(new Set())
  }, [readOnly])

  // 导出JSON
  const exportJson = useCallback(() => {
    if (onSave) {
      onSave(jsonData)
      return
    }
    
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'data.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [jsonData, onSave])

  // 导入JSON
  const importJson = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return
    
    const file = event.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        setJsonData(data)
        setCollapsedNodes(new Set())
      } catch (error) {
        console.error('JSON 解析失败:', error)
      }
    }
    reader.readAsText(file)
    
    // 清空input值以便重复选择同一文件
    event.target.value = ''
  }, [readOnly])

  // 解析输入值
  const parseInput = (input: string): any => {
    const trimmed = input.trim()
    if (trimmed === '') return ''
    if (trimmed === 'null') return null
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false
    
    // 尝试解析数字
    const num = Number(trimmed)
    if (!isNaN(num) && isFinite(num)) {
      return num
    }
    
    // 尝试解析JSON
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }

  // 渲染空状态
  const renderEmptyState = () => (
    <Box textAlign="center" py={10} color="gray.500">
      <Text mb={4}>暂无数据，开始创建您的 JSON 结构</Text>
      <HStack justify="center" gap={4}>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={() => setJsonData({ "new_key": "value" })}
          disabled={readOnly}
        >
          创建对象 {}
        </Button>
        <Button
          size="sm"
          colorScheme="green"
          onClick={() => setJsonData([])}
          disabled={readOnly}
        >
          创建数组 []
        </Button>
      </HStack>
    </Box>
  )

  // 渲染添加菜单
  const renderAddMenu = (path: string, nodeType: 'object' | 'array') => {
    if (readOnly) return null
    
    return (
      <Box ml={6} mt={2}>
        <HStack gap={2}>
          {nodeType === 'object' && (
            <Button
              size="xs"
              leftIcon={<FiPlus />}
              onClick={() => addNode(path, `new_key_${Date.now()}`, 'value')}
            >
              字段
            </Button>
          )}
          
          <Button
            size="xs"
            leftIcon={<FiPlus />}
            onClick={() => addNode(path, '', nodeType === 'object' ? {} : [])}
          >
            {nodeType === 'object' ? '对象' : '数组'}
          </Button>
        </HStack>
      </Box>
    )
  }

  // 渲染值输入框
  const renderValueInput = (value: any, path: string) => {
    const displayValue = value === null ? 'null' : String(value)
    
    return (
      <Input
        size="sm"
        value={displayValue}
        onChange={(e) => setValue(path, parseInput(e.target.value))}
        placeholder="输入值"
        isReadOnly={readOnly}
        bg="gray.50"
      />
    )
  }

  // 渲染对象节点
  const renderObjectNode = (obj: Record<string, any>, path: string): React.ReactNode => {
    const isCollapsed = collapsedNodes.has(path)
    
    return (
      <Box key={path}>
        {Object.entries(obj).map(([key, value]) => {
          const childPath = `${path}.${key}`
          const valueType = getType(value)
          
          if (valueType === 'object' || valueType === 'array') {
            return (
              <Box key={key} ml={4} borderLeft="2px solid" borderColor="gray.200" pl={4} py={1}>
                <HStack>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    icon={isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
                    onClick={() => toggleCollapse(childPath)}
                    aria-label="toggle"
                  />
                  
                  <Input
                    size="sm"
                    value={key}
                    onChange={(e) => renameKey(path, key, e.target.value)}
                    fontWeight="bold"
                    color="blue.600"
                    w="auto"
                    minW="100px"
                    isReadOnly={readOnly}
                  />
                  
                  <Badge colorScheme={valueType === 'object' ? 'blue' : 'green'}>
                    {valueType === 'object' 
                      ? `{${Object.keys(value).length}}` 
                      : `[${value.length}]`}
                  </Badge>
                  
                  {!readOnly && (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      icon={<FiTrash2 />}
                      onClick={() => deleteNode(childPath)}
                      aria-label="delete"
                    />
                  )}
                </HStack>
                
                {!isCollapsed && (
                  <Box mt={2}>
                    {valueType === 'object' 
                      ? renderObjectNode(value, childPath)
                      : renderArrayNode(value, childPath)}
                  </Box>
                )}
              </Box>
            )
          } else {
            return (
              <HStack key={key} ml={4} py={1}>
                <Input
                  size="sm"
                  value={key}
                  onChange={(e) => renameKey(path, key, e.target.value)}
                  fontWeight="bold"
                  color="blue.600"
                  w="auto"
                  minW="100px"
                  isReadOnly={readOnly}
                />
                <Text>:</Text>
                <Box flex={1}>
                  {renderValueInput(value, childPath)}
                </Box>
                {!readOnly && (
                  <IconButton
                    size="xs"
                    variant="ghost"
                    colorScheme="red"
                    icon={<FiTrash2 />}
                    onClick={() => deleteNode(childPath)}
                    aria-label="delete"
                  />
                )}
              </HStack>
            )
          }
        })}
        {renderAddMenu(path, 'object')}
      </Box>
    )
  }

  // 渲染数组节点
  const renderArrayNode = (arr: any[], path: string): React.ReactNode => {
    const isCollapsed = collapsedNodes.has(path)
    
    return (
      <Box key={path}>
        {arr.map((value, index) => {
          const childPath = `${path}[${index}]`
          const valueType = getType(value)
          
          if (valueType === 'object' || valueType === 'array') {
            return (
              <Box key={index} ml={4} borderLeft="2px solid" borderColor="gray.200" pl={4} py={1}>
                <HStack>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    icon={isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
                    onClick={() => toggleCollapse(childPath)}
                    aria-label="toggle"
                  />
                  
                  <Text fontWeight="bold" color="purple.600">
                    {index}:
                  </Text>
                  
                  <Badge colorScheme={valueType === 'object' ? 'blue' : 'green'}>
                    {valueType === 'object' 
                      ? `{${Object.keys(value).length}}` 
                      : `[${value.length}]`}
                  </Badge>
                  
                  {!readOnly && (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      colorScheme="red"
                      icon={<FiTrash2 />}
                      onClick={() => deleteNode(childPath)}
                      aria-label="delete"
                    />
                  )}
                </HStack>
                
                {!isCollapsed && (
                  <Box mt={2}>
                    {valueType === 'object' 
                      ? renderObjectNode(value, childPath)
                      : renderArrayNode(value, childPath)}
                  </Box>
                )}
              </Box>
            )
          } else {
            return (
              <HStack key={index} ml={4} py={1}>
                <Text fontWeight="bold" color="purple.600" minW="40px">
                  {index}:
                </Text>
                <Box flex={1}>
                  {renderValueInput(value, childPath)}
                </Box>
                {!readOnly && (
                  <IconButton
                    size="xs"
                    variant="ghost"
                    colorScheme="red"
                    icon={<FiTrash2 />}
                    onClick={() => deleteNode(childPath)}
                    aria-label="delete"
                  />
                )}
              </HStack>
            )
          }
        })}
        {renderAddMenu(path, 'array')}
      </Box>
    )
  }

  // 渲染主要内容
  const renderContent = () => {
    if (Object.keys(jsonData).length === 0 && !Array.isArray(jsonData)) {
      return renderEmptyState()
    }
    
    const rootType = getType(jsonData)
    if (rootType === 'object') {
      return renderObjectNode(jsonData as Record<string, any>, 'root')
    } else if (rootType === 'array') {
      return renderArrayNode(jsonData as any[], 'root')
    } else {
      return (
        <Box textAlign="center" py={4} color="red.500">
          根节点必须是对象或数组
        </Box>
      )
    }
  }

  return (
    <VStack gap={4} align="stretch">
      {/* 工具栏 */}
      <Flex gap={2} wrap="wrap" align="center" justify="space-between">
        <HStack gap={2}>
          {!readOnly && (
            <>
              <Button
                size="sm"
                colorScheme="red"
                leftIcon={<FiTrash2 />}
                onClick={clearAll}
              >
                清空全部
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={importJson}
              />
              <Button
                size="sm"
                leftIcon={<FiUpload />}
                onClick={() => fileInputRef.current?.click()}
              >
                导入文件
              </Button>
            </>
          )}
          
          <Button
            size="sm"
            leftIcon={<FiDownload />}
            onClick={exportJson}
            colorScheme="green"
          >
            {onSave ? '保存更新' : '导出JSON'}
          </Button>
          
          <Button
            size="sm"
            leftIcon={<FiMaximize2 />}
            onClick={expandAll}
          >
            全部展开
          </Button>
          
          <Button
            size="sm"
            leftIcon={<FiMinimize2 />}
            onClick={collapseAll}
          >
            全部折叠
          </Button>
        </HStack>
        
        <Text fontSize="sm" color="gray.600">
          节点: {stats.nodes} | 对象: {stats.objects} | 数组: {stats.arrays} | 字符: {stats.chars}
        </Text>
      </Flex>
      
      {/* 主要内容区 */}
      <Grid templateColumns={{ base: "1fr", lg: "1fr 1fr" }} gap={6} minH="400px">
        {/* 编辑区 */}
        <Box
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          overflow="hidden"
        >
          <Box bg="gray.50" px={4} py={2} borderBottom="1px solid" borderColor="gray.200">
            <Text fontWeight="bold">可视化编辑区</Text>
          </Box>
          <Box p={4} maxH="600px" overflowY="auto">
            {renderContent()}
          </Box>
        </Box>
        
        {/* 预览区 */}
        <Box
          border="1px solid"
          borderColor="gray.200"
          borderRadius="md"
          overflow="hidden"
        >
          <Box bg="gray.50" px={4} py={2} borderBottom="1px solid" borderColor="gray.200">
            <Text fontWeight="bold">JSON 实时预览</Text>
          </Box>
          <Box p={4} maxH="600px" overflowY="auto">
            <Code
              as="pre"
              display="block"
              whiteSpace="pre-wrap"
              fontSize="sm"
              p={0}
              bg="transparent"
            >
              {JSON.stringify(jsonData, null, 2)}
            </Code>
          </Box>
        </Box>
      </Grid>
    </VStack>
  )
}

export default VisualJSONEditor
