import React from 'react';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser 
          ? 'bg-railway-600 text-white' 
          : message.isError
            ? 'bg-red-100 text-red-700 border border-red-200'
            : 'bg-white border border-gray-200 shadow-sm'
      }`}>
        {/* Message Content */}
        <p className={`font-myanmar text-[15px] leading-relaxed ${
          isUser ? 'text-white' : 'text-gray-800'
        }`}>
          {message.content}
        </p>
        
        {/* Sources (for assistant messages) */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 font-myanmar mb-1">
              ကိုးကားချက်များ:
            </p>
            <div className="flex flex-wrap gap-1">
              {message.sources.map((source, idx) => (
                <span 
                  key={idx}
                  className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                >
                  {source.title || source.category}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Timestamp */}
        <p className={`text-[10px] mt-1 ${
          isUser ? 'text-blue-100' : 'text-gray-400'
        }`}>
          {new Date(message.timestamp).toLocaleTimeString('my-MM')}
        </p>
      </div>
    </div>
  );
};

export default MessageBubble;