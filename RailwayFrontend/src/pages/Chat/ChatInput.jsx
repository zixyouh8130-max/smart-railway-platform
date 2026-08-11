import React, { useState, useRef, useEffect } from 'react';

const QUICK_REPLIES = [
  { text: 'အချိန်ဇယား', icon: '🕐' },
  { text: 'လမ်းကြောင်း', icon: '🗺️' },
  { text: 'လက်မှတ်ခ', icon: '🎫' },
  { text: 'ရထားအခြေအနေ', icon: '🚂' },
];

const ChatInput = ({ onSend, disabled }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t bg-white p-4">
      {/* Quick Replies */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply.text}
            onClick={() => onSend(reply.text)}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 
                     hover:bg-gray-200 rounded-full text-sm font-myanmar
                     transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <span>{reply.icon}</span>
            <span>{reply.text}</span>
          </button>
        ))}
      </div>
      
      {/* Input Area */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ရထားနှင့်ပတ်သက်သော မေးခွန်းများ မေးမြန်းပါ..."
            className="w-full p-3 pr-12 border border-gray-300 rounded-xl 
                     resize-none focus:ring-2 focus:ring-railway-500 
                     focus:border-transparent font-myanmar text-[15px]
                     leading-relaxed placeholder-gray-400"
            rows={1}
            disabled={disabled}
          />
        </div>
        
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="px-6 py-3 bg-railway-600 text-white rounded-xl 
                   hover:bg-railway-700 disabled:opacity-50 
                   disabled:cursor-not-allowed transition-colors
                   font-myanmar font-medium self-end"
        >
          ပို့မည်
        </button>
      </form>
    </div>
  );
};

export default ChatInput;