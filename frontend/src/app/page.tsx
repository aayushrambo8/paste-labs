'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ArrowRight, Zap, Type, Image as ImageIcon, File } from 'lucide-react';
import GitHubDropdown from '@/components/GitHubDropdown';

export default function Landing() {
  const [sessionId, setSessionId] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const queryId = searchParams.get('id') || searchParams.get('code');
      if (queryId && /^\d{8}$/.test(queryId)) {
        sessionStorage.setItem('sessionId', queryId);
        router.replace(`/session?id=${queryId}`);
      }
    }
  }, [router]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = sessionId.trim();
    if (cleanId.length === 8) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('sessionId', cleanId);
      }
      router.push('/session');
    } else {
      alert("Please enter a valid 8-digit session ID.");
    }
  };

  const handleCreate = () => {
    // No backend write needed: the session "exists" the moment a device
    // subscribes to its realtime channel. Just mint an ID and go.
    const randomId = Math.floor(10000000 + Math.random() * 90000000).toString();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('sessionId', randomId);
    }
    router.push('/session');
  };

  return (
    <div className="relative flex justify-center items-center min-h-screen p-4 md:p-5 overflow-x-hidden w-full">
      <div className="absolute top-4 right-4 z-20">
        <GitHubDropdown />
      </div>

      <div className="glass-panel p-5 sm:p-6 md:p-12 text-center max-w-lg w-full rounded-3xl animate-[slideUp_0.6s_cubic-bezier(0.16,1,0.3,1)] z-10">
        <div className="inline-flex p-4 md:p-5 rounded-2xl bg-accent/10 border border-accent/20 mb-6">
          <Zap className="text-accent w-10 h-10 md:w-12 md:h-12" />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-br from-white to-indigo-300 bg-clip-text text-transparent">
          Paste Labs
        </h1>
        <p className="text-gray-400 text-base md:text-lg mb-6 leading-relaxed">
          Seamlessly sync your clipboard across devices in real-time.
        </p>
        
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs md:text-sm font-semibold tracking-wide border border-accent/20">
            <Type className="w-4 h-4" /> Text
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs md:text-sm font-semibold tracking-wide border border-accent/20">
            <ImageIcon className="w-4 h-4" /> Images
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs md:text-sm font-semibold tracking-wide border border-accent/20">
            <File className="w-4 h-4" /> Files <span className="opacity-70 normal-case text-[10px] md:text-xs ml-0.5">(up to 5MB)</span>
          </div>
        </div>

        <div className="bg-black/20 border border-glass-border rounded-xl p-4 mb-8 md:mb-10 text-sm md:text-base text-gray-300 text-left">
          <p className="mb-2"><span className="text-accent font-semibold">1.</span> Create a new session or join an existing one.</p>
          <p className="mb-2"><span className="text-accent font-semibold">2.</span> Open this website on any other device (like your phone).</p>
          <p><span className="text-accent font-semibold">3.</span> Enter the 8-digit Session ID to instantly share your clipboard!</p>
        </div>
        
        <div className="flex flex-col gap-4 md:gap-5">
          <button 
            onClick={handleCreate}
            className="flex items-center justify-center gap-2 w-full p-4 rounded-xl font-medium bg-accent text-black shadow-[0_0_15px_rgba(204,255,0,0.2)] hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            <Copy className="w-5 h-5" />
            <span>Create New Session</span>
          </button>
          
          <div className="flex items-center text-gray-500 text-sm">
            <div className="flex-1 border-b border-glass-border"></div>
            <span className="px-4">OR</span>
            <div className="flex-1 border-b border-glass-border"></div>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              placeholder="Enter 8-digit ID" 
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
              className="flex-1 bg-black/20 border border-glass-border rounded-xl px-4 py-3 text-white text-base md:text-lg outline-none transition-colors text-center tracking-widest focus:border-accent"
              maxLength={8}
            />
            <button 
              type="submit" 
              disabled={sessionId.length !== 8}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium bg-glass border border-glass-border text-white hover:bg-white/10 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <span>Join</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
      
      {/* Background glow effects */}
      <div className="absolute top-[-100px] left-[-100px] w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(204,255,0,0.15)_0%,transparent_70%)] rounded-full blur-[120px] opacity-40 animate-float pointer-events-none"></div>
      <div className="absolute bottom-[-50px] right-[-50px] w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(204,255,0,0.15)_0%,transparent_70%)] rounded-full blur-[120px] opacity-40 animate-float pointer-events-none" style={{ animationDelay: '-5s' }}></div>
    </div>
  );
}
