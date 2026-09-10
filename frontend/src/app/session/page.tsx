'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, CLIPBOARD_BUCKET } from '@/lib/supabase';
import { ArrowLeft, Copy, ShieldCheck, Paperclip, Activity, QrCode } from 'lucide-react';
import ClipboardItem from '@/components/ClipboardItem';
import QRCodeModal from '@/components/QRCodeModal';
import GitHubDropdown from '@/components/GitHubDropdown';

interface ItemType {
  id: string;
  type: 'text' | 'image' | 'file';
  content: string;
  timestamp: string;
  fileName?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function Session() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const [copiedId, setCopiedId] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeUsersCount, setActiveUsersCount] = useState(1);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Resolve session ID from URL parameter (e.g. /session?id=12345678) or sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const queryId = searchParams.get('id') || searchParams.get('code');
      
      let validId: string | null = null;
      if (queryId && /^\d{8}$/.test(queryId)) {
        validId = queryId;
        sessionStorage.setItem('sessionId', validId);
      } else {
        const storedId = sessionStorage.getItem('sessionId');
        if (storedId && /^\d{8}$/.test(storedId)) {
          validId = storedId;
        }
      }

      if (!validId) {
        router.replace('/');
        return;
      }
      setSessionId(validId);
    }
  }, [router]);

  // Subscribe to the realtime channel for this session.
  // The channel exists implicitly the moment any device subscribes to it.
  useEffect(() => {
    if (!sessionId) return;

    const clientId = Math.random().toString(36).substr(2, 9);
    const channel = supabase.channel(`session:${sessionId}`, {
      config: {
        presence: { key: clientId },
      },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'clipboard' }, ({ payload }) => {
        const item = payload as ItemType;
        setItems((prev) => {
          if (prev.some((i) => i.id === item.id)) return prev;
          return [item, ...prev];
        });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setActiveUsersCount(Math.max(1, Object.keys(state).length));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId]);

  const BROADCAST_PAYLOAD_LIMIT = 30 * 1024; // 30KB — Supabase Realtime hard limit is ~32KB

  const broadcastItem = useCallback((newItem: ItemType) => {
    const payloadSize = new TextEncoder().encode(JSON.stringify(newItem)).length;
    if (payloadSize > BROADCAST_PAYLOAD_LIMIT) {
      console.error(
        `Broadcast payload too large (${(payloadSize / 1024).toFixed(1)} KB). ` +
        `Supabase Realtime limit is ~32 KB. Item will NOT sync to other devices.`
      );
      return;
    }
    channelRef.current?.send({
      type: 'broadcast',
      event: 'clipboard',
      payload: newItem,
    });
  }, []);

  // Uploads a blob to Supabase Storage and returns its public URL.
  // Used for images/files since their base64 size would exceed the
  // realtime broadcast payload limit.
  const uploadToStorage = async (blob: Blob, fileName: string): Promise<string> => {
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const path = `${sessionId}/${Date.now()}-${Math.random().toString(36).substr(2, 6)}-${safeName}`;
    const { error } = await supabase.storage.from(CLIPBOARD_BUCKET).upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || undefined,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(CLIPBOARD_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const addTextItem = useCallback((text: string) => {
    if (!text.trim()) return;
    const newItem: ItemType = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'text',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setItems((prev) => [newItem, ...prev]);
    broadcastItem(newItem);
  }, [broadcastItem]);


  const processFile = useCallback(async (file: File) => {
    if (!sessionId) return;
    if (file.size > MAX_FILE_SIZE) {
      alert('File is too large! Maximum size is 5 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    const isImage = file.type.startsWith('image/');
    let contentUrl: string | null = null;

    try {
      contentUrl = await uploadToStorage(file, file.name || 'file');
    } catch (err: any) {
      // Storage upload failed — do NOT fall back to data URLs.
      // Data URLs easily exceed Supabase Realtime's ~32 KB broadcast payload
      // limit, causing the message to be silently dropped on other devices.
      // The sender would see the item locally but no other device would receive it.
      console.error('Supabase storage upload failed:', err);
      const errMsg = err?.message || 'Unknown error';
      alert(
        `Failed to upload file to storage: ${errMsg}\n\n` +
        `Please make sure the "clipboard-uploads" bucket exists in your Supabase project ` +
        `and the storage RLS policies allow public uploads (run supabase_storage_setup.sql).`
      );
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (contentUrl) {
      const newItem: ItemType = {
        id: Math.random().toString(36).substr(2, 9),
        type: isImage ? 'image' : 'file',
        content: contentUrl,
        timestamp: new Date().toISOString(),
        fileName: isImage ? undefined : (file.name || 'shared-file'),
      };
      setItems((prev) => [newItem, ...prev]);
      broadcastItem(newItem);
    } else {
      alert('Failed to get a public URL for the uploaded file. Please try again.');
    }

    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [sessionId, broadcastItem]);

  const handlePaste = useCallback((e: any) => {
    if (!sessionId) return;
    if (e.target?.isContentEditable) {
      e.preventDefault();
    }

    const clipboardData = e.clipboardData || (window as any).clipboardData;
    if (!clipboardData) return;

    const itemsData = clipboardData.items;

    for (let i = 0; i < itemsData.length; i++) {
      const item = itemsData[i];

      if (item.kind === 'file') {
        const blob = item.getAsFile();
        if (!blob) continue;
        void processFile(blob);
      } else if (item.type === 'text/plain') {
        item.getAsString((text: string) => addTextItem(text));
      }
    }
  }, [sessionId, processFile, addTextItem]);

  const handlePasteButtonClick = async () => {
    if (!sessionId) return;
    try {
      if (navigator.clipboard.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          const imageTypes = clipboardItem.types.filter((type) => type.startsWith('image/'));
          if (imageTypes.length > 0) {
            const blob = await clipboardItem.getType(imageTypes[0]);
            const ext = imageTypes[0].split('/')[1] || 'png';
            void processFile(new File([blob], `pasted-image.${ext}`, { type: blob.type }));
            return;
          }

          if (clipboardItem.types.includes('text/plain')) {
            const blob = await clipboardItem.getType('text/plain');
            const text = await blob.text();
            addTextItem(text);
            return;
          }
        }
      } else {
        const text = await navigator.clipboard.readText();
        addTextItem(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      alert('Browser blocked direct access. Please press Ctrl+V anywhere on the page to paste.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  const copySessionId = () => {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (!sessionId) {
    return null;
  }

  return (
    <div 
      className="min-h-screen flex flex-col relative overflow-x-hidden w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center border-4 border-accent border-dashed m-4 rounded-3xl">
          <div className="flex flex-col items-center pointer-events-none text-accent">
            <Paperclip className="w-20 h-20 mb-4 animate-bounce" />
            <h2 className="text-3xl font-bold text-white tracking-widest">DROP FILE TO SHARE</h2>
          </div>
        </div>
      )}

      <header className="glass-panel flex items-center justify-between px-3 py-3 sm:px-6 sm:py-4 sticky top-0 z-10 border-x-0 border-t-0 rounded-none">
        <button
          className="bg-transparent border-none text-gray-400 cursor-pointer p-1.5 sm:p-2 rounded-full transition-all hover:bg-white/10 hover:text-white flex items-center justify-center"
          onClick={() => router.push('/')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <div 
            className="flex items-center gap-1 sm:gap-2 cursor-pointer py-1 px-1.5 sm:py-1.5 sm:px-3 rounded-lg transition-colors hover:bg-white/5"
            onClick={copySessionId}
            title="Click to copy Session ID"
          >
            <span className="text-gray-400 text-sm hidden sm:inline">Session ID</span>
            <div className="bg-accent/15 border border-accent/30 text-accent px-2 py-0.5 sm:px-3 sm:py-1 rounded-full font-mono text-sm sm:text-base md:text-lg tracking-wide flex items-center">
              {sessionId}
              {copiedId ? (
                <ShieldCheck className="w-3.5 h-3.5 text-green-400 ml-1.5 sm:ml-2" />
              ) : (
                <Copy className="w-3.5 h-3.5 ml-1.5 sm:ml-2 opacity-50" />
              )}
            </div>
          </div>

          <button
            onClick={() => setIsQRModalOpen(true)}
            className="flex items-center gap-1 bg-accent/10 border border-accent/30 hover:bg-accent/20 text-accent px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer active:scale-95 shadow-[0_0_10px_rgba(204,255,0,0.15)]"
            title="Show QR Code to share session"
          >
            <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">QR Code</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <GitHubDropdown />

          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/40 border border-glass-border px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-full">
            <div className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-green-500"></span>
            </div>
            <span className="text-[10px] sm:text-xs text-gray-300 font-medium tracking-wide flex items-center gap-1 sm:gap-1.5">
              <Activity className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-green-400" />
              {activeUsersCount} <span className="hidden sm:inline">{activeUsersCount === 1 ? 'Device' : 'Devices'}</span>
            </span>
          </div>
        </div>
      </header>

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        sessionId={sessionId}
      />

      <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full flex flex-col">

        {/* Universal Paste Button - Fixed to bottom */}
        <div className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-black/90 via-black/80 to-transparent z-20 pointer-events-none">
          <div className="max-w-4xl mx-auto relative group pointer-events-auto">
            <div className="absolute inset-0 bg-accent/20 rounded-2xl blur-lg transition-opacity opacity-50 group-hover:opacity-100 active:opacity-100"></div>
            <div className="flex gap-3 relative">
              <button 
                onClick={handlePasteButtonClick}
                disabled={isUploading}
                className="flex-1 glass-panel rounded-2xl p-4 md:p-6 text-center border border-accent/30 flex items-center justify-center min-h-[70px] md:min-h-[90px] transition-all hover:border-accent/60 focus:border-accent/80 focus:shadow-[0_0_20px_var(--tw-colors-accent)] bg-black/40 backdrop-blur-md active:scale-[0.98] cursor-pointer disabled:opacity-60"
              >
                <div className="flex flex-col items-center opacity-90">
                  <div className="flex items-center gap-2 text-lg md:text-xl font-bold text-white tracking-wide">
                    <Copy className="w-5 h-5 md:w-6 md:h-6" />
                    <span>{isUploading ? 'Uploading...' : 'Tap to Paste'}</span>
                  </div>
                  <span className="text-xs md:text-sm text-gray-400 mt-1 hidden sm:inline-block">Instantly paste text or images from clipboard</span>
                </div>
              </button>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-[70px] md:w-[90px] shrink-0 glass-panel rounded-2xl border border-accent/30 flex flex-col items-center justify-center min-h-[70px] md:min-h-[90px] transition-all hover:border-accent/60 hover:bg-white/5 active:scale-[0.95] cursor-pointer bg-black/40 backdrop-blur-md text-gray-400 hover:text-white disabled:opacity-60"
                title="Upload PDF or File"
              >
                <Paperclip className="w-6 h-6 md:w-7 md:h-7 mb-1" />
                <span className="text-[10px] md:text-xs font-semibold uppercase">File</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="*/*" 
                className="hidden" 
              />
            </div>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center text-gray-400 min-h-[40vh] pb-24">
            <div className="w-20 h-20 rounded-full bg-accent/10 border-2 border-accent/20 mb-6 relative animate-pulse-glow">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-accent rounded-full shadow-[0_0_15px_rgba(204,255,0,0.3)]"></div>
            </div>
            <h3 className="text-white text-2xl mb-2">Waiting for clipboard items...</h3>
            <p className="max-w-md">Press <kbd className="bg-white/10 px-2 py-1 rounded text-white text-sm mx-1">Ctrl+V</kbd> anywhere, or use the Paste box below.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 pb-32 md:pb-28">
            {items.map(item => (
              <ClipboardItem key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

      {/* Background glow effects */}
      <div className="absolute top-[-100px] left-[-100px] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(204,255,0,0.15)_0%,transparent_70%)] rounded-full blur-[120px] opacity-40 animate-float pointer-events-none"></div>
      <div className="absolute bottom-[-50px] right-[-50px] w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(204,255,0,0.15)_0%,transparent_70%)] rounded-full blur-[120px] opacity-40 animate-float pointer-events-none" style={{ animationDelay: '-5s' }}></div>
    </div>
  );
}
