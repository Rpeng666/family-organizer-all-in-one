import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { tx, id } from '@instantdb/react';
import { useToast } from '@/components/ui/use-toast';

interface CurrencySettingsProps {
  db: any;
}

const ENABLED_CURRENCIES_SETTING = 'enabledCurrencies';

const CurrencySettings: React.FC<CurrencySettingsProps> = ({ db }) => {
  const { toast } = useToast();
  const [initialized, setInitialized] = useState(false);
  const [lastCurrencyMessage, setLastCurrencyMessage] = useState<string | null>(null);
  const [isMessageVisible, setIsMessageVisible] = useState(false);
  
  // Query existing settings
  const { data, isLoading, error } = db.useQuery({
    settings: {
      $: {
        where: {
          name: ENABLED_CURRENCIES_SETTING
        }
      }
    },
  });

  // Handle the message timeout
  useEffect(() => {
    if (lastCurrencyMessage) {
      setIsMessageVisible(true);
      const timer = setTimeout(() => {
        setIsMessageVisible(false);
        setTimeout(() => {
          setLastCurrencyMessage(null);
        }, 300);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [lastCurrencyMessage]);

  // Initialize settings if none exist
  useEffect(() => {
    const initializeSettings = async () => {
      if (!initialized && !isLoading && !error) {
        if (!data?.settings || data.settings.length === 0) {
          const settingId = id();
          try {
            await db.transact([
              tx.settings[settingId].update({
                name: ENABLED_CURRENCIES_SETTING,
                value: JSON.stringify(['USD']),
              }),
            ]);
          } catch (error) {
            console.error('Error initializing settings:', error);
            toast({
              title: "Error",
              description: "Failed to initialize settings.",
              variant: "destructive",
            });
          }
        }
        setInitialized(true);
      }
    };

    initializeSettings();
  }, [data?.settings, isLoading, error, initialized, db, toast]);

  const toggleCurrency = async (currency: string) => {
    const currentSetting = data?.settings?.[0];
    if (!currentSetting?.id) {
      console.error('No settings found');
      return;
    }

    const currentCurrencies = JSON.parse(currentSetting.value || '["USD"]');
    const currencyIndex = currentCurrencies.indexOf(currency);
    let newEnabledCurrencies: string[];

    if (currencyIndex === -1) {
      newEnabledCurrencies = [...currentCurrencies, currency];
    } else {
      if (currentCurrencies.length === 1) {
        setLastCurrencyMessage(currency);
        return;
      }
      newEnabledCurrencies = currentCurrencies.filter(c => c !== currency);
    }

    try {
      await db.transact([
        tx.settings[currentSetting.id].update({
          value: JSON.stringify(newEnabledCurrencies),
        }),
      ]);
    } catch (error) {
      console.error('Error updating currency settings:', error);
      toast({
        title: "Error",
        description: "Failed to update currency settings.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error loading settings: {error.message}</div>;
  }

  const currentSetting = data?.settings?.[0];
  const enabledCurrencies = currentSetting ? JSON.parse(currentSetting.value || '["USD"]') : ['USD'];

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Currency Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="usd-toggle">United States Dollar (USD)</Label>
              <div className="text-sm text-muted-foreground">
                Track allowances in USD
              </div>
            </div>
            <Switch
              id="usd-toggle"
              checked={enabledCurrencies.includes('USD')}
              onCheckedChange={() => toggleCurrency('USD')}
            />
          </div>
          <div className="h-3">
            {lastCurrencyMessage === 'USD' && (
              <div
                className={`text-sm text-amber-600 dark:text-amber-500 transition-opacity duration-300 ${
                  isMessageVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                Must keep at least one currency enabled
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="npr-toggle">Nepali Rupee (NPR)</Label>
              <div className="text-sm text-muted-foreground">
                Track allowances in Nepali Rupees
              </div>
            </div>
            <Switch
              id="npr-toggle"
              checked={enabledCurrencies.includes('NPR')}
              onCheckedChange={() => toggleCurrency('NPR')}
            />
          </div>
          <div className="h-6">
            {lastCurrencyMessage === 'NPR' && (
              <div
                className={`text-sm text-amber-600 dark:text-amber-500 transition-opacity duration-300 ${
                  isMessageVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                Must keep at least one currency enabled
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CurrencySettings;