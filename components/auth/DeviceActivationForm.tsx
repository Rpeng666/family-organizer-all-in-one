'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, KeyRound, Smartphone } from 'lucide-react';

type DeviceActivationFormProps = {
    initialKey?: string;
};

export function DeviceActivationForm({ initialKey = '' }: DeviceActivationFormProps) {
    const router = useRouter();
    const [key, setKey] = useState(initialKey);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trimmedKey = key.trim();
    const submitDisabled = isSubmitting || trimmedKey.length === 0;
    const helperText = useMemo(
        () =>
            typeof navigator !== 'undefined' && navigator.onLine === false
                ? 'Activation requires internet to reach your server.'
                : 'Enter the device activation key to unlock this device.',
        []
    );

    const onSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!trimmedKey) return;

        setIsSubmitting(true);
        setError(null);
        try {
            const response = await fetch('/api/device-activate', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: trimmedKey }),
            });

            let payload: any = null;
            try {
                payload = await response.json();
            } catch {}

            if (!response.ok) {
                setError(payload?.error || 'Activation failed');
                return;
            }

            router.replace('/');
            router.refresh();
        } catch (requestError) {
            console.error('Device activation failed', requestError);
            setError('Unable to reach the server for activation');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md border-2 shadow-lg">
                <CardHeader className="space-y-3">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Smartphone className="h-6 w-6" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl">Activate This Device</CardTitle>
                        <CardDescription className="pt-1">
                            {helperText}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="device-activation-key" className="flex items-center gap-2">
                                <KeyRound className="h-4 w-4" />
                                Device activation key
                            </Label>
                            <Input
                                id="device-activation-key"
                                type="password"
                                autoCapitalize="none"
                                autoCorrect="off"
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="Paste key"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                className="tracking-wide"
                            />
                        </div>

                        {error && (
                            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button type="submit" className="flex-1" disabled={submitDisabled}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Activating...
                                    </>
                                ) : (
                                    'Activate device'
                                )}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => router.replace('/')} disabled={isSubmitting}>
                                Try app
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Existing activation links using <code>/?activate=...</code> still work. This screen is for PWA/home-screen installs.
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
