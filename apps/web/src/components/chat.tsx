'use client';

import { Alert, Button, Card, Input } from '@logimatch/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApi, errorText, post } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { Message, Page } from '@/lib/types';

/** Platform içi mesajlaşma; 5 sn'de bir yoklama. Anlaşma öncesi iletişim bilgisi maskelenir. */
export function ChatThread({
  conversationId,
  preDeal,
}: {
  conversationId: string;
  preDeal: boolean;
}) {
  const t = useTranslations('messages');
  const [items, setItems] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const page = await clientApi<Page<Message>>(
        `/conversations/${conversationId}/messages?limit=50`,
      );
      setItems([...page.items].reverse());
    } catch (err) {
      setError(errorText(err));
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [items.length]);

  const send = async () => {
    if (!text.trim()) return;
    setError(null);
    try {
      const res = await post<{ warning: string | null }>(
        `/conversations/${conversationId}/messages`,
        { body: text },
      );
      setWarn(res.warning ? t('maskedWarning') : null);
      setText('');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Card className="flex h-[28rem] flex-col">
      {preDeal ? (
        <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          🔒 {t('preDeal')}
        </p>
      ) : null}
      <div className="flex-1 space-y-2 overflow-y-auto p-4" data-testid="chat-messages">
        {items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : null}
        {items.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
            >
              {!m.mine && m.sender.fullName ? (
                <p className="text-xs font-medium opacity-70">{m.sender.fullName}</p>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-0.5 text-[10px] opacity-60">{formatDateTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {warn ? (
        <Alert tone="warning" className="mx-3 mb-2">
          {warn}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mx-3 mb-2">
          {error}
        </Alert>
      ) : null}
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          maxLength={2000}
        />
        <Button type="submit" disabled={!text.trim()}>
          {t('send')}
        </Button>
      </form>
    </Card>
  );
}
