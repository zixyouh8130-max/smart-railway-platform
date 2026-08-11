import React, { useState, useRef, useEffect } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import { sendMessage } from '../../services/api';

const ChatContainer = ({ sessionId, onSessionCreated }) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text) => {
    if (!text.trim()) return;

    // Add user message
    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendMessage(text, sessionId);
      
      // Update session ID if new
      if (response.session_id !== sessionId) {
        onSessionCreated(response.session_id);
      }

      // Add assistant message
      const assistantMessage = {
        role: 'assistant',
        content: response.response,
        intent: response.intent,
        sources: response.sources,
        responseTime: response.response_time_ms,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: 'ဝမ်းနည်းပါသည်။ ချိတ်ဆက်မှု ပြဿနာရှိနေပါသည်။ ထပ်မံကြိုးစားပါ။',
        isError: true,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
      <MessageList 
        messages={messages} 
        messagesEndRef={messagesEndRef}
      />
      
      {isLoading && <TypingIndicator />}
      
      <ChatInput 
        onSend={handleSendMessage}
        disabled={isLoading}
      />
    </div>
  );
};

export default ChatContainer;