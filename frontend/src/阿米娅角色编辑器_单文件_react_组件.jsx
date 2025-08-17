import React, { useState, useEffect, useRef } from "react";

// 单文件 React 组件：阿米娅角色配置编辑器
// 说明：
// - 使用 Tailwind CSS 类名（不需要额外导入）
// - 默认导出一个可直接挂载到页面的 React 组件
// - 支持分区编辑、数组增删、JSON 导入/导出、实时预览、快捷键（Ctrl/Cmd+S 保存）
// - 生产环境可拆分为多个子组件和后端存储

export default function AmiyaEditor() {
  const defaultData = {
    basic_info: {
      name: "阿米娅",
      code_name: "阿米娅",
      gender: "女",
      race: "卡特斯/奇美拉",
      height: "142cm",
      birthday: "12月23日",
      birthplace: "雷姆必拓",
      battle_experience: "三年",
      infection_status: "体表有源石结晶分布，参照医学检测报告，确认为感染者。",
      description:
        "阿米娅兼具坚韧与温柔，是一位肩负沉重使命的年轻领导者。外表稚嫩却内心强大，她以无私奉献保护他人，甚至不惜牺牲自身来守护团队与理想。",
    },
    role_metadata: {
      expertise: [
        "战术领导",
        "危机处理",
        "团队管理",
        "感染者问题",
        "矿石病研究",
        "源石技艺",
        "战斗指挥",
        "外交谈判",
        "情感疏导",
      ],
      keywords: [
        "罗德岛",
        "源石",
        "战术",
        "领导",
        "感染者",
        "矿石病",
        "整合运动",
        "特蕾西娅",
        "使命",
        "责任",
      ],
      emotions: {
        trust: ["信任", "拜托你了", "相信你"],
        joy: ["喜悦", "太好了", "成功"],
      },
      character_traits: [
        {
          trait: "责任感与使命感",
          description:
            "无论战斗还是日常管理，她始终将队友安全置于首位。在一次危机中，阿米娅独自承受敌方攻击，以自身屏障保护同伴，展现出利他主义与高度忠诚。",
          examples: ["独自承受敌方攻击", "以自身屏障保护同伴"],
        },
      ],
    },
    // ... 省略其余字段以便初始化，实际编辑器会展示所有字段
  };

  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem("amiya_profile_v1");
      return saved ? JSON.parse(saved) : defaultData;
    } catch (e) {
      return defaultData;
    }
  });

  const [activeTab, setActiveTab] = useState("basic");
  const [jsonMode, setJsonMode] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [status, setStatus] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("amiya_profile_v1", JSON.stringify(data));
  }, [data]);

  // 快捷键：Ctrl/Cmd+S 导出 JSON（阻止默认浏览器保存）
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleExport();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJsonMode((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [data]);

  // 通用字段变更器（支持深层路径）
  const updateAtPath = (path, value) => {
    const keys = path.split(".");
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in cur)) cur[k] = {};
        cur = cur[k];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  // 数组增删改辅助
  const pushArray = (path, item) => {
    const arr = getAtPath(path) || [];
    updateAtPath(path, [...arr, item]);
  };
  const removeArrayAt = (path, index) => {
    const arr = getAtPath(path) || [];
    updateAtPath(path, arr.filter((_, i) => i !== index));
  };
  const setArrayAt = (path, index, value) => {
    const arr = getAtPath(path) || [];
    const copy = [...arr];
    copy[index] = value;
    updateAtPath(path, copy);
  };
  const getAtPath = (path) => {
    try {
      return path.split(".").reduce((acc, k) => acc && acc[k], data);
    } catch (e) {
      return undefined;
    }
  };

  // 导出功能
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `amiya_profile_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("已导出 JSON 文件。");
    setTimeout(() => setStatus(""), 2000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setStatus("已复制到剪贴板。");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus("复制失败。");
    }
  };

  const handleImportFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        setData(parsed);
        setStatus("已导入 JSON。");
        setTimeout(() => setStatus(""), 2000);
      } catch (err) {
        setStatus("导入失败：不是合法 JSON。");
      }
    };
    reader.readAsText(file);
  };

  const handleToggleJsonMode = () => {
    setJsonMode((v) => {
      const nv = !v;
      if (nv) setRawJson(JSON.stringify(data, null, 2));
      return nv;
    });
  };

  const handleApplyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJson);
      setData(parsed);
      setJsonMode(false);
      setStatus("已应用 JSON 编辑。");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus("JSON 解析错误，未应用。");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
        {/* 左侧：控制区 */}
        <div className="md:col-span-2 bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold">阿米娅 角色编辑器</h1>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                onClick={() => handleExport()}
              >
                导出 JSON (Ctrl/Cmd+S)
              </button>
              <button
                className="px-3 py-1 rounded border text-sm"
                onClick={() => fileInputRef.current.click()}
              >
                导入 JSON
              </button>
              <input
                type="file"
                accept="application/json"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files[0])}
              />
              <button
                className="px-3 py-1 rounded border text-sm"
                onClick={() => handleCopy()}
              >
                复制 JSON
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              className={`px-3 py-1 rounded ${activeTab === "basic" ? "bg-indigo-500 text-white" : "border"}`}
              onClick={() => setActiveTab("basic")}
            >
              基本信息
            </button>
            <button
              className={`px-3 py-1 rounded ${activeTab === "role" ? "bg-indigo-500 text-white" : "border"}`}
              onClick={() => setActiveTab("role")}
            >
              元数据
            </button>
            <button
              className={`px-3 py-1 rounded ${activeTab === "traits" ? "bg-indigo-500 text-white" : "border"}`}
              onClick={() => setActiveTab("traits")}
            >
              性格与经历
            </button>
            <button
              className={`px-3 py-1 rounded ${activeTab === "json" ? "bg-indigo-500 text-white" : "border"}`}
              onClick={() => setActiveTab("json")}
            >
              快速 JSON
            </button>
          </div>

          <div className="space-y-4">
            {/* Tab: Basic */}
            {activeTab === "basic" && (
              <div>
                <h2 className="text-lg font-medium mb-2">基本信息</h2>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(data.basic_info || {}).map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <label className="text-sm text-gray-600 capitalize mb-1">{k}</label>
                      <input
                        className="border rounded px-2 py-1"
                        value={v}
                        onChange={(e) => updateAtPath(`basic_info.${k}`, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Role metadata (arrays, tags, emotions) */}
            {activeTab === "role" && (
              <div>
                <h2 className="text-lg font-medium mb-2">角色元数据</h2>
                {/* expertise */}
                <div className="mb-4">
                  <label className="text-sm text-gray-600">专长 (expertise)</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(data.role_metadata?.expertise || []).map((item, idx) => (
                      <div key={idx} className="px-2 py-1 rounded bg-gray-100 flex items-center gap-2">
                        <input
                          className="bg-transparent outline-none"
                          value={item}
                          onChange={(e) => setArrayAt('role_metadata.expertise', idx, e.target.value)}
                        />
                        <button className="text-xs text-red-500" onClick={() => removeArrayAt('role_metadata.expertise', idx)}>x</button>
                      </div>
                    ))}
                    <button
                      className="px-2 py-1 border rounded text-sm"
                      onClick={() => pushArray('role_metadata.expertise', '新专长')}
                    >
                      + 添加
                    </button>
                  </div>
                </div>

                {/* keywords (tag-like) */}
                <div className="mb-4">
                  <label className="text-sm text-gray-600">关键词 (keywords)</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(data.role_metadata?.keywords || []).map((item, idx) => (
                      <div key={idx} className="px-2 py-1 rounded bg-gray-100 flex items-center gap-2">
                        <input
                          className="bg-transparent outline-none"
                          value={item}
                          onChange={(e) => setArrayAt('role_metadata.keywords', idx, e.target.value)}
                        />
                        <button className="text-xs text-red-500" onClick={() => removeArrayAt('role_metadata.keywords', idx)}>x</button>
                      </div>
                    ))}
                    <button className="px-2 py-1 border rounded text-sm" onClick={() => pushArray('role_metadata.keywords', '新关键词')}>+ 添加</button>
                  </div>
                </div>

                {/* emotions simple editor (only show keys) */}
                <div className="mb-4">
                  <label className="text-sm text-gray-600">情绪 (emotions)</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {Object.entries(data.role_metadata?.emotions || {}).map(([ek, ev]) => (
                      <div key={ek} className="flex flex-col">
                        <label className="text-xs text-gray-500">{ek}</label>
                        <textarea
                          className="border rounded p-2"
                          rows={3}
                          value={(ev || []).join('\n')}
                          onChange={(e) => updateAtPath(`role_metadata.emotions.${ek}`, e.target.value.split('\n'))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Traits */}
            {activeTab === "traits" && (
              <div>
                <h2 className="text-lg font-medium mb-2">性格与经历</h2>

                <div className="space-y-3">
                  {(data.personality_traits || []).map((trait, idx) => (
                    <div key={idx} className="border rounded p-3 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <input
                            value={trait.trait}
                            onChange={(e) => setArrayAt('personality_traits', idx, { ...trait, trait: e.target.value })}
                            className="w-full font-medium mb-2 px-2 py-1 border rounded"
                            placeholder="特质名称"
                          />
                          <textarea
                            rows={3}
                            value={trait.description}
                            onChange={(e) => setArrayAt('personality_traits', idx, { ...trait, description: e.target.value })}
                            className="w-full px-2 py-1 border rounded"
                          />
                        </div>
                        <div className="ml-3">
                          <button className="text-red-500" onClick={() => removeArrayAt('personality_traits', idx)}>删除</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    className="px-3 py-1 rounded border"
                    onClick={() => pushArray('personality_traits', { trait: '新特质', description: '', examples: [] })}
                  >
                    + 添加特质
                  </button>
                </div>

                {/* current_status editor */}
                <div className="mt-4">
                  <label className="text-sm text-gray-600">当前状态</label>
                  <textarea
                    rows={3}
                    className="w-full border rounded p-2 mt-1"
                    value={data.character_experiences?.current_status || ''}
                    onChange={(e) => updateAtPath('character_experiences.current_status', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Tab: JSON quick edit */}
            {activeTab === "json" && (
              <div>
                <h2 className="text-lg font-medium mb-2">JSON 快速编辑</h2>
                <div className="flex gap-2 mb-2">
                  <button className="px-3 py-1 border rounded" onClick={handleToggleJsonMode}>{jsonMode ? '关闭编辑' : '打开编辑'}</button>
                  <button className="px-3 py-1 border rounded" onClick={() => { setData(defaultData); setStatus('已重置为默认数据。'); setTimeout(()=>setStatus(''),2000); }}>重置默认</button>
                </div>
                {jsonMode ? (
                  <div>
                    <textarea className="w-full h-72 p-2 border rounded font-mono" value={rawJson} onChange={(e) => setRawJson(e.target.value)} />
                    <div className="flex gap-2 mt-2">
                      <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={handleApplyRawJson}>应用 JSON</button>
                      <button className="px-3 py-1 border rounded" onClick={() => setJsonMode(false)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <pre className="bg-gray-100 p-3 rounded max-h-72 overflow-auto font-mono">{JSON.stringify(data, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：实时预览与快捷操作 */}
        <aside className="bg-white rounded-2xl shadow p-4 flex flex-col gap-4">
          <div>
            <h3 className="font-medium">实时预览</h3>
            <div className="mt-2 text-sm text-gray-700">
              <p className="truncate"><strong>名称：</strong>{data.basic_info?.name}</p>
              <p className="truncate"><strong>身份：</strong>{data.role_metadata ? data.role_metadata.keywords?.slice(0,3).join('，') : ''}</p>
              <p className="truncate"><strong>当前状态：</strong>{data.character_experiences?.current_status || '—'}</p>
            </div>
          </div>

          <div>
            <h3 className="font-medium">输出模板 预览</h3>
            <div className="mt-2 text-sm text-gray-700">
              <pre className="bg-black text-white rounded p-2 text-xs">{'『情绪』阿米娅：...【旁白】'}</pre>
            </div>
          </div>

          <div className="mt-auto">
            <div className="flex flex-col gap-2">
              <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={() => { setStatus('已保存到本地（localStorage）。'); localStorage.setItem('amiya_profile_v1', JSON.stringify(data)); setTimeout(()=>setStatus(''),2000); }}>保存到本地</button>
              <button className="px-3 py-2 border rounded" onClick={() => { setData(defaultData); setStatus('已重置为默认数据。'); setTimeout(()=>setStatus(''),2000); }}>重置</button>
            </div>
          </div>

          <div className="text-xs text-gray-500">快捷键：Ctrl/Cmd+S 导出 · Ctrl/Cmd+K 切换 JSON 编辑</div>

          {status && <div className="mt-2 text-sm text-green-600">{status}</div>}
        </aside>
      </div>
    </div>
  );
}
