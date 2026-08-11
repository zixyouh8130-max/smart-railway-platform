import React from 'react';
import MessageBubble from './MessageBubble';

const MessageList = ({ messages, messagesEndRef }) => {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🚂</div>
          <h2 className="text-2xl font-bold text-gray-700 font-myanmar mb-2">
            မြန်မာ့မီးရထား ဝန်ဆောင်မှု Chatbot
          </h2>
          <p className="text-gray-500 font-myanmar">
            ရထားချိန်၊ လမ်းကြောင်း၊ လက်မှတ်ခ စသည့် သိရှိလိုသည်များကို မေးမြန်းနိုင်ပါသည်။
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => (
        <MessageBubble key={index} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;