import React, { useState, useEffect, useRef } from "react";
import "../styles/govuk-overrides.css";
import { sendChatMessage } from "../api/chat";

// Completely rewritten clean implementation with no reset/clear functionality
const ChatbotWidget = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! I can answer any questions you have about this form or DWP policy." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatPanelRef = useRef(null);

  // Load chat history from localStorage on initial render
  useEffect(() => {
    try {
      const savedMessages = localStorage.getItem('chatHistory');
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
          setMessages(parsedMessages);
        }
      }
    } catch (e) {
      console.error("[CHAT] Error loading chat history:", e);
    }
  }, []);

  // Save chat history to local storage whenever messages change
  useEffect(() => {
    if (messages.length > 1) { // Only save if there's more than the initial message
      try {
        localStorage.setItem('chatHistory', JSON.stringify(messages));
      } catch (e) {
        console.error("[CHAT] Error saving to localStorage:", e);
      }
    }
  }, [messages]);

  // No additional CSS injection needed, using govuk-overrides.css instead

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    const updatedMessages = [...messages, { from: "user", text: userMessage }];
    setMessages(updatedMessages);
    setLoading(true);
    setInput("");

    try {
      // Convert messages to chat history format for the API
      const chatHistory = messages.map(msg => ({
        role: msg.from === "user" ? "user" : "assistant",
        content: msg.text
      }));

      // Make sure all history items have valid roles and content
      const validHistory = chatHistory.filter(item =>
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim().length > 0
      );

      const response = await sendChatMessage(userMessage, validHistory);
      setMessages((msgs) => [...msgs, { from: "bot", text: response }]);

    } catch (error) {
      console.error("[CHAT] Error during chat:", error);
      setMessages((msgs) => [...msgs, {
        from: "bot",
        text: "Sorry, I couldn't get a response. Please try again in a moment."
      }]);
    }

    setLoading(false);
  };

  // No chat clearing functionality as per user's request

  return (
    <div className="govuk-chatbot-widget" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}>
      <button
        className="govuk-button govuk-button--secondary"
        style={{ borderRadius: 24, minWidth: 48, minHeight: 48, padding: 8, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        aria-label="Open help chatbot"
        onClick={() => setOpen((o) => !o)}
        data-safe="true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" style={{ verticalAlign: 'middle' }}>
          <circle cx="12" cy="12" r="11" stroke="#1d70b8" strokeWidth="2" fill="#fff" />
          <path d="M7 10.5C7 9.11929 8.11929 8 9.5 8H14.5C15.8807 8 17 9.11929 17 10.5V13.5C17 14.8807 15.8807 16 14.5 16H10.5L8 18V16H9.5C8.11929 16 7 14.8807 7 13.5V10.5Z" stroke="#1d70b8" strokeWidth="1.5" fill="#fff" />
        </svg>
        Help
      </button>
      {open && (
        <div className="govuk-chatbot-panel govuk-body" ref={chatPanelRef} style={{ width: 320, background: "#fff", border: "1px solid #b1b4b6", borderRadius: 8, boxShadow: "0 2px 8px #0002", padding: 16, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #b1b4b6', paddingBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>FEP Assistant</h3>
            {/* No Reset or Clear Chat buttons here */}
          </div>

          <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 8, width: "100%" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ textAlign: msg.from === "user" ? "right" : "left", margin: "4px 0" }}>
                <span style={{ background: msg.from === "user" ? "#1d70b8" : "#f3f2f1", color: msg.from === "user" ? "#fff" : "#0b0c0c", borderRadius: 12, padding: "6px 12px", display: "inline-block", maxWidth: 280, wordBreak: "break-word" }}>
                  {msg.text}
                </span>
              </div>
            ))}
            {loading && <div className="govuk-body-s" style={{ color: "#6c757d" }}>AI is typing…</div>}
          </div>

          <form onSubmit={handleSend} style={{ width: "100%" }}>
            <input
              className="govuk-input"
              style={{ width: "100%" }}
              type="text"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              aria-label="Type your question"
              data-safe="true"
            />
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatbotWidget;
