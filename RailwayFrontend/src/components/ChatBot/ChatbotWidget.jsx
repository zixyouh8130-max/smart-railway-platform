// frontend/src/components/Chatbot/ChatbotWidget.jsx
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/api/axios';
import { clsx } from 'clsx';

const QUICK_ACTIONS = [
  { text: 'ရထားချိန်ဇယား', icon: '🕐' },
  { text: 'လမ်းကြောင်းများ', icon: '🗺️' },
  { text: 'လက်မှတ်ခနှုန်း', icon: '🎫' },
  { text: 'ရထားအခြေအနေ', icon: '🚂' },
];

export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load session from localStorage
  useEffect(() => {
    const savedSessionId = localStorage.getItem('chatbot_session_id');
    if (savedSessionId) {
      setSessionId(savedSessionId);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;

    const userMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await api.post('/chatbot/send', {
        message: text,
        session_id: sessionId,
        language: 'myanmar',
        use_live_data: true
      });

      if (response.data.session_id) {
        setSessionId(response.data.session_id);
        localStorage.setItem('chatbot_session_id', response.data.session_id);
      }

      const botMessage = {
        role: 'assistant',
        content: response.data.response,
        intent: response.data.intent,
        isLiveData: response.data.is_live_data,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chatbot error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'ဝမ်းနည်းပါသည်။ ချိတ်ဆက်မှု ပြဿနာရှိနေပါသည်။',
        isError: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[380px] h-[550px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">🚂 မီးရထား AI Assistant</h3>
                  <p className="text-blue-100 text-sm">မြန်မာ့မီးရထား ဝန်ဆောင်မှု</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-5xl mb-3">🚂</div>
                  <p className="text-gray-700 font-medium mb-4">
                    မင်္ဂလာပါ! ဘာကူညီပေးရမလဲ?
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {QUICK_ACTIONS.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(action.text)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-full text-sm hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        <span>{action.icon}</span>
                        <span>{action.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={clsx(
                      'max-w-[85%] rounded-2xl px-4 py-2.5',
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : msg.isError
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-white border border-gray-200 shadow-sm'
                    )}
                  >
                    {/* Message Content */}
                    <p className={clsx(
                      'text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user' ? 'text-white' : 'text-gray-800'
                    )}>
                      {msg.content}
                    </p>

                    {/* Live Data Badge */}
                    {msg.isLiveData && (
                      <span className="inline-block mt-1.5 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        📡 Live Data
                      </span>
                    )}

                    {/* Timestamp */}
                    <p className={clsx(
                      'text-[10px] mt-1.5',
                      msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                    )}>
                      {msg.timestamp.toLocaleTimeString('my-MM', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="p-3 bg-white border-t flex-shrink-0">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="မေးခွန်းမေးမြန်းပါ..."
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <Send size={20} />
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}