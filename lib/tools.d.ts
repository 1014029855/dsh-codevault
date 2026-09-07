/**
 * Model-facing tools of dsh-codevault.
 *
 * Division of labour (by design, same as dsh-listening):
 *  - The MODEL does the writing: it thinks against the code-reading skill and
 *    hands the plugin structured subject coordinates + finished prose.
 *  - The TOOLS only validate, persist, aggregate and refresh the hub/MOC.
 *    None of them "creates content", which keeps them deterministic and small.
 */
export declare const readCaptureTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const readNoteTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const readExpandTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const readQueryTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const readRecentTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const vaultSearchTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const vaultReadTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const vaultSuggestTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const readLinkTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare const TOOLS: import("@deepseek-ai/dsh-tools").ToolDefinition[];
//# sourceMappingURL=tools.d.ts.map