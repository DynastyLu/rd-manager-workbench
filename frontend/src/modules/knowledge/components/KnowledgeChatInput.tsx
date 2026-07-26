import { useState, useCallback } from 'react';
import { Button, TextArea } from '@douyinfe/semi-ui';
import { IconSend, IconStop } from '@douyinfe/semi-icons';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
}

export function KnowledgeChatInput({ onSend, onStop, streaming, disabled }: Props) {
  const [text, setText] = useState('');

  const send = useCallback(() => {
    setText((prev) => {
      const trimmed = prev.trim();
      if (!trimmed || streaming) return prev;
      onSend(trimmed);
      return '';
    });
  }, [streaming, onSend]);

  return (
    <div className="kb-chat-input">
      <TextArea
        value={text}
        onChange={setText}
        placeholder={streaming ? '等待回复完成...' : '输入问题...'}
        disabled={streaming || disabled}
        autosize={{ minRows: 1, maxRows: 4 }}
        onEnterPress={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }}
      />
      {streaming ? (
        <Button icon={<IconStop />} theme="solid" type="danger" onClick={onStop}>停止</Button>
      ) : (
        <Button icon={<IconSend />} theme="solid" disabled={disabled || !text.trim()} onClick={send}>发送</Button>
      )}
    </div>
  );
}
