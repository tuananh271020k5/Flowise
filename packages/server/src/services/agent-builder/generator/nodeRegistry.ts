/**
 * Node Metadata Registry cho Flowise Agentflow V2.
 * Định nghĩa whitelist các node được phép, pinned version theo runtime thực tế,
 * ngăn chặn chèn các node ngoài allowlist hoặc node lỗi thời/không an toàn (PH2-T02).
 */

export interface NodeParamMeta {
    name: string
    type: string
    required?: boolean
    default?: unknown
}

export interface NodeMetadata {
    name: string
    label: string
    type: string
    category: string
    supportedVersions: number[]
    recommendedVersion: number
    color: string
    baseClasses: string[]
    allowedInputs: string[]
    requiredInputs?: string[]
    description: string
}

export interface NodeValidationResult {
    valid: boolean
    nodeName: string
    errors: string[]
}

/**
 * Whitelist các node được phép dùng trong Agentflow V2 runtime.
 * Pinned chặt chẽ theo Flowise Core Apache 2.0 runtime.
 */
export const ALLOWED_AGENTFLOW_NODES: Record<string, NodeMetadata> = {
    llmAgentflow: {
        name: 'llmAgentflow',
        label: 'LLM',
        type: 'LLM',
        category: 'Agent Flows',
        supportedVersions: [1.1],
        recommendedVersion: 1.1,
        color: '#64B5F6',
        baseClasses: ['LLM'],
        description: 'Một bước xử lý văn bản bằng model',
        allowedInputs: [
            'llmModel',
            'llmModelConfig',
            'llmMessages',
            'llmEnableMemory',
            'llmMemoryType',
            'llmUserMessage',
            'llmReturnResponseAs',
            'llmStructuredOutput',
            'llmUpdateState'
        ],
        requiredInputs: ['llmModel']
    },
    retrieverAgentflow: {
        name: 'retrieverAgentflow',
        label: 'Retriever',
        type: 'Retriever',
        category: 'Agent Flows',
        supportedVersions: [1.1],
        recommendedVersion: 1.1,
        color: '#B8BEDD',
        baseClasses: ['Retriever'],
        description: 'Truy xuất các đoạn tài liệu được cấp',
        allowedInputs: ['retrieverKnowledgeDocumentStores', 'retrieverQuery', 'outputFormat', 'retrieverUpdateState'],
        requiredInputs: ['retrieverQuery']
    },
    conditionAgentflow: {
        name: 'conditionAgentflow',
        label: 'Condition',
        type: 'Condition',
        category: 'Agent Flows',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#FFB938',
        baseClasses: ['Condition'],
        description: 'Kiểm tra dữ liệu và rẽ nhánh true/false',
        allowedInputs: ['conditions'],
        requiredInputs: ['conditions']
    },
    startAgentflow: {
        name: 'startAgentflow',
        label: 'Start',
        type: 'Start',
        category: 'Agent Flows',
        supportedVersions: [1.4],
        recommendedVersion: 1.4,
        color: '#7EE787',
        baseClasses: ['Start'],
        allowedInputs: [
            'startInputType',
            'formTitle',
            'formDescription',
            'formInputTypes',
            'startEphemeralMemory',
            'startState',
            'startPersistState'
        ],
        requiredInputs: ['startInputType'],
        description: 'Starting point of the agentflow'
    },
    agentAgentflow: {
        name: 'agentAgentflow',
        label: 'Agent',
        type: 'Agent',
        category: 'Agent Flows',
        supportedVersions: [3.0, 3.1, 3.2],
        recommendedVersion: 3.2,
        color: '#4DD0E1',
        baseClasses: ['Agent'],
        allowedInputs: [
            'agentModel',
            'agentModelConfig',
            'agentKnowledgeDocumentStores',
            'agentKnowledgeVSEmbeddings',
            'agentEnableMemory',
            'agentMemoryType',
            'agentMemoryWindowSize',
            'agentUserMessage',
            'agentReturnResponseAs',
            'agentMessages',
            'agentTools',
            'agentToolsBuiltInOpenAI',
            'agentToolsBuiltInGemini',
            'agentToolsBuiltInAnthropic',
            'agentMemory',
            'agentMaxIterations',
            'agentSystemMessage',
            'agentUpdateState'
        ],
        requiredInputs: ['agentModel'],
        description: 'Dynamically choose and utilize tools during runtime'
    },
    conditionAgentAgentflow: {
        name: 'conditionAgentAgentflow',
        label: 'Condition Agent',
        type: 'ConditionAgent',
        category: 'Agent Flows',
        supportedVersions: [2.0],
        recommendedVersion: 2.0,
        color: '#ff8fab',
        baseClasses: ['ConditionAgent'],
        description: 'Dùng AI đánh giá ngữ cảnh và phân nhánh động theo các kịch bản (B-031)',
        allowedInputs: [
            'conditionAgentModel',
            'conditionAgentModelConfig',
            'conditionAgentInstructions',
            'conditionAgentInput',
            'conditionAgentScenarios',
            'conditionAgentEnableMemory',
            'conditionAgentMemoryType',
            'conditionAgentOverrideSystemPrompt',
            'conditionAgentSystemPrompt'
        ],
        requiredInputs: ['conditionAgentModel', 'conditionAgentInstructions', 'conditionAgentScenarios']
    },
    loopAgentflow: {
        name: 'loopAgentflow',
        label: 'Loop',
        type: 'Loop',
        category: 'Agent Flows',
        supportedVersions: [1.2],
        recommendedVersion: 1.2,
        color: '#FFA07A',
        baseClasses: ['Loop'],
        description: 'Quay vòng lại một bước trước đó với số vòng lặp tối đa an toàn (B-031)',
        allowedInputs: ['loopBackToNode', 'maxLoopCount', 'fallbackMessage', 'loopUpdateState'],
        requiredInputs: ['loopBackToNode', 'maxLoopCount']
    },
    iterationAgentflow: {
        name: 'iterationAgentflow',
        label: 'Iteration',
        type: 'Iteration',
        category: 'Agent Flows',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#9C89B8',
        baseClasses: ['Iteration'],
        description: 'Thực thi lặp qua từng phần tử của danh sách đầu vào (B-031)',
        allowedInputs: ['iterationInput'],
        requiredInputs: ['iterationInput']
    },
    httpAgentflow: {
        name: 'httpAgentflow',
        label: 'HTTP',
        type: 'HTTP',
        category: 'Agent Flows',
        supportedVersions: [1.1],
        recommendedVersion: 1.1,
        color: '#FF7F7F',
        baseClasses: ['HTTP'],
        description: 'Gửi truy vấn HTTP tới kết nối API đã cấp phép của Workspace (B-031)',
        allowedInputs: ['method', 'url', 'headers', 'queryParams', 'bodyType', 'body', 'responseType'],
        requiredInputs: ['method', 'url']
    },
    humanInputAgentflow: {
        name: 'humanInputAgentflow',
        label: 'Human Input',
        type: 'HumanInput',
        category: 'Agent Flows',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#6E6EFD',
        baseClasses: ['HumanInput'],
        description: 'Tạm dừng chờ người dùng phê duyệt hoặc từ chối trong quá trình chạy (B-031)',
        allowedInputs: [
            'humanInputDescriptionType',
            'humanInputDescription',
            'humanInputModel',
            'humanInputModelConfig',
            'humanInputModelPrompt',
            'humanInputEnableFeedback'
        ],
        requiredInputs: ['humanInputDescriptionType']
    },
    directReplyAgentflow: {
        name: 'directReplyAgentflow',
        label: 'Direct Reply',
        type: 'DirectReply',
        category: 'Agent Flows',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4DDBBB',
        baseClasses: ['DirectReply'],
        allowedInputs: ['directReplyMessage'],
        requiredInputs: ['directReplyMessage'],
        description: 'Directly reply to the user with a message'
    },
    chatOpenAI: {
        name: 'chatOpenAI',
        label: 'ChatOpenAI',
        type: 'ChatOpenAI',
        category: 'Chat Models',
        supportedVersions: [5.0, 6.0],
        recommendedVersion: 5.0,
        color: '#10A37F',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: [
            'modelName',
            'temperature',
            'maxTokens',
            'topP',
            'frequencyPenalty',
            'presencePenalty',
            'timeout',
            'basePath',
            'credential'
        ],
        requiredInputs: ['modelName'],
        description: 'Wrapper around OpenAI large language models'
    },
    chatGoogleGenerativeAI: {
        name: 'chatGoogleGenerativeAI',
        label: 'ChatGoogleGenerativeAI',
        type: 'ChatGoogleGenerativeAI',
        category: 'Chat Models',
        supportedVersions: [2.0, 3.0],
        recommendedVersion: 2.0,
        color: '#4285F4',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: ['modelName', 'temperature', 'maxOutputTokens', 'topP', 'topK', 'credential'],
        requiredInputs: ['modelName'],
        description: 'Wrapper around Google Gemini language models'
    },
    chatAnthropic: {
        name: 'chatAnthropic',
        label: 'ChatAnthropic',
        type: 'ChatAnthropic',
        category: 'Chat Models',
        supportedVersions: [4.0, 5.0],
        recommendedVersion: 4.0,
        color: '#D97706',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: ['modelName', 'temperature', 'maxTokens', 'credential'],
        requiredInputs: ['modelName'],
        description: 'Wrapper around Anthropic Claude language models'
    },
    chatOllama: {
        name: 'chatOllama',
        label: 'ChatOllama',
        type: 'ChatOllama',
        category: 'Chat Models',
        supportedVersions: [3.0, 4.0],
        recommendedVersion: 3.0,
        color: '#111827',
        baseClasses: ['BaseChatModel', 'BaseLanguageModel'],
        allowedInputs: ['baseUrl', 'modelName', 'temperature'],
        requiredInputs: ['modelName'],
        description: 'Local Ollama chat model without cloud credentials'
    },
    calculator: {
        name: 'calculator',
        label: 'Calculator',
        type: 'Calculator',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#6366F1',
        baseClasses: ['Tool'],
        allowedInputs: [],
        description: 'Perform arithmetic calculations'
    },
    webSearch: {
        name: 'webSearch',
        label: 'Web Search',
        type: 'WebSearch',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#EC4899',
        baseClasses: ['Tool'],
        allowedInputs: ['apiKey', 'maxResults'],
        description: 'Search the web for up-to-date information'
    },
    documentStoreTool: {
        name: 'documentStoreTool',
        label: 'Document Store Tool',
        type: 'DocumentStoreTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0284C7',
        baseClasses: ['Tool', 'DynamicTool'],
        allowedInputs: ['selectedStore', 'storeName', 'description', 'topK', 'returnSourceDocuments'],
        requiredInputs: ['selectedStore'],
        description: 'Truy xuất tài liệu từ kho lưu trữ Document Store của Flowise để trả lời câu hỏi'
    },
    retrieverTool: {
        name: 'retrieverTool',
        label: 'Retriever Tool',
        type: 'RetrieverTool',
        category: 'Tools',
        supportedVersions: [3.0],
        recommendedVersion: 3.0,
        color: '#0284C7',
        baseClasses: ['RetrieverTool', 'DynamicTool', 'Tool'],
        allowedInputs: ['name', 'description', 'retriever', 'returnSourceDocuments', 'retrieverToolMetadataFilter'],
        requiredInputs: ['name', 'description'],
        description: 'Use a retriever as allowed tool for agent'
    },
    requestsGet: {
        name: 'requestsGet',
        label: 'Requests Get',
        type: 'RequestsGet',
        category: 'Tools',
        supportedVersions: [2.0],
        recommendedVersion: 2.0,
        color: '#3B82F6',
        baseClasses: ['RequestsGet', 'Tool'],
        allowedInputs: ['requestsGetUrl', 'requestsGetName', 'requestsGetDescription', 'headers', 'queryParams', 'credential'],
        requiredInputs: ['requestsGetUrl'],
        description: 'Thực thi truy vấn HTTP GET đến các API bên ngoài được cấp phép (PH6-T03)'
    },
    customTool: {
        name: 'customTool',
        label: 'Custom Tool',
        type: 'CustomTool',
        category: 'Tools',
        supportedVersions: [3.0],
        recommendedVersion: 3.0,
        color: '#8B5CF6',
        baseClasses: ['CustomTool', 'Tool', 'StructuredTool'],
        allowedInputs: ['selectedTool', 'returnDirect'],
        requiredInputs: ['selectedTool'],
        description: 'Công cụ tùy chỉnh gọi API nội bộ hoặc script được phê duyệt trong Flowise (PH6-T03)'
    },
    customMcpServerTool: {
        name: 'customMcpServerTool',
        label: 'Custom MCP Server',
        type: 'Custom MCP Server Tool',
        category: 'Tools (MCP)',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0EA5E9',
        baseClasses: ['Tool'],
        allowedInputs: ['mcpServerId', 'mcpActions'],
        requiredInputs: ['mcpServerId', 'mcpActions'],
        description: 'Sử dụng các MCP tools từ MCP Server đã được ủy quyền trong Workspace (B-031)'
    },
    excelOfficeTool: {
        name: 'excelOfficeTool',
        label: 'Excel Spreadsheet (.xlsx)',
        type: 'ExcelOfficeTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#1D6F42',
        baseClasses: ['ExcelOfficeTool', 'Tool'],
        allowedInputs: [],
        description: 'Đọc, tạo mới và cập nhật bảng tính Excel (.xlsx) nội bộ trả link tải file (B-032)'
    },
    helpdeskTicketTool: {
        name: 'helpdeskTicketTool',
        label: 'Support Ticket / Helpdesk (L3)',
        type: 'HelpdeskTicketTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0F766E',
        baseClasses: ['HelpdeskTicketTool', 'Tool'],
        allowedInputs: [],
        description:
            'Tiếp nhận, chống trùng lặp, phân nhóm xử lý theo SLA và theo dõi trạng thái phiếu hỗ trợ CSKH (TCK-...) kèm ngữ cảnh (B-035)'
    },
    wordOfficeTool: {
        name: 'wordOfficeTool',
        label: 'Word Document (.docx)',
        type: 'WordOfficeTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#185ABD',
        baseClasses: ['WordOfficeTool', 'Tool'],
        allowedInputs: [],
        description: 'Soạn thảo, đọc và bổ sung mục/bảng biểu vào file Word (.docx) nội bộ trả link tải file (B-032)'
    },
    currentDateTime: {
        name: 'currentDateTime',
        label: 'CurrentDateTime',
        type: 'CurrentDateTime',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#6366F1',
        baseClasses: ['CurrentDateTime', 'Tool'],
        allowedInputs: [],
        description: 'Lấy ngày giờ và múi giờ hiện tại của hệ thống (B-032)'
    },
    webScraperTool: {
        name: 'webScraperTool',
        label: 'Web Scraper',
        type: 'WebScraperTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0284C7',
        baseClasses: ['WebScraperTool', 'Tool'],
        allowedInputs: ['maxDepth', 'maxPages', 'timeoutMs', 'useSitemap'],
        description: 'Thu thập và bóc tách văn bản từ trang web (B-032)'
    },
    arxiv: {
        name: 'arxiv',
        label: 'Arxiv',
        type: 'Arxiv',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#B91C1C',
        baseClasses: ['Arxiv', 'Tool'],
        allowedInputs: [],
        description: 'Tìm kiếm bài báo khoa học trên Arxiv (B-032)'
    },
    jsonPathExtractor: {
        name: 'jsonPathExtractor',
        label: 'JSON Path Extractor',
        type: 'JSONPathExtractor',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#475569',
        baseClasses: ['JSONPathExtractor', 'Tool'],
        allowedInputs: ['jsonPath', 'returnNullIfEmpty'],
        description: 'Trích xuất dữ liệu theo JSONPath (B-032)'
    },
    googleSheetsTool: {
        name: 'googleSheetsTool',
        label: 'Google Sheets',
        type: 'GoogleSheets',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0F9D58',
        baseClasses: ['GoogleSheets', 'Tool'],
        allowedInputs: ['sheetsType', 'spreadsheetActions', 'valuesActions', 'spreadsheetId', 'range', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Thao tác đọc/ghi bảng tính Google Sheets đám mây (B-032)'
    },
    googleDriveTool: {
        name: 'googleDriveTool',
        label: 'Google Drive',
        type: 'GoogleDrive',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4285F4',
        baseClasses: ['GoogleDrive', 'Tool'],
        allowedInputs: ['driveType', 'fileActions', 'folderActions', 'searchActions', 'shareActions', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Quản lý, tìm kiếm và tải tệp trên Google Drive (B-032)'
    },
    googleDocsTool: {
        name: 'googleDocsTool',
        label: 'Google Docs',
        type: 'GoogleDocs',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4285F4',
        baseClasses: ['GoogleDocs', 'Tool'],
        allowedInputs: ['actions', 'documentId', 'title', 'text', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Soạn thảo và đọc tài liệu Google Docs đám mây (B-032)'
    },
    gmail: {
        name: 'gmail',
        label: 'Gmail',
        type: 'Gmail',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#EA4335',
        baseClasses: ['Gmail', 'Tool'],
        allowedInputs: ['gmailType', 'draftActions', 'messageActions', 'labelActions', 'threadActions', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Đọc và gửi thư qua Gmail (B-032)'
    },
    googleCalendarTool: {
        name: 'googleCalendarTool',
        label: 'Google Calendar',
        type: 'GoogleCalendar',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4285F4',
        baseClasses: ['GoogleCalendar', 'Tool'],
        allowedInputs: ['calendarType', 'eventActions', 'calendarActions', 'freebusyActions', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Quản lý sự kiện và lịch trống trên Google Calendar (B-032)'
    },
    microsoftOutlook: {
        name: 'microsoftOutlook',
        label: 'Microsoft Outlook',
        type: 'MicrosoftOutlook',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0078D4',
        baseClasses: ['MicrosoftOutlook', 'Tool'],
        allowedInputs: ['outlookType', 'calendarActions', 'messageActions', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Quản lý email và lịch trên Microsoft Outlook (B-032)'
    },
    microsoftTeams: {
        name: 'microsoftTeams',
        label: 'Microsoft Teams',
        type: 'MicrosoftTeams',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#6264A7',
        baseClasses: ['MicrosoftTeams', 'Tool'],
        allowedInputs: ['teamsType', 'channelActions', 'chatActions', 'chatMessageActions', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Gửi và đọc tin nhắn trên Microsoft Teams (B-032)'
    },
    jiraTool: {
        name: 'jiraTool',
        label: 'Jira',
        type: 'Jira',
        category: 'Tools',
        supportedVersions: [2.0],
        recommendedVersion: 2.0,
        color: '#0052CC',
        baseClasses: ['Jira', 'Tool'],
        allowedInputs: ['jiraHost', 'jiraType', 'issueActions', 'commentActions', 'userActions', 'FLOWISE_CREDENTIAL_ID'],
        description: 'Quản lý công việc và issue trên Jira (B-032)'
    },
    tavilyAPI: {
        name: 'tavilyAPI',
        label: 'Tavily API',
        type: 'TavilyAPI',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0EA5E9',
        baseClasses: ['TavilyAPI', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tìm kiếm Internet chuyên sâu qua Tavily (B-032)'
    },
    braveSearchAPI: {
        name: 'braveSearchAPI',
        label: 'BraveSearch API',
        type: 'BraveSearchAPI',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#FB542B',
        baseClasses: ['BraveSearchAPI', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tìm kiếm web qua Brave Search API (B-032)'
    },
    serper: {
        name: 'serper',
        label: 'Serper',
        type: 'Serper',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#2563EB',
        baseClasses: ['Serper', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tìm kiếm Google qua Serper API (B-032)'
    },
    exaSearch: {
        name: 'exaSearch',
        label: 'Exa Search',
        type: 'ExaSearch',
        category: 'Tools',
        supportedVersions: [1.0, 1.1, 1.2],
        recommendedVersion: 1.2,
        color: '#4F46E5',
        baseClasses: ['ExaSearch', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tìm kiếm ngữ nghĩa trên web qua Exa (B-032)'
    },
    stripeTool: {
        name: 'stripeTool',
        label: 'StripeAgentTool',
        type: 'StripeTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#635BFF',
        baseClasses: ['StripeTool', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Thao tác hóa đơn và thanh toán trên Stripe (B-032)'
    },
    codeInterpreterE2B: {
        name: 'codeInterpreterE2B',
        label: 'Code Interpreter by E2B',
        type: 'CodeInterpreterE2B',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#FF8800',
        baseClasses: ['CodeInterpreterE2B', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Chạy mã Python trong sandbox E2B (B-032)'
    },
    projectTrackerTool: {
        name: 'projectTrackerTool',
        label: 'Project Tracker (GitHub Issues / Trello / Board)',
        type: 'ProjectTrackerTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#2563EB',
        baseClasses: ['ProjectTrackerTool', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID', 'githubRepo', 'trelloApiKey', 'trelloToken', 'trelloListId'],
        description: 'Quản lý task dự án tự động, cân bằng tải giao việc, phát hiện rủi ro & đồng bộ GitHub/Trello (B-033)'
    },
    telegramNotifyTool: {
        name: 'telegramNotifyTool',
        label: 'Telegram Bot Notification',
        type: 'TelegramNotifyTool',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#0088CC',
        baseClasses: ['TelegramNotifyTool', 'Tool'],
        allowedInputs: ['botToken', 'chatId'],
        description: 'Gửi báo cáo tự động qua Telegram Bot API kèm Outbox (B-033)'
    },
    sequentialThinkingMCP: {
        name: 'sequentialThinkingMCP',
        label: 'Sequential Thinking MCP',
        type: 'Sequential Thinking MCP Tool',
        category: 'Tools (MCP)',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#8B5CF6',
        baseClasses: ['Tool'],
        allowedInputs: ['mcpActions'],
        description: 'Tư duy phân rã công việc từng bước qua Sequential Thinking MCP (B-033)'
    },
    githubMCP: {
        name: 'githubMCP',
        label: 'Github MCP',
        type: 'Github MCP Tool',
        category: 'Tools (MCP)',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#24292F',
        baseClasses: ['Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID', 'mcpActions', 'githubEnterpriseUrl'],
        description: 'Quản lý GitHub Issues / PR / Repo qua GitHub MCP (B-033)'
    },
    slackMCP: {
        name: 'slackMCP',
        label: 'Slack MCP',
        type: 'Slack MCP Tool',
        category: 'Tools (MCP)',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4A154B',
        baseClasses: ['Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID', 'mcpActions'],
        description: 'Gửi báo cáo & đọc tin nhắn kênh Slack qua MCP (B-033)'
    },
    postgreSQLMCP: {
        name: 'postgreSQLMCP',
        label: 'PostgreSQL MCP',
        type: 'PostgreSQL MCP Tool',
        category: 'Tools (MCP)',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#336791',
        baseClasses: ['Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID', 'mcpActions'],
        description: 'Truy vấn cơ sở dữ liệu PostgreSQL qua MCP (B-033)'
    },
    pipedreamMCP: {
        name: 'pipedreamMCP',
        label: 'Pipedream MCP',
        type: 'Pipedream MCP Tool',
        category: 'Tools (MCP)',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#10B981',
        baseClasses: ['Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID', 'mcpActions', 'appSlug'],
        description: 'Kết nối 2500+ ứng dụng SaaS qua Pipedream MCP (B-033)'
    },
    wolframAlpha: {
        name: 'wolframAlpha',
        label: 'WolframAlpha',
        type: 'WolframAlpha',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#DD1100',
        baseClasses: ['WolframAlpha', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tính toán khoa học WolframAlpha (B-033)'
    },
    googleSearchAPI: {
        name: 'googleSearchAPI',
        label: 'Google Search API',
        type: 'GoogleSearchAPI',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#4285F4',
        baseClasses: ['GoogleSearchAPI', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tìm kiếm Google Custom Search (B-033)'
    },
    serpAPI: {
        name: 'serpAPI',
        label: 'Serp API',
        type: 'SerpAPI',
        category: 'Tools',
        supportedVersions: [1.0],
        recommendedVersion: 1.0,
        color: '#3B82F6',
        baseClasses: ['SerpAPI', 'Tool'],
        allowedInputs: ['FLOWISE_CREDENTIAL_ID'],
        description: 'Tra cứu tìm kiếm SerpAPI (B-033)'
    }
}

/**
 * Kiểm tra xem một node có nằm trong danh mục whitelist được phép hay không.
 */
export const isNodeAllowed = (nodeName: string, version?: number): boolean => {
    const meta = ALLOWED_AGENTFLOW_NODES[nodeName]
    if (!meta) return false
    if (typeof version === 'number') {
        return meta.supportedVersions.includes(version)
    }
    return true
}

/**
 * Lấy metadata chuẩn hóa của một node được phép.
 */
export const getNodeMetadata = (nodeName: string): NodeMetadata | undefined => {
    return ALLOWED_AGENTFLOW_NODES[nodeName]
}

/**
 * Thẩm định toàn diện một node data trước khi đưa vào Agentflow graph (PH2-T02).
 * Ngăn chặn tuyệt đối việc chèn node lạ hoặc version lỗi thời.
 */
export const validateNodeMetadata = (node: {
    name?: string
    version?: number
    type?: string
    inputs?: Record<string, unknown>
}): NodeValidationResult => {
    const errors: string[] = []
    const nodeName = node.name || 'unknown'

    if (!node.name) {
        errors.push('Node thiếu trường "name" định danh')
        return { valid: false, nodeName, errors }
    }

    const meta = ALLOWED_AGENTFLOW_NODES[node.name]
    if (!meta) {
        errors.push(`Node "${node.name}" không nằm trong danh mục whitelist được phép sử dụng`)
        return { valid: false, nodeName, errors }
    }

    // Kiểm tra version
    if (typeof node.version !== 'number') {
        errors.push(`Node "${node.name}" thiếu trường "version" số`)
    } else if (!meta.supportedVersions.includes(node.version)) {
        errors.push(
            `Node "${node.name}" sử dụng version ${node.version} không được hỗ trợ (chỉ chấp nhận: ${meta.supportedVersions.join(
                ', '
            )}). Cảnh báo: tránh dùng version lỗi thời!`
        )
    }

    // Kiểm tra type
    if (node.type && node.type !== meta.type) {
        errors.push(`Node "${node.name}" có type "${node.type}" không khớp với định nghĩa "${meta.type}"`)
    }

    // Kiểm tra inputs
    if (node.inputs && typeof node.inputs === 'object') {
        const inputKeys = Object.keys(node.inputs)

        // Kiểm tra required inputs
        if (meta.requiredInputs) {
            for (const reqInput of meta.requiredInputs) {
                if (!(reqInput in node.inputs) || node.inputs[reqInput] === undefined || node.inputs[reqInput] === '') {
                    errors.push(`Node "${node.name}" thiếu input bắt buộc: "${reqInput}"`)
                }
            }
        }

        // Kiểm tra trường lạ không được phép
        for (const key of inputKeys) {
            if (!meta.allowedInputs.includes(key)) {
                errors.push(`Node "${node.name}" chứa input không nằm trong allowlist: "${key}"`)
            }
        }
    }

    return {
        valid: errors.length === 0,
        nodeName,
        errors
    }
}
