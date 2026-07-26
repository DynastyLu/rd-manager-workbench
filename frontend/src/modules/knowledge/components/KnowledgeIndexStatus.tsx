import {
  Card,
  Tag,
  Button,
  Skeleton,
  Progress,
  Descriptions,
  Space,
  Typography,
} from '@douyinfe/semi-ui';
import type { IndexStatus, AiUsageStats } from '../types';

const { Text } = Typography;

interface KnowledgeIndexStatusProps {
  indexStatus?: IndexStatus;
  aiUsage?: AiUsageStats;
  isLoading?: boolean;
  onReindex?: () => void;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

export function KnowledgeIndexStatus({
  indexStatus,
  aiUsage,
  isLoading,
  onReindex,
}: KnowledgeIndexStatusProps) {
  const handleReindex = () => {
    if (window.confirm('确定要重新索引所有文档吗？此操作可能需要一些时间。')) {
      onReindex?.();
    }
  };

  const renderIndexSection = () => {
    if (isLoading) {
      return (
        <div className="kb-index-status__section">
          <Skeleton placeholder={<Skeleton.Title />} loading={true} />
          <Skeleton placeholder={<Skeleton.Paragraph rows={3} />} loading={true} />
        </div>
      );
    }

    if (indexStatus) {
      const progressPercent = indexStatus.totalDocuments > 0
        ? Math.round((indexStatus.indexedDocuments / indexStatus.totalDocuments) * 100)
        : 0;

      return (
        <div className="kb-index-status__section">
          <div className="kb-index-status__header">
            <Text strong>索引状态</Text>
            <Tag
              color={indexStatus.complete ? 'green' : 'orange'}
              type="light"
            >
              {indexStatus.complete ? '已完成' : '索引中...'}
            </Tag>
          </div>
          <div className="kb-index-status__progress">
            <Progress percent={progressPercent} />
          </div>
          <Space vertical spacing="tight" style={{ width: '100%' }}>
            <Text>
              已索引文档：{indexStatus.indexedDocuments} / {indexStatus.totalDocuments}
            </Text>
            <Text>
              总片段数：{indexStatus.totalChunks}
            </Text>
            {indexStatus.lastIndexedAt && (
              <Text type="tertiary" size="small">
                上次索引时间：{new Date(indexStatus.lastIndexedAt).toLocaleString('zh-CN')}
              </Text>
            )}
          </Space>
          {!indexStatus.complete && (
            <div className="kb-index-status__reindex">
              <Button theme="solid" onClick={handleReindex}>
                重新索引
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="kb-index-status__section">
        <Text type="tertiary">暂无数据</Text>
      </div>
    );
  };

  const renderUsageSection = () => {
    if (!aiUsage) {
      return (
        <div className="kb-index-status__section">
          <Text type="tertiary">暂无用量数据</Text>
        </div>
      );
    }

    const rows = [
      { label: '今日', value: aiUsage.today },
      { label: '本周', value: aiUsage.week },
      { label: '本月', value: aiUsage.month },
      { label: '总计', value: aiUsage.total },
    ];

    return (
      <div className="kb-index-status__section">
        <Descriptions
          data={rows.map((row) => ({
            key: row.label,
            value: `${formatTokens(row.value.tokens)} tokens${row.value.cost !== undefined ? `（${formatCost(row.value.cost)}）` : ''}`,
          }))}
        />
      </div>
    );
  };

  return (
    <>
      <Card
        className="kb-index-status-card"
        title="AI 使用概览"
        headerExtraContent={
          indexStatus?.complete && (
            <Tag color="green" type="light" size="small">
              就绪
            </Tag>
          )
        }
      >
        <div className="kb-index-status-card__body">
          {renderIndexSection()}
          <div className="kb-index-status-card__divider" />
          {renderUsageSection()}
        </div>
      </Card>
      <style>{`
        .kb-index-status-card {
          height: 100%;
        }
        .kb-index-status-card__body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .kb-index-status-card__divider {
          height: 1px;
          background: var(--semi-color-border, #e8e8e8);
        }
        .kb-index-status__section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .kb-index-status__header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kb-index-status__progress {
          margin: 4px 0;
        }
        .kb-index-status__reindex {
          margin-top: 8px;
        }
      `}</style>
    </>
  );
}
