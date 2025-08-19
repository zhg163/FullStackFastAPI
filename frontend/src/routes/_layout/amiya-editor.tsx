import { useCallback, useRef, useEffect } from 'react'
import { 
  Box, 
  Container, 
  Text, 
  VStack, 
  Flex, 
  Grid
} from '@chakra-ui/react'
import { createFileRoute } from '@tanstack/react-router'
import { FiPlus, FiTrash2, FiDownload, FiCopy, FiUpload, FiEye, FiEyeOff } from 'react-icons/fi'
import { Button } from '@/components/ui/button'
import { toaster } from '@/components/ui/toaster'

export const Route = createFileRoute("/_layout/amiya-editor")({
  component: AmiyaEditor,
})

// 性能优化：使用 ref 直接操作 DOM，避免 React 重渲染
export default function AmiyaEditor() {
  const areasRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 高性能的类型解析函数
  const tryParse = useCallback((val: string) => {
    if (val.trim() === "") return ""
    try { 
      return JSON.parse(val) 
    } catch { 
      return val 
    }
  }, [])

  // 显示提示消息
  const showToast = useCallback((message: string) => {
    toaster.create({
      title: message,
      duration: 1400,
    })
  }, [])

  // 创建区域的核心函数
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

    // 区域头部
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
      // 展开当前区域所有子元素
      wrap.querySelectorAll('[style*="display: none"]').forEach((el: any) => {
        if (el.style.cssText.includes('margin-top: 8px')) {
          el.style.display = 'block'
        }
      })
    }
    
    collapseBtn.onclick = () => {
      // 折叠当前区域所有子元素
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

    // 区域主体
    const body = document.createElement('div')
    const node = createPair(key, value, true)
    body.appendChild(node)

    wrap.append(head, body)
    areasRef.current.appendChild(wrap)
    updateOutput()
  }, [])

  // 创建键值对节点 - 核心性能优化函数
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

    // 工具按钮
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

    // 添加视觉分隔符 - 简化格式与右侧JSON保持一致
    const colon = document.createElement('span')
    colon.textContent = ': '
    colon.style.cssText = 'color: #a0aec0; font-size: 12px;'

    row.append(keyInput, colon, primInput, delBtn)
    el.append(row, objBox, arrBox)

    const objTools = document.createElement('div')
    objTools.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;'
    
    // 创建数组项按钮 - 将当前字段设为数组模式
    const addArrayBtn = createButton('+ 数组项', 'ghost')
    addArrayBtn.onclick = () => {
      setMode('array')
      // 不添加任何内容，创建空数组结构
      updateOutput()
    }
    
    objTools.append(addFieldBtn, addArrayBtn)
    el.appendChild(objTools)

    const arrTools = document.createElement('div')
    arrTools.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;'
    
    // 创建原始值按钮 - 只在数组模式下显示
    const addPrimitiveBtn = createButton('+ 原始值', 'ghost')
    addPrimitiveBtn.onclick = () => {
      arrBox.appendChild(createArrayPrimItem())
      updateOutput()
    }
    
    arrTools.append(addPrimitiveBtn, addPrimItemBtn, addObjItemBtn)
    el.appendChild(arrTools)

    // 模式切换函数 - 性能关键
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

    // 事件处理 - 直接切换模式
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

    // 根据初始值初始化
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

    // 保存引用以便后续访问
    ;(el as any)._refs = { keyInput, primInput, objBox, arrBox }
    return el
  }, [])

  // 创建数组原始项
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

  // 创建数组对象项
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

  // 收集数据的高性能函数
  const collectPair = useCallback((el: HTMLElement): any => {
    const refs = (el as any)._refs
    if (!refs) return null

    const { keyInput, primInput, objBox, arrBox } = refs
    const k = keyInput.value || ''
    if (!k) return null

    const objPairs = objBox.querySelectorAll('.amiya-pair')
    
    // 更准确地检测数组项
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
      
      // 处理原始项
      arrPrimItems.forEach((r: any) => {
        const refs = r._refs
        if (refs && refs.input) {
          arr.push(tryParse(refs.input.value))
        }
      })
      
      // 处理对象项
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

  // 构建 JSON - 核心性能函数
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

  // 更新输出 - 性能关键
  const updateOutput = useCallback(() => {
    if (!outputRef.current) return
    
    const data = buildJSON()
    outputRef.current.value = JSON.stringify(data, null, 2)
  }, [buildJSON])

  // 导入对象
  const importObject = useCallback((obj: any) => {
    if (!areasRef.current) return
    
    areasRef.current.innerHTML = ''
    Object.entries(obj as Record<string, any>).forEach(([k, v]) => createArea(k, v))
    updateOutput()
  }, [createArea, updateOutput])

  // 事件处理函数
  const handleAddArea = useCallback(() => {
    createArea()
  }, [createArea])

  const handleExport = useCallback(() => {
    if (!outputRef.current) return
    
    const data = outputRef.current.value
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'data.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleCopy = useCallback(async () => {
    if (!outputRef.current) return
    
    try {
      await navigator.clipboard.writeText(outputRef.current.value)
      showToast('已复制 JSON')
    } catch (err) {
      showToast('复制失败')
    }
  }, [showToast])

  const handleClearAll = useCallback(() => {
    if (!areasRef.current) return
    
    areasRef.current.innerHTML = ''
    updateOutput()
  }, [updateOutput])

  const handleExpandAll = useCallback(() => {
    if (!areasRef.current) return
    
    areasRef.current.querySelectorAll('[style*="display: none"]').forEach((el: any) => {
      if (el.style.cssText.includes('margin-top: 8px')) {
        el.style.display = 'block'
      }
    })
  }, [])

  const handleCollapseAll = useCallback(() => {
    if (!areasRef.current) return
    
    areasRef.current.querySelectorAll('[style*="margin-top: 8px"]').forEach((el: any) => {
      el.style.display = 'none'
    })
  }, [])

  const handleImportFile = useCallback(() => {
    if (!fileInputRef.current) return
    
    const file = fileInputRef.current.files?.[0]
    if (!file) {
      showToast('请选择 JSON 文件')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        importObject(data)
        showToast('导入成功')
      } catch (err) {
        showToast('JSON 解析失败')
      }
    }
    reader.readAsText(file)
  }, [importObject, showToast])

  const handlePasteImport = useCallback(() => {
    const txt = prompt('粘贴 JSON 文本：')
    if (!txt) return
    
    try {
      const data = JSON.parse(txt)
      importObject(data)
      showToast('导入成功')
    } catch (err) {
      showToast('JSON 解析失败')
    }
  }, [importObject, showToast])

  // 初始化
  useEffect(() => {
    updateOutput()
  }, [updateOutput])

  return (
    <Container maxW="7xl" py={6}>
      <VStack gap={6} align="stretch">
        {/* 头部 */}
        <Box
          position="sticky"
          top={0}
          bg="rgba(26, 32, 44, 0.8)"
          backdropFilter="blur(8px)"
          borderBottom="1px solid"
          borderColor="gray.600"
          zIndex={10}
          p={4}
          borderRadius="md"
        >
          <VStack gap={3} align="stretch">
            <Flex gap={2} wrap="wrap">
              <Button onClick={handleAddArea} size="sm">
                <FiPlus /> 添加区域
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                variant="outline" 
                size="sm"
              >
                <FiUpload /> 导入文件
              </Button>
              <Button onClick={handlePasteImport} variant="outline" size="sm">
                粘贴导入
              </Button>
              <Button onClick={handleExpandAll} variant="outline" size="sm">
                <FiEye /> 展开全部
              </Button>
              <Button onClick={handleCollapseAll} variant="outline" size="sm">
                <FiEyeOff /> 折叠全部
              </Button>
              <Button onClick={handleClearAll} variant="outline" size="sm" colorScheme="red">
                <FiTrash2 /> 清空全部
              </Button>
              <Button onClick={handleExport} size="sm">
                <FiDownload /> 导出 JSON
              </Button>
              <Button onClick={handleCopy} variant="outline" size="sm">
                <FiCopy /> 复制 JSON
              </Button>
            </Flex>
          </VStack>
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
            height="70vh"
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
            height="70vh"
            display="flex"
            flexDirection="column"
          >
            <Text fontSize="xs" color="gray.400" mb={2} flexShrink={0}>
              预览会随改动自动更新
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
  )
}
