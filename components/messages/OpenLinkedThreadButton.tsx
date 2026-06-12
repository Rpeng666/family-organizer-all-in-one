'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createThread } from '@/lib/message-client';
import { useToast } from '@/components/ui/use-toast';
import type { LinkedThreadDomain } from '@/lib/messaging-types';

export function OpenLinkedThreadButton({
    linkedDomain,
    linkedEntityId,
    title,
    label = 'Discuss this',
    variant = 'outline',
    size = 'sm',
}: {
    linkedDomain: LinkedThreadDomain;
    linkedEntityId: string;
    title: string;
    label?: string;
    variant?: 'default' | 'outline' | 'ghost';
    size?: 'sm' | 'default';
}) {
    const router = useRouter();
    const { toast } = useToast();
    const [isOpening, setIsOpening] = useState(false);

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            disabled={isOpening}
            onClick={async () => {
                setIsOpening(true);
                try {
                    const result = await createThread({
                        threadType: 'linked',
                        linkedDomain,
                        linkedEntityId,
                        title,
                    });
                    const threadId = result?.thread?.id;
                    if (threadId) {
                        router.push(`/messages?threadId=${encodeURIComponent(threadId)}`);
                    }
                } catch (error: any) {
                    toast({
                        title: 'Unable to open discussion',
                        description: error?.message || 'Please try again.',
                        variant: 'destructive',
                    });
                } finally {
                    setIsOpening(false);
                }
            }}
        >
            <MessageCircle className="mr-2 h-4 w-4" />
            {isOpening ? 'Opening...' : label}
        </Button>
    );
}
