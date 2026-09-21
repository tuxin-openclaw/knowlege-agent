import { Inject, Injectable } from '@nestjs/common';
import { PROVIDER_KEY } from '../constants/providerKey.js';
import { ChatOpenAI } from '@langchain/openai';
import type { Runnable } from '@langchain/core/runnables';
import { SystemMessage, type AIMessage, type BaseMessage, HumanMessage, ToolMessage, AIMessageChunk } from '@langchain/core/messages';

@Injectable()
export class AiService {
  private readonly modelWithTools: Runnable<BaseMessage[], AIMessage>

  constructor(
    @Inject(PROVIDER_KEY.chatModel) model: ChatOpenAI,
    @Inject(PROVIDER_KEY.userQueryTool) private readonly userQueryTool: Runnable<BaseMessage[], AIMessage>,
    @Inject(PROVIDER_KEY.sendMailTool) private readonly sendMailTool: Runnable<BaseMessage[], AIMessage>,
    @Inject(PROVIDER_KEY.searchWebTool) private readonly searchWebTool: Runnable<BaseMessage[], AIMessage>
  ) {
    this.modelWithTools = model.bindTools([this.userQueryTool, this.sendMailTool])
  }

  async runChain(query: string): Promise<string> {
    const messages: BaseMessage[] = [
      new SystemMessage("你是一个智能助手，在需要时调用工具（如 query_user）来查询用户信息，再根据结果回答用户的问题"),
      new HumanMessage(query),
    ]

    while (true) {
      const aiMessage = await this.modelWithTools.invoke(messages)

      const toolCalls = aiMessage.tool_calls ?? []
      if (!toolCalls.length) {
        return aiMessage.content as string
      }

      for (const toolCall of toolCalls) {
        const { id: toolId, name: toolName } = toolCall
        const args = toolCall.args as AIMessage[];

        const toolNameMap: Record<string, Runnable<BaseMessage[], AIMessage>> = {
          query_user: this.userQueryTool,
          send_mail: this.sendMailTool,
          web_search: this.searchWebTool
        }
        const tool = toolNameMap[toolName]
        if (tool) {
          const result = await tool.invoke(args)
          messages.push(new ToolMessage({
            tool_call_id: toolId!,
            name: toolName,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          }))
        }
      }
    }
  }

  async *runChainStream(query: string): AsyncIterable<string> {
    const messages: BaseMessage[] = [
      new SystemMessage("你是一个智能助手，在需要时调用工具（如 query_user）来查询用户信息，再根据结果回答用户的问题"),
      new HumanMessage(query),
    ]

    while (true) {
      const stream = await this.modelWithTools.stream(messages)

      let fullAIMessage: AIMessageChunk | null = null

      for await (const chunk of stream as AsyncIterable<AIMessageChunk>) {
        fullAIMessage = fullAIMessage ? fullAIMessage.concat(chunk) : chunk

        const hasToolCallChunk = !!fullAIMessage.tool_call_chunks && fullAIMessage.tool_call_chunks.length > 0

        // 只要当前轮次还没出现 tool 调用的 chunk，就直接把文本内容流式往外推
        if (!hasToolCallChunk && chunk.content) {
          yield chunk.content as string
        }
      }

      if (!fullAIMessage) return;

      messages.push(fullAIMessage)

      const toolCalls = fullAIMessage.tool_calls ?? []
      if (!toolCalls.length) {
        // 此处不需要返回最终回答，上面 yield 已经流式返回
        return
      }

      for (const toolCall of toolCalls) {
        const { id: toolId, name: toolName } = toolCall
        const args = toolCall.args as AIMessage[];

        const toolNameMap: Record<string, Runnable<BaseMessage[], AIMessage>> = {
          query_user: this.userQueryTool,
          send_mail: this.sendMailTool,
          web_search: this.searchWebTool
        }
        const tool = toolNameMap[toolName]
        if (tool) {
          const result = await tool.invoke(args)
          messages.push(new ToolMessage({
            tool_call_id: toolId!,
            name: toolName,
            content: typeof result === 'string' ? result : JSON.stringify(result)
          }))
        }
      }
    }
  }
}
