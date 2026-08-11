import { useState } from "react";
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

    const response = await api.post("/chat", {
      message: input,
    });

    const botMessage = {
      role: "assistant",
      text: response.data.answer,
    };

    setMessages((prev) => [...prev, botMessage]);

    setInput("");
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 border rounded-lg p-4">
      <div className="h-96 overflow-y-auto border rounded p-3 mb-3">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 ${
              msg.role === "user" ? "text-right" : "text-left"
            }`}
          >
            <span
              className={`inline-block px-3 py-2 rounded-lg ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200"
              }`}
            >
              {msg.text}
            </span>
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
            if (e.key === "Enter") sendMessage();
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