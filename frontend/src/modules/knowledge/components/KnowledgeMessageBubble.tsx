import React from 'react';
import { Card } from '@douyinfe/semi-ui';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';
import { KnowledgeCitationCard } from './KnowledgeCitationCard';
import type { KnowledgeMessage } from '../types';

interface KnowledgeMessageBubbleProps {
  message: KnowledgeMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  deletedDocIds?: Set<string>;
}

export function KnowledgeMessageBubble({
  message,
  isStreaming = false,
  streamingContent,
  deletedDocIds,
}: KnowledgeMessageBubbleProps) {
  const isUser = message.role === 'USER';
  const displayContent = isStreaming ? (streamingContent ?? '') : message.content;
  const timeStr = new Date(message.createdAt).toLocaleTimeString('zh-CN');

  return (
    <>
      <div className={`kb-message kb-message--${isUser ? 'user' : 'assistant'}`}>
        <div
          className="kb-message__avatar"
          style={{ backgroundColor: isUser ? '#1456f0' : '#10a37f' }}
        >
          {isUser ? 'U' : 'AI'}
        </div>

        <div className="kb-message__body">
          {isUser ? (
            <Card
              className="kb-message__bubble kb-message__bubble--user"
              style={{
                backgroundColor: '#1456f0',
                color: '#fff',
                borderRadius: '12px 12px 4px 12px',
                border: 'none',
              }}
            >
              <div className="kb-message__text">{displayContent}</div>
            </Card>
          ) : (
            <>
              <div className="kb-message__bubble kb-message__bubble--assistant">
                <KnowledgeMarkdown text={displayContent || '思考中...'} />
                {isStreaming && displayContent && (
                  <span className="kb-streaming-indicator" />
                )}
              </div>
              {message.citations && message.citations.length > 0 && (
                <div className="kb-message__citations">
                  <KnowledgeCitationCard
                    citations={message.citations}
                    deletedIds={deletedDocIds}
                  />
                </div>
              )}
            </>
          )}
          <div className="kb-message__time">{timeStr}</div>
        </div>
      </div>

      <style>{`
        .kb-message {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
          align-items: flex-start;
        }

        .kb-message--assistant {
          flex-direction: row;
        }

        .kb-message--user {
          flex-direction: row-reverse;
        }

        .kb-message__avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          flex-shrink: 0;
        }

        .kb-message__body {
          max-width: 80%;
          display: flex;
          flex-direction: column;
        }

        .kb-message--user .kb-message__body {
          align-items: flex-end;
        }

        .kb-message--assistant .kb-message__body {
          align-items: flex-start;
        }

        .kb-message__text {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .kb-message__bubble--assistant {
          background: #f5f5f5;
          border-radius: 12px 12px 12px 4px;
          padding: 12px 16px;
        }

        .kb-message__time {
          font-size: 11px;
          color: #999;
          margin-top: 4px;
        }

        .kb-message__citations {
          margin-top: 8px;
        }

        .kb-streaming-indicator {
          display: inline-block;
          width: 8px;
          height: 16px;
          background-color: #1456f0;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: kb-blink 1s step-end infinite;
        }

        @keyframes kb-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
