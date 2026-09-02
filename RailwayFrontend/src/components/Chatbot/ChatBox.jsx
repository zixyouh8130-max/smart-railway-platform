import { useState } from "react";
import ReactMarkdown from "react-markdown";
import api from "../api/axios";

export default function ChatBox() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = {
      role: "user",
      text: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await api.post("/chat", {
        message: input,
      });

      const botMessage = {
        role: "assistant",
        text: response.data.answer,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, something went wrong. Please try again.",
        },
      ]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 border rounded-lg p-4">
      <div className="h-96 overflow-y-auto border rounded p-3 mb-3">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-3 flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={
                msg.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-md bg-blue-500 px-4 py-3 text-white"
                  : "max-w-[90%] rounded-2xl rounded-bl-md bg-white border border-gray-200 px-4 py-3 text-gray-700 shadow-sm"
              }
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-3 last:mb-0 leading-relaxed">
                        {children}
                      </p>
                    ),

                    strong: ({ children }) => (
                      <strong className="font-semibold text-gray-900">
                        {children}
                      </strong>
                    ),

                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 mb-3 space-y-1">
                        {children}
                      </ul>
                    ),

                    ol: ({ children }) => (
                      <ol className="list-decimal pl-5 mb-3 space-y-1">
                        {children}
                      </ol>
                    ),

                    li: ({ children }) => (
                      <li className="leading-relaxed">
                        {children}
                      </li>
                    ),

                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold mb-2">
                        {children}
                      </h1>
                    ),

                    h2: ({ children }) => (
                      <h2 className="text-base font-bold mb-2">
                        {children}
                      </h2>
                    ),

                    h3: ({ children }) => (
                      <h3 className="text-sm font-bold mb-1">
                        {children}
                      </h3>
                    ),

                    code: ({ children }) => (
                      <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">
                        {children}
                      </code>
                    ),
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              ) : (
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
        />

        <button
          className="bg-blue-500 text-white px-4 rounded"
          onClick={sendMessage}
        >
          Send
        </button>
      </div>
    </div>
  );
}