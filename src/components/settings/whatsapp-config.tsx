'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN = '••••••••••••••••';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  // Stable ref — createClient() returns a singleton so this never changes,
  // but using a ref guarantees useCallback/useEffect deps stay stable even
  // if the module is hot-reloaded in dev.
  const supabaseRef = useRef(createClient());
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // Use the public ngrok/production URL from env — not window.location.origin
  // which would show localhost even when accessed via ngrok
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const webhookUrl = `${siteUrl}/api/whatsapp/webhook`;

  const fetchConfig = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabaseRef.current
        .from('whatsapp_config')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) console.error('Failed to load config row:', error);

      if (data) {
        setConfig(data as WhatsAppConfigType);
        setPhoneNumberId((data as any).phone_number_id || '');
        setWabaId((data as any).waba_id || '');
        setAccessToken(MASKED_TOKEN);
        setVerifyToken(process.env.NEXT_PUBLIC_VERIFY_TOKEN || '');
        setTokenEdited(false);
      } else {
        setConfig(null);
        setPhoneNumberId('');
        setWabaId('');
        setAccessToken('');
        setVerifyToken(process.env.NEXT_PUBLIC_VERIFY_TOKEN || '');
        setTokenEdited(false);
      }

      if (data) {
        try {
          const res = await fetch('/api/whatsapp/config', { method: 'GET' });
          const payload = await res.json();
          if (payload.connected) {
            setConnectionStatus('connected');
            setResetReason(null);
            setStatusMessage('');
          } else {
            setConnectionStatus('disconnected');
            setResetReason(
              payload.needs_reset ? 'token_corrupted'
                : payload.reason === 'meta_api_error' ? 'meta_api_error'
                : null
            );
            setStatusMessage(payload.message || '');
          }
        } catch (err) {
          console.error('Health check failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('disconnected');
        setResetReason(null);
        setStatusMessage('');
      }
    } catch (err) {
      console.error('fetchConfig error:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  }, []); // no deps — supabaseRef.current is stable, setters are stable

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    fetchConfig(user.id);
  }, [authLoading, user, fetchConfig]);

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || accessToken === MASKED_TOKEN)) {
      toast.error('Access Token is required for initial setup');
      return;
    }
    if (config && !tokenEdited) {
      toast.error('Please re-enter your Access Token to save changes');
      return;
    }

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        access_token: accessToken.trim(),
      };

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        return;
      }

      toast.success(
        (data.phone_info as any)?.verified_name
          ? `Connected to ${(data.phone_info as any).verified_name}`
          : 'Configuration saved successfully'
      );
      if (user) await fetchConfig(user.id);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          (payload.phone_info as any)?.verified_name
            ? `Connected to ${(payload.phone_info as any).verified_name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(
          payload.needs_reset ? 'token_corrupted'
            : payload.reason === 'meta_api_error' ? 'meta_api_error'
            : null
        );
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleReset() {
    if (!confirm('This will delete the current WhatsApp config so you can re-enter it. Continue?')) return;
    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast.error((data as any).error || 'Failed to reset configuration');
        return;
      }
      toast.success('Configuration cleared. You can now re-enter your credentials.');
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken(process.env.NEXT_PUBLIC_VERIFY_TOKEN || '');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] mt-4">
      {/* Main config form */}
      <div className="space-y-6">

        {/* Corrupted-token reset banner */}
        {resetReason === 'token_corrupted' && (
          <Alert className="bg-amber-950/40 border-amber-600/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <AlertTitle className="text-amber-200 mb-1">Stored token can&apos;t be decrypted</AlertTitle>
                <AlertDescription className="text-amber-100/80 text-sm">{statusMessage}</AlertDescription>
                <Button
                  onClick={handleReset}
                  disabled={resetting}
                  size="sm"
                  className="mt-3 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? <><Loader2 className="size-4 animate-spin" />Resetting...</> : <><RotateCcw className="size-4" />Reset Configuration</>}
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Connection Status */}
        <Alert className="bg-slate-900 border-slate-700">
          <div className="flex items-center gap-2">
            {connectionStatus === 'connected'
              ? <CheckCircle2 className="size-4 text-violet-500" />
              : <XCircle className="size-4 text-red-500" />}
            <AlertTitle className="text-white mb-0">
              {connectionStatus === 'connected' ? 'Connected' : 'Not Connected'}
            </AlertTitle>
          </div>
          <AlertDescription className="text-slate-400">
            {connectionStatus === 'connected'
              ? 'Your WhatsApp Business API is connected and ready to send/receive messages.'
              : statusMessage || 'Configure your Meta API credentials below to connect your WhatsApp Business account.'}
          </AlertDescription>
        </Alert>

        {/* API Credentials */}
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">API Credentials</CardTitle>
            <CardDescription className="text-slate-400">Enter your Meta WhatsApp Business API credentials.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Phone Number ID</Label>
              <Input
                placeholder="e.g. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">WhatsApp Business Account ID</Label>
              <Input
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Permanent Access Token</Label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder={config ? 'Re-enter token to update' : 'Enter your access token'}
                  value={accessToken}
                  onChange={(e) => { setAccessToken(e.target.value); setTokenEdited(true); }}
                  onFocus={() => { if (accessToken === MASKED_TOKEN) { setAccessToken(''); setTokenEdited(true); } }}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-xs text-slate-500">Token is hidden. Click the field and re-enter it to update.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Webhook Verify Token</Label>
              <Input
                placeholder="e.g. rahul123"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">Must match the Verify Token you entered in Meta webhook settings.</p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook URL */}
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Webhook Configuration</CardTitle>
            <CardDescription className="text-slate-400">Use this URL as your webhook callback in the Meta App Dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-slate-300">Webhook Callback URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="bg-slate-800 border-slate-700 text-slate-300 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyWebhookUrl}
                  className="shrink-0 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Paste into Meta → WhatsApp → Configuration → Webhooks → Callback URL
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
            {saving ? <><Loader2 className="size-4 animate-spin" />Saving...</> : 'Save Configuration'}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || !config}
            className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {testing ? <><Loader2 className="size-4 animate-spin" />Testing...</> : <><Zap className="size-4" />Test API Connection</>}
          </Button>
          {config && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={resetting}
              className="border-red-900 text-red-400 hover:text-red-300 hover:bg-red-950/40"
            >
              {resetting ? <><Loader2 className="size-4 animate-spin" />Resetting...</> : <><RotateCcw className="size-4" />Reset Configuration</>}
            </Button>
          )}
        </div>
      </div>

      {/* Setup Instructions Sidebar */}
      <div>
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Setup Instructions</CardTitle>
            <CardDescription className="text-slate-400">Follow these steps to connect your WhatsApp Business API.</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion>
              <AccordionItem value="step1" className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">1</span>
                    Create a Meta App
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to <span className="text-violet-400">developers.facebook.com</span></li>
                    <li>Click &quot;My Apps&quot; → &quot;Create App&quot;</li>
                    <li>Select &quot;Business&quot; as the app type</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="step2" className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">2</span>
                    Add WhatsApp Product
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>In your app dashboard, click &quot;Add Product&quot;</li>
                    <li>Find &quot;WhatsApp&quot; and click &quot;Set Up&quot;</li>
                    <li>Follow the setup wizard to link your business</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="step3" className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">3</span>
                    Get API Credentials
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to WhatsApp → API Setup</li>
                    <li>Copy your <strong className="text-slate-200">Phone Number ID</strong></li>
                    <li>Copy your <strong className="text-slate-200">WABA ID</strong></li>
                    <li>Generate a <strong className="text-slate-200">Permanent Access Token</strong> from Business Settings → System Users</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="step4" className="border-slate-700">
                <AccordionTrigger className="text-slate-300 hover:text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">4</span>
                    Configure Webhooks
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-slate-400">
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Go to WhatsApp → Configuration</li>
                    <li>Click &quot;Edit&quot; on the Webhook section</li>
                    <li>Paste the <strong className="text-slate-200">Webhook Callback URL</strong> from above</li>
                    <li>Enter the same <strong className="text-slate-200">Verify Token</strong> you set here</li>
                    <li>Subscribe to &quot;messages&quot; webhook field</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Meta WhatsApp API Documentation
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
