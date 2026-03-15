import React, { useEffect, useMemo, useRef, useState } from "react";
import API from "../../api"; // axios instance
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faQuestionCircle } from '@fortawesome/free-solid-svg-icons'

// Optional: centralize errors
function toastError(e) {
  const msg = e?.response?.data?.error || e?.message || "Something went wrong";
  console.error("[Chat]", msg);
  // hook in your toast lib if you have one
}

// ---------- Chat Component ----------
export default function OnboardingChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState(null); // { id, prompt, category, type }
  const [progress, setProgress] = useState({ requiredKnown: 0, requiredTotal: 12 });
  const [showHint, setShowHint] = useState(false);

  const startedRef = useRef(false);
  const listRef = useRef(null);

  // Scroll to bottom on new message
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // StrictMode-safe initial fetch
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      setBusy(true);
      try {
        const { data } = await API.get("/onboarding/start");
        // Data shape: { bot: string, question?, progress? }
        const greet = data?.bot ?? "Welcome!";
        setMessages([{ role: "bot", text: greet }, ...(data?.question ? [{ role: "bot", text: data.question.prompt }] : [])]);
        if (data?.question) {
          setQuestion(data.question);
        }
        if (data?.progress) setProgress(data.progress);
      } catch (e) {
        toastError(e);
        setMessages([{ role: "bot", text: "Sorry — I couldn’t start the session." }]);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const placeholder = useMemo(() => {
    if (question?.prompt) return question.prompt;
    return "Type your answer or ask a question…";
  }, [question]);

  async function send(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || busy) return;

    // optimistic add
    setMessages((m) => [...m, { role: "me", text: trimmed }]);
    setInput("");
    setBusy(true);

    try {
      const { data } = await API.post("/onboarding/answer", { answer: trimmed });
      // Expected: { bot, question?, progress? }
      if (data?.bot) {
        setMessages((m) => [...m, { role: "bot", text: data.bot }]);
      }
      if (data?.question !== undefined) {
        setQuestion(data.question); // may be null when complete or answering
      }
      if (data?.progress) setProgress(data.progress);
    } catch (e) {
      toastError(e);
      setMessages((m) => [...m, { role: "bot", text: "Hmm, I couldn’t process that. Try again?" }]);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="container py-4 d-flex flex-column gap-3" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between">
        <h5 className="m-0">OnboardingPilot</h5>
        <ProgressBar known={progress.requiredKnown} total={progress.requiredTotal} />
      </div>

      {/* Chat area */}
      <div
        ref={listRef}
        className="border rounded p-3 d-flex flex-column gap-2"
        style={{ height: "60vh", overflowY: "auto", background: "#0b0c0f0a" }}
      >
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}

        {busy && <TypingBubble />}
      </div>

      {/* Suggested quick actions */}
      <div className="d-flex flex-wrap gap-2">
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => send("summarize")}
          disabled={busy}
        >
          Summarize
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => send("what's next")}
          disabled={busy}
        >
          What’s next?
        </button>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => send("back")}
          disabled={busy}
        >
          Back
        </button>
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={() => send("restart")}
          disabled={busy}
        >
          Restart
        </button>
      </div>

      {/* Input */}
      <div className="d-flex gap-2">
        <textarea
          className="form-control"
          rows={1}
          style={{ resize: "none" }}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={() => send(input)} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>

      {/* Hint below input */}
      {question?.prompt && (
        <small className="text-muted">
          Current question: <em>{question.prompt}</em>
          <div>
            <span onClick={() => setShowHint((prev) => !prev)}>
              Why this question? <FontAwesomeIcon icon={faQuestionCircle}/>
            </span>
            {showHint && <small className="text-muted">
              <br/>I’m asking this to better understand your business and help you craft effective outreach messages. You can also type your own questions about pricing, channels, or scripts.
            </small>}
          </div>
        </small>
      )}
    </div>
  );
}

// ---------- UI bits ----------
function Bubble({ role, text }) {
  const cls =
    role === "me" ? "message-bubble me align-self-end" : "message-bubble bot align-self-start";
  return <div className={cls}>{text}</div>;
}

function TypingBubble() {
  return (
    <div className="message-bubble bot align-self-start" aria-live="polite">
      <span className="me-1">…</span>
      <span className="visually-hidden">Assistant is typing</span>
    </div>
  );
}

function ProgressBar({ known, total }) {
  const pct = total ? Math.round((known / total) * 100) : 0;
  return (
    <div className="d-flex align-items-center gap-2" style={{ minWidth: 180 }}>
      <div className="progress" style={{ width: 130, height: 8 }}>
        <div
          className="progress-bar"
          role="progressbar"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <small className="text-muted">{known}/{total}</small>
    </div>
  );
}