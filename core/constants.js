// ============================================
// 常量定义
// ============================================
export const EXTENSION_NAME = 'horae';

// Dynamically determine the extension folder name regardless of what the user named it
export let extFolder = 'SillyTavern-Horae';
try {
    const url = new URL(import.meta.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
        extFolder = parts[parts.length - 2];
    }
} catch (e) {
    console.warn('[Horae] Could not dynamically get extension folder, falling back to default', e);
}

export const EXTENSION_FOLDER = `third-party/${extFolder}`;
export const TEMPLATE_PATH = `${EXTENSION_FOLDER}/assets/templates`;
export const VERSION = '1.12.0';

// 配套正则规则（自动注入ST原生正则系统）
export const HORAE_REGEX_RULES = [
    {
        id: 'horae_think_sanitize',
        scriptName: 'Horae - 思维链标签安全化',
        description: '将思维链内的<horae>等标签转为全角括号，防止DOM解析冲突与收束误吞',
        findRegex: '/<(\\/?horae(?:event|rpg|table[^>]*)?)>(?=[\\s\\S]*?<\\/think(?:ing)?>)/gi',
        replaceString: '‹$1›',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: false,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_hide',
        scriptName: 'Horae - 隐藏状态标签',
        description: '隐藏<horae>状态标签，不显示在正文，不发送给AI',
        findRegex: '/(?:<horae>(?:(?!<\\/think(?:ing)?>|<horae>)[\\s\\S])*?<\\/horae>|<!--horae[\\s\\S]*?-->)/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_event_display_only',
        scriptName: 'Horae - 隐藏事件标签',
        description: '隐藏<horaeevent>事件标签的显示，不发送给AI',
        findRegex: '/<horaeevent>(?:(?!<\\/think(?:ing)?>|<horaeevent>)[\\s\\S])*?<\\/horaeevent>/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_table_hide',
        scriptName: 'Horae - 隐藏表格标签',
        description: '隐藏<horaetable>标签，不显示在正文，不发送给AI',
        findRegex: '/<horaetable[:\\uff1a][\\s\\S]*?<\\/horaetable(?:[:\\uff1a][^>]*)?>/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
    {
        id: 'horae_rpg_hide',
        scriptName: 'Horae - 隐藏RPG标签',
        description: '隐藏<horaerpg>标签，不显示在正文，不发送给AI',
        findRegex: '/<horaerpg>(?:(?!<\\/think(?:ing)?>|<horaerpg>)[\\s\\S])*?<\\/horaerpg>/gim',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    },
];

// ============================================
// 默认设置
// ============================================
export const DEFAULT_SETTINGS = {
    uiLanguage: 'auto',
    aiOutputLanguage: 'auto',
    enabled: true,
    autoParse: true,
    injectContext: true,
    showMessagePanel: true,
    contextDepth: 15,
    forgetThreshold: 0.2,
    injectionPosition: 1,
    lastStoryDate: '',
    lastStoryTime: '',
    favoriteNpcs: [],  // 用户标记的星标NPC列表
    pinnedNpcs: [],    // 用户手动标记的重要角色列表（特殊边框）
    // 发送给AI的内容控制
    sendTimeline: true,    // 发送剧情轨迹（关闭则无法计算相对时间）
    sendCharacters: true,  // 发送角色信息（服装、好感度）
    sendItems: true,       // 发送物品栏
    customTables: [],      // 自定义表格 [{id, name, rows, cols, data, prompt}]
    customSystemPrompt: '',      // 自定义系统注入提示词（空=使用默认）
    customBatchPrompt: '',       // 自定义AI摘要提示词（空=使用默认）
    customAnalysisPrompt: '',    // 自定义AI分析提示词（空=使用默认）
    customCompressPrompt: '',    // 自定义剧情压缩提示词（空=使用默认）
    customAutoSummaryPrompt: '', // 自定义自动摘要提示词（空=使用默认；独立于手动压缩）
    aiScanIncludeNpc: false,     // AI摘要是否提取NPC
    aiScanIncludeAffection: false, // AI摘要是否提取好感度
    aiScanIncludeScene: false,    // AI摘要是否提取场景记忆
    aiScanIncludeRelationship: false, // AI摘要是否提取关系网络
    panelWidth: 100,               // 消息面板宽度百分比（50-100）
    panelOffset: 0,                // 消息面板右偏移量（px）
    themeMode: 'dark',             // 插件主题：dark / light / custom-{index}
    customCSS: '',                 // 用户自定义CSS
    customThemes: [],              // 导入的美化主题 [{name, author, variables, css}]
    globalTables: [],              // 全局表格（跨角色卡共享）
    showTopIcon: true,             // 显示顶部导航栏图标
    customTablesPrompt: '',        // 自定义表格填写规则提示词（空=使用默认）
    sendLocationMemory: false,     // 发送场景记忆（地点固定特征描述）
    customLocationPrompt: '',      // 自定义场景记忆提示词（空=使用默认）
    sendRelationships: false,      // 发送关系网络
    sendMood: false,               // 发送情绪/心理状态追踪
    customRelationshipPrompt: '',  // 自定义关系网络提示词（空=使用默认）
    customMoodPrompt: '',          // 自定义情绪追踪提示词（空=使用默认）
    // 自动摘要
    autoSummaryEnabled: false,      // 自动摘要开关
    autoSummaryKeepRecent: 10,      // 保留最近N条消息不压缩
    autoSummaryBufferMode: 'messages', // 'messages' | 'tokens'
    autoSummaryBufferLimit: 20,     // 缓冲阈值（楼层数或Token数）
    autoSummaryBatchMaxMsgs: 50,    // 单次摘要最大消息条数
    autoSummaryBatchMaxTokens: 80000, // 单次摘要最大Token数
    autoSummaryUseCustomApi: false, // 是否使用独立API端点
    autoSummaryApiUrl: '',          // 独立API端点地址（OpenAI兼容）
    autoSummaryApiKey: '',          // 独立API密钥
    autoSummaryModel: '',           // 独立API模型名称
    antiParaphraseMode: false,      // 反转述模式：AI回复时结算上一条USER的内容
    sideplayMode: false,            // 番外/小剧场模式：启用后可标记消息跳过Horae
    // RPG 模式
    rpgMode: false,                 // RPG 模式总开关
    sendRpgBars: true,              // 发送属性条（HP/MP/SP/状态）
    rpgBarsUserOnly: false,         // 属性条仅限主角
    sendRpgSkills: true,            // 发送技能列表
    rpgSkillsUserOnly: false,       // 技能仅限主角
    sendRpgAttributes: true,        // 发送多维属性面板
    rpgAttrsUserOnly: false,        // 属性面板仅限主角
    sendRpgReputation: true,        // 发送声望数据
    rpgReputationUserOnly: false,   // 声望仅限主角
    sendRpgEquipment: false,        // 发送装备栏（可选）
    rpgEquipmentUserOnly: false,    // 装备仅限主角
    sendRpgLevel: false,            // 发送等级/经验值
    rpgLevelUserOnly: false,        // 等级仅限主角
    sendRpgCurrency: false,         // 发送货币系统
    rpgCurrencyUserOnly: false,     // 货币仅限主角
    rpgUserOnly: false,             // RPG全局仅限主角（总开关，联动所有子模块）
    sendRpgStronghold: false,       // 发送据点/基地系统
    rpgBarConfig: [
        { key: 'hp', name: 'HP', color: '#22c55e' },
        { key: 'mp', name: 'MP', color: '#6366f1' },
        { key: 'sp', name: 'SP', color: '#f59e0b' },
    ],
    rpgAttributeConfig: [
        { key: 'str', name: '力量', desc: '物理攻击、负重与近战伤害' },
        { key: 'dex', name: '敏捷', desc: '反射、闪避与远程精准' },
        { key: 'con', name: '体质', desc: '生命力、耐久与抗毒' },
        { key: 'int', name: '智力', desc: '学识、魔法与推理能力' },
        { key: 'wis', name: '感知', desc: '洞察、直觉与意志力' },
        { key: 'cha', name: '魅力', desc: '说服、领导与人格魅力' },
    ],
    rpgAttrViewMode: 'radar',       // 'radar' 或 'text'
    customRpgPrompt: '',            // 自定义RPG提示词（空=默认）
    promptPresets: [],              // 提示词预设存档 [{name, prompts:{system,batch,...}}]
    equipmentTemplates: [           // 装备格位模板
        { name: '人类', slots: [
            { name: '头部', maxCount: 1 }, { name: '躯干', maxCount: 1 }, { name: '手部', maxCount: 1 },
            { name: '腰带', maxCount: 1 }, { name: '下身', maxCount: 1 }, { name: '足部', maxCount: 1 },
            { name: '项链', maxCount: 1 }, { name: '护身符', maxCount: 1 }, { name: '戒指', maxCount: 2 },
        ]},
        { name: '兽人', slots: [
            { name: '头部', maxCount: 1 }, { name: '躯干', maxCount: 1 }, { name: '手部', maxCount: 1 },
            { name: '腰带', maxCount: 1 }, { name: '下身', maxCount: 1 }, { name: '足部', maxCount: 1 },
            { name: '尾部', maxCount: 1 }, { name: '项链', maxCount: 1 }, { name: '戒指', maxCount: 2 },
        ]},
        { name: '翼族', slots: [
            { name: '头部', maxCount: 1 }, { name: '躯干', maxCount: 1 }, { name: '手部', maxCount: 1 },
            { name: '腰带', maxCount: 1 }, { name: '下身', maxCount: 1 }, { name: '足部', maxCount: 1 },
            { name: '翅膀', maxCount: 1 }, { name: '项链', maxCount: 1 }, { name: '戒指', maxCount: 2 },
        ]},
        { name: '人马', slots: [
            { name: '头部', maxCount: 1 }, { name: '躯干', maxCount: 1 }, { name: '手部', maxCount: 1 },
            { name: '腰带', maxCount: 1 }, { name: '马甲', maxCount: 1 }, { name: '马蹄铁', maxCount: 4 },
            { name: '项链', maxCount: 1 }, { name: '戒指', maxCount: 2 },
        ]},
        { name: '拉弥亚', slots: [
            { name: '头部', maxCount: 1 }, { name: '躯干', maxCount: 1 }, { name: '手部', maxCount: 1 },
            { name: '腰带', maxCount: 1 }, { name: '蛇尾饰', maxCount: 1 },
            { name: '项链', maxCount: 1 }, { name: '护身符', maxCount: 1 }, { name: '戒指', maxCount: 2 },
        ]},
        { name: '恶魔', slots: [
            { name: '头部', maxCount: 1 }, { name: '角饰', maxCount: 1 }, { name: '躯干', maxCount: 1 },
            { name: '手部', maxCount: 1 }, { name: '腰带', maxCount: 1 }, { name: '下身', maxCount: 1 },
            { name: '足部', maxCount: 1 }, { name: '翅膀', maxCount: 1 }, { name: '尾部', maxCount: 1 },
            { name: '项链', maxCount: 1 }, { name: '戒指', maxCount: 2 },
        ]},
    ],
    rpgDiceEnabled: false,          // RPG骰子面板
    dicePosX: null,                 // 骰子面板拖拽位置X（null=默认右下角）
    dicePosY: null,                 // 骰子面板拖拽位置Y
    // 教学
    tutorialCompleted: false,       // 新用户导航教学是否已完成
    // 向量记忆
    vectorEnabled: false,
    vectorSource: 'local',             // 'local' = 本地模型, 'api' = 远程 API
    vectorModel: 'Xenova/bge-small-zh-v1.5',
    vectorDtype: 'q8',
    vectorApiUrl: '',                  // OpenAI 兼容 embedding API 地址
    vectorApiKey: '',                  // API 密钥
    vectorApiModel: '',                // 远程 embedding 模型名称
    vectorPureMode: false,             // 纯向量模式（强模型优化，关闭关键词启发式）
    vectorRerankEnabled: false,        // 启用 Rerank 二次排序
    vectorRerankFullText: false,       // Rerank 使用全文而非摘要（需要长上下文模型如 Qwen3-Reranker）
    vectorRerankModel: '',             // Rerank 模型名称
    vectorRerankUrl: '',               // Rerank API 地址（留空则复用 embedding 地址）
    vectorRerankKey: '',               // Rerank API 密钥（留空则复用 embedding 密钥）
    vectorDiffusionEnabled: true,      // 启用记忆图谱扩散 (Graph Diffusion)
    vectorTopK: 5,
    vectorThreshold: 0.72,
    vectorFullTextCount: 3,
    vectorFullTextThreshold: 0.9,
    vectorStripTags: '',
    // BME Engine (Bionic Memory Ecology)
    bmeEnabled: true,                    // BME graph engine master switch
    bmeDiffusionSteps: 2,                // PEDSA max diffusion steps (1-4)
    bmeDiffusionDecay: 0.6,              // PEDSA decay factor per step (0.1-0.9)
    bmeGraphWeight: 0.6,                 // Hybrid score: graph energy weight
    bmeVectorWeight: 0.3,                // Hybrid score: vector similarity weight
    bmeImportanceWeight: 0.1,            // Hybrid score: node importance weight
    
    // --- BME Phase 2 Cognitive Settings ---
    bmeConsolidationEnabled: true,       // Auto-merge overlapping memories
    bmeConsolidationThreshold: 0.85,     // Cosine similarity required to merge
    bmeCompressionEnabled: true,         // Hierarchical summarization
    bmeCompressionFanIn: 5,              // Number of events to compress into 1
    bmeSleepEnabled: true,               // Active forgetting (SleepGate)
    bmeForgetThreshold: 0.5,             // Retention value below which to forget
    bmeScopedMemoryEnabled: true,        // POV vs Objective memory filtering
    bmeStoryTimelineEnabled: true,       // Track story time segments
};
