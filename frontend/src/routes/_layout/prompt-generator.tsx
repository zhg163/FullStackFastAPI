import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { FiZap, FiUsers, FiSettings, FiPlay, FiCheck, FiSearch, FiRefreshCcw } from "react-icons/fi"

import {
  RolesService,
  RoleDirsService,
  RoleTemplatesService,
  RoleTemplateItemsService,
  TaskCreatRolePromptsService,
  type TaskCreatRolePromptCreate
} from "@/client"
import type { ApiError } from "@/client/core/ApiError"
import useCustomToast from "@/hooks/useCustomToast"
import { handleError } from "@/utils"

export const Route = createFileRoute("/_layout/prompt-generator")({
  component: PromptGenerator,
})

interface FormData {
  task_name: string
  task_description: string
  strategy: string
  role_ids: number[]
}

const PER_PAGE = 10

// 生成时间戳（时分秒）
function generateTimeStamp(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

// 生成任务名称
function generateTaskName(
  taskName: string,
  timeStamp: string,
  ipName: string,
  roleName: string,
  itemName: string
): string {
  return `${taskName}-${timeStamp}-${ipName}-${roleName}-${itemName}`
}

function PromptGenerator() {
    const [currentStep, setCurrentStep] = useState(1)
  const [selectedRoles, setSelectedRoles] = useState<number[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [deletedItemIds, setDeletedItemIds] = useState<number[]>([])
  const [timeStamp, setTimeStamp] = useState<string>("")
  const [taskCreationProgress, setTaskCreationProgress] = useState<{
    current: number
    total: number
    currentTaskName: string
    isCreating: boolean
  }>({ current: 0, total: 0, currentTaskName: "", isCreating: false })

  // 角色查询相关状态
  const [currentPage, setCurrentPage] = useState(1)
  const [searchName, setSearchName] = useState("")
  const [searchIpId, setSearchIpId] = useState("")
  
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const {
    register,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    mode: "onBlur",
    defaultValues: {
      task_name: "",
      task_description: "",
      strategy: "ai",
      role_ids: [],
    },
  })

  // 获取角色分类列表
  const { data: roleDirsData } = useQuery({
    queryKey: ["roleDirs", "all"],
    queryFn: () => RoleDirsService.readRoleDirs({ skip: 0, limit: 100 }),
  })

  // 获取角色列表（带分页和查询）
  const getRolesQueryParams = () => {
    const params: any = {
      skip: (currentPage - 1) * PER_PAGE,
      limit: PER_PAGE,
    }
    if (searchName.trim()) params.name = searchName.trim()
    if (searchIpId) params.ipId = parseInt(searchIpId)
    return params
  }

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["roles", "prompt-generator", currentPage, searchName, searchIpId],
    queryFn: () => RolesService.readRoles(getRolesQueryParams()),
    placeholderData: (prevData) => prevData,
  })

  // 获取所有角色模版列表
  const { data: roleTemplatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["roleTemplates", "all"],
    queryFn: async () => {
      console.log("查询所有角色模版...")
      const result = await RoleTemplatesService.readRoleTemplates({ 
        skip: 0, 
        limit: 1000
      })
      console.log("所有角色模版查询结果:", result)
      
      return result
    },
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  })

  // 获取选中模版的条目
  const { data: templateItemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ["templateItems", "for-template", selectedTemplateId],
    queryFn: async () => {
      if (!selectedTemplateId) return { data: [], count: 0 }
      console.log("查询模版条目，模版ID:", selectedTemplateId)
      const result = await RoleTemplateItemsService.readRoleTemplateItems({
        skip: 0,
        limit: 1000,
        roleTmpId: selectedTemplateId
      })
      console.log("模版条目查询结果:", result)
      return result
    },
    enabled: !!selectedTemplateId,
    staleTime: 0, // 立即重新获取数据
    gcTime: 0, // 不缓存数据
  })

  // 批量创建任务的mutation
  const createBatchTasksMutation = useMutation({
    mutationFn: async (taskData: { 
      timeStamp: string,
      formData: FormData,
      roles: any[],
      templateItems: any[]
    }) => {
      const { timeStamp, formData, roles, templateItems } = taskData
      
      // 开始创建进度
      setTaskCreationProgress(prev => ({ 
        ...prev, 
        isCreating: true, 
        current: 0, 
        total: roles.length * templateItems.length 
      }))

      const results = []
      let currentTaskIndex = 0

      // 为每个角色和每个条目创建任务
      for (const role of roles) {
        for (const item of templateItems) {
          try {
            const ipName = getIpCategoryName(role.ip_id) || "未知分类"
            const generatedTaskName = generateTaskName(
              formData.task_name || "批量任务",
              timeStamp,
              ipName,
              role.name || `角色${role.id}`,
              item.item_name || `条目${item.id}`
            )

            // 更新当前正在创建的任务
            setTaskCreationProgress(prev => ({
              ...prev,
              current: currentTaskIndex + 1,
              currentTaskName: generatedTaskName
            }))

            const taskCreateData: TaskCreatRolePromptCreate = {
              task_name: generatedTaskName,
              role_id: role.id!,
              task_state: "P", // 待启动
              task_cmd: {
                strategy: formData.strategy || "default",
                description: item.item_prompt_desc || formData.task_description || "",
                timeStamp: timeStamp,
                templateId: selectedTemplateId,
                templateItemId: item.id,
              },
              role_item_prompt: {},
            }

            console.log("正在创建任务:", generatedTaskName, taskCreateData)
            const result = await TaskCreatRolePromptsService.createTaskCreatRolePrompt({ 
              requestBody: taskCreateData 
            })
            console.log("任务创建成功:", result)
            results.push(result)
            currentTaskIndex++

            // 添加小延迟以显示进度
            await new Promise(resolve => setTimeout(resolve, 100))
          } catch (error) {
            console.error(`创建任务失败: ${role.name} - ${item.item_name}`, error)
            console.error("错误详情:", error)
            currentTaskIndex++
          }
        }
      }

      return results
    },
    onSuccess: (results) => {
      showSuccessToast(`批量任务创建成功！共创建 ${results.length} 个任务`)
      setCurrentStep(5) // 跳转到完成步骤
    },
    onError: (err: ApiError) => {
      handleError(err)
      showErrorToast("批量任务创建失败，请稍后重试")
    },
    onSettled: () => {
      setTaskCreationProgress(prev => ({ ...prev, isCreating: false }))
      queryClient.invalidateQueries({ queryKey: ["task-creat-role-prompts"] })
    },
  })

  // 本地删除模版条目（不调用后台接口）
  const handleLocalDeleteItem = (itemId: number) => {
    console.log("本地删除模版条目，条目ID:", itemId)
    setDeletedItemIds(prev => {
      if (prev.includes(itemId)) return prev
      return [...prev, itemId]
    })
    showSuccessToast("条目已从列表中移除！")
    console.log("条目已从页面列表中移除，不调用后台接口")
  }

  // 处理确认创建任务
  const handleConfirmCreateTasks = () => {
    const formData = watch() // 获取表单数据
    
    if (selectedRoles.length === 0) {
      showErrorToast("请至少选择一个角色")
      return
    }

    if (!selectedTemplateId) {
      showErrorToast("请选择模版")
      return
    }

    // 获取有效的模版条目（排除已删除的）
    const visibleItems = templateItemsData?.data?.filter((item: any) => 
      item.id && !deletedItemIds.includes(item.id)
    ) || []

    if (visibleItems.length === 0) {
      showErrorToast("没有可用的模版条目")
      return
    }

    // 获取选中的角色信息
    const selectedRolesList = rolesData?.data?.filter((role: any) => 
      selectedRoles.includes(role.id!)
    ) || []

    if (selectedRolesList.length === 0) {
      showErrorToast("未找到选中的角色信息")
      return
    }

    // 生成时间戳（如果还没有）
    const currentTimeStamp = timeStamp || generateTimeStamp()
    if (!timeStamp) {
      setTimeStamp(currentTimeStamp)
    }

    // 开始批量创建任务
    createBatchTasksMutation.mutate({
      timeStamp: currentTimeStamp,
      formData: formData,
      roles: selectedRolesList,
      templateItems: visibleItems
    })
  }

  // 移除未使用的onSubmit函数，现在使用handleConfirmCreateTasks来处理任务创建

  // 渲染第4步：创建确认页面
  const renderStepConfirmation = () => {
    // 生成时间戳（如果还没有）
    if (!timeStamp) {
      setTimeStamp(generateTimeStamp())
    }

    // 计算任务数量和预览
    const visibleItems = templateItemsData?.data?.filter(item => 
      item.id && !deletedItemIds.includes(item.id)
    ) || []
    const totalTasks = selectedRoles.length * visibleItems.length
    
    // 获取选中的角色和模版信息
    const selectedRolesList = rolesData?.data?.filter(role => 
      selectedRoles.includes(role.id!)
    ) || []
    
    const selectedTemplate = roleTemplatesData?.data?.find(template => 
      template.id === selectedTemplateId
    )

    // 生成任务名称预览（前5个）
    const generateTaskPreviews = () => {
      const previews: string[] = []
      let count = 0
      const currentTimeStamp = timeStamp || generateTimeStamp()
      const formData = watch() // 获取当前表单数据
      
      for (const role of selectedRolesList) {
        if (count >= 5) break
        for (const item of visibleItems) {
          if (count >= 5) break
          const ipName = getIpCategoryName(role.ip_id) || "未知分类"
          const generatedTaskName = generateTaskName(
            formData.task_name || "批量任务",
            currentTimeStamp,
            ipName,
            role.name || `角色${role.id}`,
            item.item_name || `条目${item.id}`
          )
          previews.push(generatedTaskName)
          count++
        }
      }
      return previews
    }

    const taskPreviews = generateTaskPreviews()
    const remainingTasks = Math.max(0, totalTasks - taskPreviews.length)

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* 任务概览 */}
        <div style={{
          padding: "20px",
          backgroundColor: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: "12px"
        }}>
          <h3 style={{ 
            fontSize: "18px", 
            fontWeight: "600", 
            color: "#1E293B", 
            margin: "0 0 16px 0",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            📊 任务创建确认
          </h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "14px", color: "#64748B", marginBottom: "4px" }}>时间戳</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>{timeStamp || generateTimeStamp()}</div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748B", marginBottom: "4px" }}>创建时间</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#1E293B" }}>
                {new Date().toLocaleString('zh-CN')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748B", marginBottom: "4px" }}>任务总数</div>
              <div style={{ fontSize: "20px", fontWeight: "700", color: "#DC2626" }}>{totalTasks} 个</div>
            </div>
            <div>
              <div style={{ fontSize: "14px", color: "#64748B", marginBottom: "4px" }}>预计用时</div>
              <div style={{ fontSize: "16px", fontWeight: "600", color: "#059669" }}>
                约 {Math.ceil(totalTasks * 0.5)} 分钟
              </div>
            </div>
          </div>
        </div>

        {/* 选择汇总 */}
        <div style={{
          padding: "20px",
          backgroundColor: "#FFF7ED",
          border: "1px solid #FED7AA", 
          borderRadius: "12px"
        }}>
          <h4 style={{ 
            fontSize: "16px", 
            fontWeight: "600", 
            color: "#9A3412", 
            margin: "0 0 12px 0" 
          }}>
            📋 选择汇总
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#7C2D12" }}>角色数量：</span>
              <strong style={{ color: "#9A3412" }}>{selectedRoles.length} 个</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#7C2D12" }}>模版名称：</span>
              <strong style={{ color: "#9A3412" }}>
                {selectedTemplate?.template_name || `模版 ${selectedTemplateId}`}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#7C2D12" }}>有效条目：</span>
              <strong style={{ color: "#9A3412" }}>{visibleItems.length} 个</strong>
            </div>
          </div>
        </div>

        {/* 任务预览 */}
        <div style={{
          padding: "20px",
          backgroundColor: "#F0F9FF",
          border: "1px solid #BAE6FD",
          borderRadius: "12px"
        }}>
          <h4 style={{ 
            fontSize: "16px", 
            fontWeight: "600", 
            color: "#0C4A6E", 
            margin: "0 0 12px 0" 
          }}>
            🔍 任务预览 ({taskPreviews.length > 0 ? `显示前${taskPreviews.length}个` : "暂无任务"})
          </h4>
          
          {taskPreviews.length > 0 ? (
            <div>
              <div style={{ marginBottom: "12px" }}>
                {taskPreviews.map((taskName, index) => (
                  <div 
                    key={index}
                    style={{
                      fontSize: "14px",
                      color: "#0F172A",
                      padding: "6px 0",
                      borderBottom: "1px solid #E0F2FE"
                    }}
                  >
                    {index + 1}. {taskName}
                  </div>
                ))}
              </div>
              {remainingTasks > 0 && (
                <div style={{ 
                  fontSize: "14px", 
                  color: "#64748B", 
                  fontStyle: "italic",
                  textAlign: "center",
                  padding: "8px"
                }}>
                  ... 还有 {remainingTasks} 个任务
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              fontSize: "14px", 
              color: "#64748B", 
              textAlign: "center",
              padding: "20px"
            }}>
              没有可预览的任务，请检查角色和模版条目选择
            </div>
          )}
        </div>

        {/* 重要提醒 */}
        <div style={{
          padding: "16px",
          backgroundColor: "#FEF2F2",
          border: "1px solid #FECACA",
          borderRadius: "8px"
        }}>
          <h4 style={{ 
            fontSize: "16px", 
            fontWeight: "600", 
            color: "#B91C1C", 
            margin: "0 0 8px 0" 
          }}>
            ⚠️ 重要提醒
          </h4>
          <ul style={{ margin: "0", paddingLeft: "20px", color: "#7F1D1D" }}>
            <li style={{ marginBottom: "4px" }}>任务创建后将自动开始执行</li>
            <li style={{ marginBottom: "4px" }}>请确保所选角色和条目正确</li>
            <li style={{ marginBottom: "4px" }}>创建过程中请勿关闭页面</li>
          </ul>
        </div>

        {/* 创建进度显示 */}
        {taskCreationProgress.isCreating && (
          <div style={{
            padding: "20px",
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "12px"
          }}>
            <h4 style={{ 
              fontSize: "16px", 
              fontWeight: "600", 
              color: "#166534", 
              margin: "0 0 16px 0",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              🚀 正在创建任务...
            </h4>
            
            {/* 进度条 */}
            <div style={{
              width: "100%",
              height: "12px",
              backgroundColor: "#E5E7EB",
              borderRadius: "6px",
              overflow: "hidden",
              marginBottom: "12px"
            }}>
              <div style={{
                width: `${(taskCreationProgress.current / taskCreationProgress.total) * 100}%`,
                height: "100%",
                backgroundColor: "#10B981",
                borderRadius: "6px",
                transition: "width 0.3s ease"
              }} />
            </div>

            {/* 进度信息 */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px"
            }}>
              <span style={{ 
                fontSize: "14px", 
                fontWeight: "600", 
                color: "#166534" 
              }}>
                {Math.round((taskCreationProgress.current / taskCreationProgress.total) * 100)}% 
                ({taskCreationProgress.current}/{taskCreationProgress.total})
              </span>
              <span style={{ 
                fontSize: "12px", 
                color: "#65A30D" 
              }}>
                预计剩余时间: {Math.max(0, Math.ceil((taskCreationProgress.total - taskCreationProgress.current) * 0.1))} 秒
              </span>
            </div>

            {/* 当前任务 */}
            {taskCreationProgress.currentTaskName && (
              <div>
                <div style={{ fontSize: "12px", color: "#65A30D", marginBottom: "4px" }}>
                  当前正在创建:
                </div>
                <div style={{ 
                  fontSize: "14px", 
                  color: "#166534", 
                  backgroundColor: "#DCFCE7",
                  padding: "8px 12px",
                  borderRadius: "6px"
                }}>
                  {taskCreationProgress.currentTaskName}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 确认操作按钮 */}
        {!taskCreationProgress.isCreating && (
          <div style={{ 
            display: "flex", 
            gap: "12px", 
            justifyContent: "center",
            marginTop: "24px"
          }}>
            <button 
              onClick={() => setCurrentStep(3)}
              style={{
                padding: "12px 24px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                backgroundColor: "white",
                color: "#374151",
                fontSize: "16px",
                cursor: "pointer",
                minWidth: "120px"
              }}
            >
              返回修改
            </button>
            <button 
              onClick={handleConfirmCreateTasks}
              disabled={totalTasks === 0}
              style={{
                padding: "12px 24px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: totalTasks === 0 ? "#D1D5DB" : "#DC2626",
                color: "white",
                fontSize: "16px",
                cursor: totalTasks === 0 ? "not-allowed" : "pointer",
                fontWeight: "600",
                minWidth: "120px"
              }}
            >
              确认创建任务
            </button>
          </div>
        )}
      </div>
    )
  }

  const steps = [
    { number: 1, title: "基础信息", icon: FiSettings },
    { number: 2, title: "选择角色", icon: FiUsers },
    { number: 3, title: "选择模版", icon: FiPlay },
    { number: 4, title: "创建确认", icon: FiZap },
    { number: 5, title: "创建完成", icon: FiCheck },
  ]

  const handleRoleToggle = (roleId: number) => {
    setSelectedRoles(prev => 
      prev.includes(roleId) 
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    )
  }

  // 处理搜索
  const handleSearch = () => {
    setCurrentPage(1)
  }

  // 重置搜索
  const handleReset = () => {
    setSearchName("")
    setSearchIpId("")
    setCurrentPage(1)
  }

  // 当前页全选/取消全选
  const handleSelectCurrentPage = () => {
    const currentPageRoles = rolesData?.data || []
    const currentPageRoleIds = currentPageRoles.map(role => role.id!).filter(id => id)
    const allCurrentSelected = currentPageRoleIds.every(id => selectedRoles.includes(id))
    
    if (allCurrentSelected) {
      // 取消选择当前页所有角色
      setSelectedRoles(prev => prev.filter(id => !currentPageRoleIds.includes(id)))
    } else {
      // 选择当前页所有角色
      setSelectedRoles(prev => {
        const newSelected = [...prev]
        currentPageRoleIds.forEach(id => {
          if (!newSelected.includes(id)) {
            newSelected.push(id)
          }
        })
        return newSelected
      })
    }
  }

  // 按查询条件全选/取消全选
  const handleSelectAllByQuery = async () => {
    try {
      // 获取所有符合查询条件的角色
      const params: any = {
        skip: 0,
        limit: 1000, // 假设最多1000个角色
      }
      if (searchName.trim()) params.name = searchName.trim()
      if (searchIpId) params.ipId = parseInt(searchIpId)
      
      const allRolesData = await RolesService.readRoles(params)
      
      const allRoleIds = allRolesData.data.map(role => role.id!).filter(id => id)
      const allQuerySelected = allRoleIds.every(id => selectedRoles.includes(id))
      
      if (allQuerySelected) {
        // 取消选择所有查询结果
        setSelectedRoles(prev => prev.filter(id => !allRoleIds.includes(id)))
      } else {
        // 选择所有查询结果
        setSelectedRoles(prev => {
          const newSelected = [...prev]
          allRoleIds.forEach(id => {
            if (!newSelected.includes(id)) {
              newSelected.push(id)
            }
          })
          return newSelected
        })
      }
    } catch (error) {
      showErrorToast("获取角色列表失败")
    }
  }

  // 根据IP ID获取IP分类名称
  const getIpCategoryName = (ipId: number | null | undefined) => {
    if (!ipId || !roleDirsData?.data) return "-"
    const roleDir = roleDirsData.data.find(dir => dir.id === ipId)
    return roleDir?.ip || "-"
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <label style={{ 
                display: "block", 
                fontSize: "16px", 
                fontWeight: "600", 
                color: "#374151", 
                marginBottom: "8px" 
              }}>
                任务名称 *
              </label>
              <input
                {...register("task_name", { 
                  required: "请输入任务名称",
                  minLength: { value: 2, message: "任务名称至少2个字符" }
                })}
                placeholder="例如：可莉和胡桃角色提示词批量生成"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "16px",
                  outline: "none",
                }}
              />
              {errors.task_name && (
                <p style={{ color: "#DC2626", fontSize: "14px", marginTop: "4px" }}>
                  {errors.task_name.message}
                </p>
              )}
            </div>

            <div>
              <label style={{ 
                display: "block", 
                fontSize: "16px", 
                fontWeight: "600", 
                color: "#374151", 
                marginBottom: "8px" 
              }}>
                任务描述 (可选)
              </label>
              <textarea
                {...register("task_description")}
                placeholder="描述此次批量生成的目的和要求..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "16px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit"
                }}
              />
              <p style={{ color: "#6B7280", fontSize: "14px", marginTop: "4px" }}>
                可选，描述此次批量生成的目的和要求
              </p>
            </div>


          </div>
        )

      case 2:
        const currentPageRoles = rolesData?.data || []
        const totalCount = rolesData?.count || 0
        const totalPages = Math.ceil(totalCount / PER_PAGE)
        const currentPageRoleIds = currentPageRoles.map(role => role.id!).filter(id => id)
        const allCurrentSelected = currentPageRoleIds.length > 0 && currentPageRoleIds.every(id => selectedRoles.includes(id))
        
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#374151", margin: 0 }}>
              选择需要生成提示词的角色
            </h3>
            
            {/* 查询条件 */}
            <div style={{ 
              padding: "16px", 
              backgroundColor: "#F9FAFB", 
              borderRadius: "8px",
              border: "1px solid #E5E7EB"
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: "500", 
                    color: "#374151", 
                    marginBottom: "4px" 
                  }}>
                    角色名称
                  </label>
                  <input
                    type="text"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    placeholder="输入角色名称"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "6px",
                      fontSize: "14px"
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: "500", 
                    color: "#374151", 
                    marginBottom: "4px" 
                  }}>
                    IP分类
                  </label>
                  <select
                    value={searchIpId}
                    onChange={(e) => setSearchIpId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "6px",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer"
                    }}
                  >
                    <option value="">选择分类</option>
                    {roleDirsData?.data?.map((dir) => (
                      <option key={dir.id} value={dir.id}>
                        {dir.ip}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button
                  onClick={handleSearch}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#3B82F6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "14px"
                  }}
                >
                  <FiSearch size={14} />
                  搜索
                </button>
                
                <button
                  onClick={handleReset}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "white",
                    color: "#374151",
                    border: "1px solid #D1D5DB",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "14px"
                  }}
                >
                  <FiRefreshCcw size={14} />
                  重置
                </button>
              </div>
            </div>

            {/* 全选操作 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={handleSelectCurrentPage}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: allCurrentSelected ? "#EF4444" : "#10B981",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  {allCurrentSelected ? "取消当前页" : "选择当前页"}
                </button>
                
                <button
                  onClick={handleSelectAllByQuery}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "#8B5CF6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px"
                  }}
                >
                  按条件全选
                </button>
              </div>
              
              <p style={{ fontSize: "14px", color: "#6B7280", margin: 0 }}>
                共 {totalCount} 个角色，已选择 {selectedRoles.length} 个
              </p>
            </div>

            {/* 角色列表 */}
            {rolesLoading ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <p>加载角色列表中...</p>
              </div>
            ) : (
              <div style={{ 
                border: "1px solid #E5E7EB", 
                borderRadius: "8px", 
                overflow: "hidden" 
              }}>
                {/* 表头 */}
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "50px 1fr 120px 120px 80px", 
                  backgroundColor: "#F9FAFB", 
                  borderBottom: "1px solid #E5E7EB",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151"
                }}>
                  <div style={{ padding: "12px 8px", textAlign: "center" }}>选择</div>
                  <div style={{ padding: "12px 8px" }}>角色名称</div>
                  <div style={{ padding: "12px 8px" }}>IP分类</div>
                  <div style={{ padding: "12px 8px" }}>来源</div>
                  <div style={{ padding: "12px 8px", textAlign: "center" }}>ID</div>
                </div>
                
                {/* 数据行 */}
                {currentPageRoles.map((role) => (
                  <div 
                    key={role.id}
                    style={{ 
                      display: "grid", 
                      gridTemplateColumns: "50px 1fr 120px 120px 80px", 
                      borderBottom: "1px solid #F3F4F6",
                      fontSize: "14px",
                      backgroundColor: selectedRoles.includes(role.id!) ? "#EFF6FF" : "white",
                      cursor: "pointer",
                      transition: "background-color 0.2s"
                    }}
                    onClick={() => handleRoleToggle(role.id!)}
                  >
                    <div style={{ padding: "12px 8px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.id!)}
                        onChange={() => handleRoleToggle(role.id!)}
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                    <div style={{ padding: "12px 8px", fontWeight: "500" }}>{role.name}</div>
                    <div style={{ padding: "12px 8px", color: "#6B7280" }}>
                      {getIpCategoryName(role.ip_id)}
                    </div>
                    <div style={{ padding: "12px 8px", color: "#6B7280" }}>
                      {role.create_from || "未设置"}
                    </div>
                    <div style={{ padding: "12px 8px", textAlign: "center", color: "#9CA3AF" }}>
                      {role.id}
                    </div>
                  </div>
                ))}
                
                {currentPageRoles.length === 0 && (
                  <div style={{ 
                    textAlign: "center", 
                    padding: "40px", 
                    color: "#6B7280" 
                  }}>
                    暂无角色数据
                  </div>
                )}
              </div>
            )}

            {/* 分页 */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "6px",
                  backgroundColor: currentPage === 1 ? "#F3F4F6" : "white",
                  color: currentPage === 1 ? "#9CA3AF" : "#374151",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer"
                }}
              >
                上一页
              </button>
              
              <span style={{ padding: "0 16px", fontSize: "14px", color: "#6B7280" }}>
                第 {currentPage} 页，共 {totalPages || 1} 页
              </span>
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages || totalPages <= 1}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "6px",
                  backgroundColor: (currentPage === totalPages || totalPages <= 1) ? "#F3F4F6" : "white",
                  color: (currentPage === totalPages || totalPages <= 1) ? "#9CA3AF" : "#374151",
                  cursor: (currentPage === totalPages || totalPages <= 1) ? "not-allowed" : "pointer"
                }}
              >
                下一页
              </button>
            </div>
          </div>
        )

      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", color: "#374151", margin: 0 }}>
              选择角色模版
            </h3>
            
            {/* 模版选择 */}
            <div style={{ 
              padding: "16px", 
              backgroundColor: "#F9FAFB", 
              borderRadius: "8px",
              border: "1px solid #E5E7EB"
            }}>
              <label style={{ 
                display: "block", 
                fontSize: "14px", 
                fontWeight: "500", 
                color: "#374151", 
                marginBottom: "8px" 
              }}>
                选择角色模版
              </label>
              
              {templatesLoading ? (
                <p style={{ color: "#6B7280" }}>加载模版中...</p>
              ) : (
                <div>
                  <select
                    value={selectedTemplateId || ""}
                    onChange={(e) => {
                      const newTemplateId = e.target.value ? parseInt(e.target.value) : null
                      console.log("切换模版，新模版ID:", newTemplateId)
                      setSelectedTemplateId(newTemplateId)
                      // 重置已删除的条目列表
                      setDeletedItemIds([])
                      // 清除旧的模版条目缓存
                      if (newTemplateId) {
                        queryClient.removeQueries({ queryKey: ["templateItems"] })
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "6px",
                      fontSize: "14px",
                      backgroundColor: "white",
                      cursor: "pointer"
                    }}
                  >
                    <option value="">请选择模版</option>
                    {roleTemplatesData?.data?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.template_name || `模版 ${template.id}`}
                        {template.is_active === "N" ? " (未激活)" : ""}
                      </option>
                    ))}
                  </select>
                  
                  {process.env.NODE_ENV === 'development' && (
                    <div style={{ 
                      marginTop: "8px", 
                      fontSize: "12px", 
                      color: "#6B7280",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}>
                      <div>
                        调试信息: 模版总数 {roleTemplatesData?.count || 0}, 
                        数据长度 {roleTemplatesData?.data?.length || 0}
                        {roleTemplatesData?.data?.length === 0 && (
                          <span style={{ color: "#EF4444" }}> - 没有模版数据</span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          console.log("手动刷新角色模版数据")
                          queryClient.invalidateQueries({ queryKey: ["roleTemplates", "all"] })
                        }}
                        style={{
                          padding: "2px 6px",
                          fontSize: "12px",
                          border: "1px solid #D1D5DB",
                          borderRadius: "4px",
                          backgroundColor: "white",
                          cursor: "pointer"
                        }}
                      >
                        刷新模版
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              <div style={{ 
                padding: "12px", 
                backgroundColor: "#E0F2FE", 
                borderRadius: "6px", 
                border: "1px solid #0EA5E9",
                marginTop: "8px"
              }}>
                <p style={{ fontSize: "14px", color: "#0369A1", margin: 0 }}>
                  💡 提示：显示所有模版（包括未激活的），选择模版后将显示该模版下的所有条目，您可以删除不需要的条目
                </p>
              </div>
            </div>

            {/* 模版条目列表 */}
            {selectedTemplateId && (
              <div style={{ 
                border: "1px solid #E5E7EB", 
                borderRadius: "8px", 
                overflow: "hidden" 
              }}>
                <div style={{ 
                  padding: "12px 16px", 
                  backgroundColor: "#F9FAFB", 
                  borderBottom: "1px solid #E5E7EB",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "600", color: "#374151", margin: 0 }}>
                    模版条目
                  </h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                      <span style={{ fontSize: "14px", color: "#6B7280" }}>
                    {(() => {
                      const totalItems = templateItemsData?.count || 0
                      const visibleItems = totalItems - deletedItemIds.length
                      return `${visibleItems} 个条目`
                    })()} {process.env.NODE_ENV === 'development' && `(模版ID: ${selectedTemplateId}, 删除: ${deletedItemIds.length})`}
                  </span>
                    {process.env.NODE_ENV === 'development' && (
                      <button
                        onClick={() => {
                          console.log("手动刷新模版条目数据")
                          queryClient.invalidateQueries({ queryKey: ["templateItems", "for-template", selectedTemplateId] })
                        }}
                        style={{
                          padding: "2px 6px",
                          fontSize: "12px",
                          border: "1px solid #D1D5DB",
                          borderRadius: "4px",
                          backgroundColor: "white",
                          cursor: "pointer"
                        }}
                      >
                        刷新
                      </button>
                    )}
                  </div>
                </div>
                
                {itemsLoading ? (
                  <div style={{ padding: "20px", textAlign: "center" }}>
                    <p style={{ color: "#6B7280" }}>加载条目中...</p>
                  </div>
                ) : (() => {
                  // 过滤掉已删除的条目
                  const visibleItems = templateItemsData?.data?.filter(item => 
                    item.id && !deletedItemIds.includes(item.id)
                  ) || []
                  
                  return visibleItems.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center" }}>
                      <p style={{ color: "#6B7280" }}>
                        {templateItemsData?.data?.length === 0 
                          ? "该模版暂无条目" 
                          : "所有条目已被移除"
                        }
                      </p>
                    </div>
                  ) : (
                    <div>
                      {visibleItems.map((item) => (
                        <div 
                          key={item.id}
                          style={{ 
                            padding: "12px 16px", 
                            borderBottom: "1px solid #F3F4F6",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                              {item.item_name}
                            </div>
                            {item.item_prompt_desc && (
                              <div style={{ fontSize: "14px", color: "#6B7280" }}>
                                {item.item_prompt_desc}
                              </div>
                            )}
                          </div>
                          
                          <button
                            onClick={() => handleLocalDeleteItem(item.id!)}
                            style={{
                              padding: "4px 8px",
                              backgroundColor: "#EF4444",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "12px"
                            }}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}
            
            {/* 选择统计 */}
            <div style={{ 
              padding: "12px", 
              backgroundColor: "#EFF6FF", 
              borderRadius: "8px", 
              borderLeft: "4px solid #3B82F6" 
            }}>
              <p style={{ fontWeight: "600", color: "#1D4ED8", margin: 0 }}>
                当前选择: {selectedRoles.length} 个角色, {selectedTemplateId ? "1 个模版" : "未选择模版"}
              </p>
              {selectedTemplateId && templateItemsData && (
                <p style={{ fontSize: "14px", color: "#6B7280", margin: "4px 0 0 0" }}>
                  模版包含 {(() => {
                    const totalItems = templateItemsData.count || 0
                    const visibleItems = totalItems - deletedItemIds.length
                    return `${visibleItems} 个可用条目`
                  })()} 
                  {process.env.NODE_ENV === 'development' && ` (原始: ${templateItemsData.count || 0}, 删除: ${deletedItemIds.length})`}
                </p>
              )}
            </div>
          </div>
        )

      case 4:
        return renderStepConfirmation()

      case 5:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <FiCheck size={48} color="#10B981" />
              <h2 style={{ fontSize: "24px", color: "#059669", margin: "16px 0 8px 0" }}>
                任务创建成功！
              </h2>
              <p style={{ color: "#6B7280", margin: 0 }}>
                已为 {selectedRoles.length} 个角色创建生成任务
              </p>
            </div>
            
            <div style={{ 
              padding: "16px", 
              backgroundColor: "#ECFDF5", 
              borderRadius: "8px", 
              width: "100%" 
            }}>
              <p style={{ fontWeight: "600", color: "#059669", margin: "0 0 8px 0" }}>
                下一步操作
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <p style={{ fontSize: "14px", margin: 0 }}>• 前往"任务管理"页面查看任务进度</p>
                <p style={{ fontSize: "14px", margin: 0 }}>• 任务完成后可在"角色提示词"页面查看结果</p>
                <p style={{ fontSize: "14px", margin: 0 }}>• 可继续创建新的批量生成任务</p>
              </div>
            </div>
            
            <div style={{ display: "flex", gap: "12px" }}>
              <button 
                onClick={() => {
                  setCurrentStep(1)
                  setSelectedRoles([])
                  setSelectedTemplateId(null)
                  setDeletedItemIds([])
                  setTimeStamp("")
                  setTaskCreationProgress({ current: 0, total: 0, currentTaskName: "", isCreating: false })
                }}
                style={{
                  padding: "12px 24px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  backgroundColor: "white",
                  color: "#374151",
                  fontSize: "16px",
                  cursor: "pointer"
                }}
              >
                创建新任务
              </button>
              <button 
                onClick={() => window.location.href = "/task-creat-role-prompts"}
                style={{
                  padding: "12px 24px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: "#3B82F6",
                  color: "white",
                  fontSize: "16px",
                  cursor: "pointer"
                }}
              >
                查看任务管理
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {/* 页面标题 */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ 
            fontSize: "32px", 
            fontWeight: "bold", 
            margin: "0 0 8px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }}>
            <FiZap size={32} />
            批量生成提示词任务
          </h1>
          <p style={{ color: "#6B7280", fontSize: "18px", margin: 0 }}>
            创建和管理AI角色提示词生成任务
          </p>
        </div>

        {/* 步骤导航 */}
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "16px" }}>
          {steps.map((step) => (
            <div
              key={step.number}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: currentStep >= step.number ? "#3B82F6" : "#E5E7EB",
                color: currentStep >= step.number ? "white" : "#6B7280",
                minWidth: "140px",
                justifyContent: "center"
              }}
            >
              <step.icon size={16} />
              <span style={{ fontWeight: "600", fontSize: "14px" }}>
                {step.number}. {step.title}
              </span>
            </div>
          ))}
        </div>

        {/* 步骤内容 */}
        <div style={{
          backgroundColor: "white",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "32px",
          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)"
        }}>
          {renderStepContent()}
        </div>

        {/* 操作按钮 */}
        {currentStep < 4 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
              style={{
                padding: "12px 24px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                backgroundColor: currentStep === 1 ? "#F3F4F6" : "white",
                color: currentStep === 1 ? "#9CA3AF" : "#374151",
                fontSize: "16px",
                cursor: currentStep === 1 ? "not-allowed" : "pointer"
              }}
            >
              上一步
            </button>
            
            <button
              onClick={() => {
                // 所有步骤都是"下一步"逻辑，不在这里处理任务创建
                setCurrentStep(currentStep + 1)
              }}
              disabled={
                (currentStep === 1 && !watch("task_name")) ||
                (currentStep === 2 && selectedRoles.length === 0) ||
                (currentStep === 3 && !selectedTemplateId)
              }
              style={{
                padding: "12px 24px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: 
                  (currentStep === 1 && !watch("task_name")) ||
                  (currentStep === 2 && selectedRoles.length === 0) ||
                  (currentStep === 3 && !selectedTemplateId)
                    ? "#D1D5DB" : "#3B82F6",
                color: "white",
                fontSize: "16px",
                cursor: 
                  (currentStep === 1 && !watch("task_name")) ||
                  (currentStep === 2 && selectedRoles.length === 0) ||
                  (currentStep === 3 && !selectedTemplateId)
                    ? "not-allowed" : "pointer"
              }}
            >
              下一步
            </button>
          </div>
        )}
      </div>
    </div>
  )
}