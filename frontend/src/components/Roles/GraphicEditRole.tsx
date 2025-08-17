import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useState, useCallback, useRef, useEffect } from "react"
import {
  Box,
  Button,
  Container,
  VStack,
  Flex,
  Grid,
  Text,
  Spinner,
  Alert,
} from "@chakra-ui/react"
import { FaEdit } from "react-icons/fa"
import { FiPlus, FiTrash2, FiDownload, FiCopy, FiUpload, FiEye, FiEyeOff, FiSave } from "react-icons/fi"

import {
  RolePromptsService,
  type RolePublic,
  type RolePromptCreate,
  type RolePromptUpdate,
} from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"
import { toaster } from "@/components/ui/toaster"
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import { MenuItem } from "../ui/menu"

interface GraphicEditRoleProps {
  role: RolePublic
}

const GraphicEditRole = ({ role }: GraphicEditRoleProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()
  
  // 阿米娅编辑器相关的 refs 和状态
  const areasRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 获取角色的提示词数据
  const { data: rolePromptsData, isLoading } = useQuery({
    queryKey: ["role-prompts", role.id],
    queryFn: () => RolePromptsService.readRolePrompts({ 
      roleId: role.id, 
      isActive: "Y",
      limit: 1 
    }),
    enabled: isOpen,
  })

  // 创建或更新角色提示词的 mutation
  const createMutation = useMutation({
    mutationFn: (data: RolePromptCreate) =>
      RolePromptsService.createRolePrompt({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast("角色JSON数据创建成功")
      queryClient.invalidateQueries({ queryKey: ["role-prompts"] })
      queryClient.invalidateQueries({ queryKey: ["roles"] })
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RolePromptUpdate }) =>
      RolePromptsService.updateRolePrompt({ 
        rolePromptId: id, 
        requestBody: data 
      }),
    onSuccess: () => {
      showSuccessToast("角色JSON数据更新成功")
      queryClient.invalidateQueries({ queryKey: ["role-prompts"] })
      queryClient.invalidateQueries({ queryKey: ["roles"] })
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  // 阿米娅编辑器的函数（从原始组件复制并适配）
  const tryParse = useCallback((val: string) => {
    if (val.trim() === "") return ""
    try { 
      return JSON.parse(val) 
    } catch { 
      return val 
    }
  }, [])

  const showToast = useCallback((message: string) => {
    toaster.create({
      title: message,
      duration: 1400,
    })
  }, [])

  const createArea = useCallback((key = '', value = {}) => {
    if (!areasRef.current) return

    const wrap = document.createElement('div')
    wrap.className = 'amiya-area'
    wrap.style.cssText = `
      border: 1px solid #2d3748;
      border-radius: 12px;
      padding: 12px;
      margin: 12px 0;
      background: #1a202c;
    `

    const head = document.createElement('div')
    head.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;'
    
    const title = document.createElement('span')
    title.textContent = '区域'
    title.style.cssText = 'font-size: 11px; color: #a0aec0;'
    
    const expandBtn = document.createElement('button')
    expandBtn.textContent = '区域展开'
    expandBtn.style.cssText = `
      background: transparent;
      border: 1px solid #4a5568;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      margin-right: 4px;
    `
    
    const collapseBtn = document.createElement('button')
    collapseBtn.textContent = '区域折叠'
    collapseBtn.style.cssText = `
      background: transparent;
      border: 1px solid #4a5568;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      margin-right: 4px;
    `
    
    const delBtn = document.createElement('button')
    delBtn.textContent = '删除区域'
    delBtn.style.cssText = `
      background: transparent;
      border: 1px solid #4a5568;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
    `
    
    expandBtn.onclick = () => {
      wrap.querySelectorAll('[style*="display: none"]').forEach((el: any) => {
        if (el.style.cssText.includes('margin-top: 8px')) {
          el.style.display = 'block'
        }
      })
    }
    
    collapseBtn.onclick = () => {
      wrap.querySelectorAll('[style*="margin-top: 8px"]').forEach((el: any) => {
        if (el.style.cssText.includes('margin-left: 18px')) {
          el.style.display = 'none'
        }
      })
    }
    
    delBtn.onclick = () => {
      wrap.remove()
      updateOutput()
    }

    head.append(title, expandBtn, collapseBtn, delBtn)

    const body = document.createElement('div')
    const node = createPair(key, value, true)
    body.appendChild(node)

    wrap.append(head, body)
    areasRef.current.appendChild(wrap)
    updateOutput()
  }, [])

  const createPair = useCallback((key = '', value: any = '', isRoot = false) => {
    const el = document.createElement('div')
    el.className = 'amiya-pair'
    el.style.cssText = `
      border: 1px dashed #4a5568;
      border-radius: 10px;
      padding: 10px;
      margin: 8px 0;
      background: #171923;
    `

    const row = document.createElement('div')
    row.style.cssText = 'display: flex; gap: 6px; align-items: center; flex-wrap: wrap;'

    const keyInput = document.createElement('input')
    keyInput.placeholder = 'key'
    keyInput.value = key
    keyInput.style.cssText = `
      background: #1a202c;
      border: 1px solid #4a5568;
      color: #e2e8f0;
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 12px;
      min-width: 100px;
    `
    keyInput.oninput = () => updateOutput()

    const primInput = document.createElement('input')
    primInput.placeholder = 'value'
    primInput.style.cssText = keyInput.style.cssText
    primInput.oninput = () => updateOutput()

    const objBox = document.createElement('div')
    objBox.style.cssText = `
      margin-top: 8px;
      margin-left: 18px;
      border-left: 2px solid #2d3748;
      padding-left: 10px;
      display: none;
    `

    const arrBox = document.createElement('div')
    arrBox.style.cssText = objBox.style.cssText

    const createButton = (text: string, className = '') => {
      const btn = document.createElement('button')
      btn.textContent = text
      btn.style.cssText = `
        background: ${className === 'warn' ? '#e53e3e' : className === 'ghost' ? 'transparent' : '#3182ce'};
        border: 1px solid ${className === 'warn' ? '#c53030' : className === 'ghost' ? '#4a5568' : '#2b6cb0'};
        color: #fff;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        margin: 2px;
      `
      return btn
    }

    const addFieldBtn = createButton('+ 字段', 'ghost')
    const addPrimItemBtn = createButton('+ 原始项', 'ghost')
    const addObjItemBtn = createButton('+ 对象项', 'ghost')
    const delBtn = createButton('删除', 'ghost')

    if (isRoot) delBtn.style.display = 'none'

    delBtn.onclick = () => {
      el.remove()
      updateOutput()
    }

    const colon = document.createElement('span')
    colon.textContent = ': '
    colon.style.cssText = 'color: #a0aec0; font-size: 12px;'

    row.append(keyInput, colon, primInput, delBtn)
    el.append(row, objBox, arrBox)

    const objTools = document.createElement('div')
    objTools.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;'
    objTools.appendChild(addFieldBtn)
    el.appendChild(objTools)

    const arrTools = document.createElement('div')
    arrTools.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;'
    arrTools.append(addPrimItemBtn, addObjItemBtn)
    el.appendChild(arrTools)

    const setMode = (mode: 'primitive' | 'object' | 'array') => {
      el.dataset.mode = mode
      if (mode === 'primitive') {
        primInput.style.display = 'inline-block'
        objBox.style.display = 'none'
        arrBox.style.display = 'none'
        objTools.style.display = 'none'
        arrTools.style.display = 'none'
      } else if (mode === 'object') {
        primInput.style.display = 'none'
        objBox.style.display = 'block'
        arrBox.style.display = 'none'
        objTools.style.display = 'flex'
        arrTools.style.display = 'none'
      } else if (mode === 'array') {
        primInput.style.display = 'none'
        objBox.style.display = 'none'
        arrBox.style.display = 'block'
        objTools.style.display = 'none'
        arrTools.style.display = 'flex'
      }
    }

    addFieldBtn.onclick = () => {
      setMode('object')
      objBox.appendChild(createPair())
      updateOutput()
    }

    addPrimItemBtn.onclick = () => {
      setMode('array')
      arrBox.appendChild(createArrayPrimItem())
      updateOutput()
    }

    addObjItemBtn.onclick = () => {
      setMode('array')
      arrBox.appendChild(createArrayObjItem())
      updateOutput()
    }

    if (Array.isArray(value)) {
      setMode('array')
      value.forEach(item => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          arrBox.appendChild(createArrayObjItem(item))
        } else {
          arrBox.appendChild(createArrayPrimItem(item))
        }
      })
    } else if (value && typeof value === 'object') {
      setMode('object')
      Object.entries(value).forEach(([k, v]) => objBox.appendChild(createPair(k, v)))
    } else {
      setMode('primitive')
      primInput.value = (value === null ? 'null' : String(value))
    }

    ;(el as any)._refs = { keyInput, primInput, objBox, arrBox }
    return el
  }, [])

  const createArrayPrimItem = useCallback((v: any = '') => {
    const row = document.createElement('div')
    row.className = 'arr-prim'
    row.style.cssText = 'display: flex; gap: 6px; align-items: center; margin-top: 6px;'
    
    const input = document.createElement('input')
    input.placeholder = '值'
    input.style.cssText = `
      background: #1a202c;
      border: 1px solid #4a5568;
      color: #e2e8f0;
      border-radius: 6px;
      padding: 4px 6px;
      font-size: 12px;
      flex: 1;
    `
    if (v !== undefined) {
      input.value = (v === null ? 'null' : String(v))
    }
    input.oninput = () => updateOutput()

    const delBtn = document.createElement('button')
    delBtn.textContent = '删除'
    delBtn.style.cssText = `
      background: transparent;
      border: 1px solid #4a5568;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
    `
    delBtn.onclick = () => {
      row.remove()
      updateOutput()
    }

    row.append(input, delBtn)
    ;(row as any)._refs = { input }
    return row
  }, [])

  const createArrayObjItem = useCallback((obj: any = {}) => {
    const box = document.createElement('div')
    box.className = 'arr-obj'
    box.style.cssText = `
      border: 1px dashed #4a5568;
      border-radius: 10px;
      padding: 10px;
      margin: 8px 0;
      background: #171923;
    `

    const fields = document.createElement('div')
    fields.style.cssText = 'margin-left: 10px; display: block;'

    const tools = document.createElement('div')
    tools.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;'

    const addBtn = document.createElement('button')
    addBtn.textContent = '+ 字段'
    addBtn.style.cssText = `
      background: transparent;
      border: 1px solid #4a5568;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
    `

    const delBtn = document.createElement('button')
    delBtn.textContent = '删除对象'
    delBtn.style.cssText = addBtn.style.cssText

    addBtn.onclick = () => {
      fields.appendChild(createPair())
      updateOutput()
    }

    delBtn.onclick = () => {
      box.remove()
      updateOutput()
    }

    tools.append(addBtn, delBtn)

    box.append(fields, tools)
    Object.entries(obj).forEach(([k, v]) => fields.appendChild(createPair(k, v)))
    return box
  }, [])

  const collectPair = useCallback((el: HTMLElement): any => {
    const refs = (el as any)._refs
    if (!refs) return null

    const { keyInput, primInput, objBox, arrBox } = refs
    const k = keyInput.value || ''
    if (!k) return null

    const objPairs = objBox.querySelectorAll('.amiya-pair')
    const arrPrimItems = arrBox.querySelectorAll('.arr-prim')
    const arrObjItems = arrBox.querySelectorAll('.arr-obj')

    if (objPairs.length > 0) {
      const obj: any = {}
      objPairs.forEach((p: any) => {
        const ent = collectPair(p)
        if (ent) Object.assign(obj, ent)
      })
      return { [k]: obj }
    } else if (arrPrimItems.length > 0 || arrObjItems.length > 0) {
      const arr: any[] = []
      
      arrPrimItems.forEach((r: any) => {
        const refs = r._refs
        if (refs && refs.input) {
          arr.push(tryParse(refs.input.value))
        }
      })
      
      arrObjItems.forEach((o: any) => {
        const tmp: any = {}
        o.querySelectorAll('.amiya-pair').forEach((p: any) => {
          const ent = collectPair(p)
          if (ent) Object.assign(tmp, ent)
        })
        arr.push(tmp)
      })
      
      return { [k]: arr }
    } else {
      return { [k]: tryParse(primInput.value) }
    }
  }, [tryParse])

  const buildJSON = useCallback(() => {
    if (!areasRef.current) return {}
    
    const result: any = {}
    areasRef.current.querySelectorAll('.amiya-area').forEach(area => {
      const rootPair = area.querySelector('.amiya-pair')
      if (rootPair) {
        const ent = collectPair(rootPair as HTMLElement)
        if (ent) Object.assign(result, ent)
      }
    })
    return result
  }, [collectPair])

  const updateOutput = useCallback(() => {
    if (!outputRef.current) return
    
    const data = buildJSON()
    outputRef.current.value = JSON.stringify(data, null, 2)
  }, [buildJSON])

  const importObject = useCallback((obj: any) => {
    if (!areasRef.current) return
    
    areasRef.current.innerHTML = ''
    Object.entries(obj as Record<string, any>).forEach(([k, v]) => createArea(k, v))
    updateOutput()
  }, [createArea, updateOutput])

  const handleAddArea = useCallback(() => {
    createArea()
  }, [createArea])

  const handleClearAll = useCallback(() => {
    if (!areasRef.current) return
    
    areasRef.current.innerHTML = ''
    updateOutput()
  }, [updateOutput])

  const handleSave = useCallback(() => {
    if (!outputRef.current) return
    
    try {
      const jsonData = JSON.parse(outputRef.current.value)
      const existingPrompt = rolePromptsData?.data[0]
      
      if (existingPrompt) {
        // 更新现有的提示词
        updateMutation.mutate({
          id: existingPrompt.id,
          data: {
            role_id: role.id,
            version: existingPrompt.version + 1,
            user_prompt: jsonData,
            is_active: "Y"
          }
        })
      } else {
        // 创建新的提示词
        createMutation.mutate({
          role_id: role.id,
          version: 1,
          user_prompt: jsonData,
          is_active: "Y"
        })
      }
    } catch (err) {
      showToast('JSON 格式错误，请检查后重试')
    }
  }, [role.id, rolePromptsData, createMutation, updateMutation, showToast])

  // 当对话框打开且数据加载完成时，导入现有的JSON数据
  useEffect(() => {
    if (isOpen && rolePromptsData?.data[0]?.user_prompt) {
      importObject(rolePromptsData.data[0].user_prompt)
    } else if (isOpen && !isLoading) {
      // 如果没有现有数据，显示空编辑器
      if (areasRef.current) {
        areasRef.current.innerHTML = ''
        updateOutput()
      }
    }
  }, [isOpen, rolePromptsData, isLoading, importObject, updateOutput])

  return (
    <DialogRoot open={isOpen} onOpenChange={(e) => setIsOpen(e.open)} size="full">
      <DialogTrigger asChild>
        <MenuItem>
          <FaEdit style={{ marginRight: '8px' }} />
          图形编辑
        </MenuItem>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>图形编辑角色：{role.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <Flex justify="center" align="center" minH="200px">
              <Spinner size="lg" />
              <Text ml={4}>加载角色数据中...</Text>
            </Flex>
          ) : (
            <Container maxW="full" p={0}>
              <VStack gap={4} align="stretch">
                {/* 头部工具栏 */}
                <Box
                  bg="rgba(26, 32, 44, 0.8)"
                  borderBottom="1px solid"
                  borderColor="gray.600"
                  p={4}
                  borderRadius="md"
                >
                  <Flex gap={2} wrap="wrap">
                    <Button onClick={handleAddArea} size="sm">
                      <FiPlus /> 添加区域
                    </Button>
                    <Button onClick={handleClearAll} variant="outline" size="sm" colorScheme="red">
                      <FiTrash2 /> 清空全部
                    </Button>
                    <Button 
                      onClick={handleSave} 
                      size="sm" 
                      colorScheme="green"
                      isLoading={createMutation.isPending || updateMutation.isPending}
                    >
                      <FiSave /> 保存更新
                    </Button>
                  </Flex>
                </Box>

                {/* 主要内容 */}
                <Grid templateColumns={{ base: "1fr", lg: "1.2fr 0.8fr" }} gap={6}>
                  {/* 编辑区域 */}
                  <Box
                    bg="gray.800"
                    border="1px solid"
                    borderColor="gray.600"
                    borderRadius="lg"
                    p={4}
                    height="60vh"
                    display="flex"
                    flexDirection="column"
                  >
                    <Box
                      flex="1"
                      overflowY="auto"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#4a5568 #2d3748'
                      }}
                    >
                      <div ref={areasRef} />
                    </Box>
                  </Box>

                  {/* 预览区域 */}
                  <Box
                    bg="gray.800"
                    border="1px solid"
                    borderColor="gray.600"
                    borderRadius="lg"
                    p={4}
                    height="60vh"
                    display="flex"
                    flexDirection="column"
                  >
                    <Text fontSize="xs" color="gray.400" mb={2} flexShrink={0}>
                      JSON预览（实时更新）
                    </Text>
                    <textarea
                      ref={outputRef}
                      style={{
                        width: '100%',
                        flex: '1',
                        background: '#1a202c',
                        border: '1px solid #4a5568',
                        borderRadius: '8px',
                        color: '#e2e8f0',
                        padding: '12px',
                        fontFamily: 'ui-monospace, Consolas, Menlo, monospace',
                        fontSize: '12px',
                        resize: 'none',
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#4a5568 #2d3748'
                      }}
                      readOnly
                    />
                  </Box>
                </Grid>
              </VStack>
            </Container>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogCloseTrigger asChild>
            <Button variant="outline">关闭</Button>
          </DialogCloseTrigger>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

export default GraphicEditRole
