import { Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';
import { PROVIDER_KEY } from '../constants/providerKey.js';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { UserService } from './user.service.js';
import z from 'zod';
import { tool } from '@langchain/core/tools';
import { MailerService } from '@nestjs-modules/mailer';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    UserService,
    {
      provide: PROVIDER_KEY.chatModel,
      inject: [ConfigService],
      useFactory(configService: ConfigService) {
        return new ChatOpenAI({
          model: configService.get('OPENAI_MODEL_NAME'),
          apiKey: configService.get('OPENAI_API_KEY'),
          configuration: {
            baseURL: configService.get('OPENAI_BASE_URL'),
          }
        })
      }
    },
    {
      provide: PROVIDER_KEY.userQueryTool,
      inject: [UserService],
      useFactory(userService: UserService) {
        const schema = z.object({
          userId: z.string().describe("用户 ID"),
        })

        return tool(async ({ userId }) => {
          const user = userService.findOne(userId)

          if (!user) {
            return `用户 ID ${userId} 不存在。`
          }

          return `用户 ID ${userId} 的信息为：姓名：${user.name},邮箱：${user.email},角色：${user.role}`
        }, {
          name: 'query_user',
          description: "查询数据库中的用户信息。输入用户 ID，返回该用户的详细信息（姓名、邮箱、角色）。",
          schema
        })
      }
    },
    {
      provide: PROVIDER_KEY.sendMailTool,
      inject: [MailerService, ConfigService],
      useFactory(mailerService: MailerService, configService: ConfigService) {
        const schema = z.object({
          to: z.email().describe("收件人邮箱地址"),
          subject: z.string().describe("邮件标题"),
          text: z.string().optional().describe("邮件正文"),
          html: z.string().optional().describe("邮件 HTML 内容"),
        })

        return tool(async ({ to, subject, text, html }) => {
          const fallbackFrom = configService.get('MAIL_FROM')

          await mailerService.sendMail({
            to,
            subject,
            text: text ?? '（无文本内容）',
            html: html ?? '<p>（无 HTML 内容）</p>',
            from: fallbackFrom
          })

          return `邮件已发送到 ${to}，主题为【${subject}】。`
        },
          {
            name: 'send_mail',
            description: "发送邮件。需提供收件人邮箱地址、邮件标题，可选邮件正文、邮件 HTML 内容。",
            schema
          })
      }
    },
    {
      provide: PROVIDER_KEY.searchWebTool,
      inject: [ConfigService],
      useFactory(configService: ConfigService) {
        const schema = z.object({
          query: z.string().min(1).describe("搜索关键词"),
          count: z.number().int().min(1).max(20).optional().describe("返回的搜索结果数量，默认 10 条")
        })

        return tool(
          async ({ query, count }) => {
            const apiKey = configService.get("SEARCH_API_KEY")
            if (!apiKey) {
              return `未配置搜索引擎 API 密钥（环境变量 SEARCH_API_KEY）`
            }

            const url = 'https://api.bochaai.com/v1/web-search'
            const body = {
              query,
              freshness: 'noLimit',
              summary: true,
              count: count ?? 10
            }

            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify(body)
            })

            if (!response.ok) {
              const errorText = await response.text()
              return `搜索 API 请求失败，状态码：${response.status},错误信息：${errorText}`
            }

            let json: any;
            try {
              json = await response.json()
            } catch (error) {
              return `搜索 API 请求失败，错误信息：${error}`
            }

            try {
              if (json.code !== 200 || !json.data) {
                return `搜索 API 请求失败，错误信息：${json.msg ?? '未知错误'}`
              }

              const webpages = json.data.webPages?.value ?? []
              if (!webpages.length) {
                return `搜索结果为空`
              }

              const formatted = webpages.map((webpage: any, index: number) => {
                `[结果 ${index + 1}]
                标题：${webpage.title}
                URL：${webpage.url}
                摘要：${webpage.summary}
                网站名称：${webpage.siteName}
                图标：${webpage.icon}
                时间：${webpage.time}
                `
              }).join('\n\n')

              return formatted
            } catch (error) {
              return `搜索 API 请求失败，错误信息：${error}`
            }
          },
          {
            name: 'web_search',
            description: "输入为搜索关键词进行互联网网页搜索（可选 count 指定结果数量），返回包含标题、URL、摘要、网站名称、图标和时间等信息的结果列表。",
            schema
          }
        )
      }
    }
  ],
})
export class AiModule { }
