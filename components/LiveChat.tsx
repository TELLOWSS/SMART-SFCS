
import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle, X, User, Shield, Hammer } from 'lucide-react';
import { subscribeToChat, sendChatMessage } from '../services/firebaseService';
import { ChatMessage, UserRole } from '../types';

interface LiveChatProps {
  currentUserRole: UserRole;
  isOpen: boolean;
  onClose: () => void;
}

const LiveChat: React.FC<LiveChatProps> = ({ currentUserRole, isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
        const unsubscribe = subscribeToChat((msgs) => {
            setMessages(msgs);
            scrollToBottom();
        });
        return () => unsubscribe();
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const newMsg = {
        text: inputText,
        userRole: currentUserRole,
        timestamp: Date.now(),
        senderName: currentUserRole // 추후 닉네임 기능 확장 가능
    };

    setInputText("");
    await sendChatMessage(newMsg);
  };

  const getRoleIcon = (role: UserRole) => {
      switch(role) {
          case UserRole.ADMIN: return <Shield className="w-3 h-3 text-blue-400" />;
          case UserRole.CREATOR: return <Shield className="w-3 h-3 text-purple-400" />;
          default: return <Hammer className="w-3 h-3 text-slate-400" />;
      }
  };

  const getRoleColor = (role: UserRole) => {
    switch(role) {
        case UserRole.ADMIN: return 'bg-blue-900/50 border-blue-700/50 text-blue-100';
        case UserRole.CREATOR: return 'bg-purple-900/50 border-purple-700/50 text-purple-100';
        default: return 'bg-slate-700/50 border-slate-600/50 text-slate-200';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 w-80 md:w-96 h-[500px] bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden z-[400] animate-scale-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
        <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <h3 className="font-black text-white text-sm">현장 실시간 소통</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-900">
        {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                <MessageCircle className="w-8 h-8 opacity-20" />
                <p className="text-xs font-medium">대화 내역이 없습니다.</p>
            </div>
        )}
        {messages.map((msg) => {
            const isMe = msg.userRole === currentUserRole; // 단순 역할 비교 (실제론 ID 필요하지만 현재 구조상 역할로 구분)
            return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-1 mb-1 px-1">
                        {getRoleIcon(msg.userRole)}
                        <span className="text-[10px] text-slate-400 font-bold">{msg.userRole}</span>
                        <span className="text-[9px] text-slate-600">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed font-medium border ${isMe ? 'bg-brand-primary text-white border-blue-500 rounded-tr-none' : getRoleColor(msg.userRole) + ' rounded-tl-none'}`}>
                        {msg.text}
                    </div>
                </div>
            );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
        <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="메시지 입력..."
            className="flex-1 bg-slate-800 border-none rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:ring-2 focus:ring-brand-primary outline-none"
        />
        <button 
            type="submit" 
            disabled={!inputText.trim()}
            className="p-2.5 bg-brand-primary text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default LiveChat;
