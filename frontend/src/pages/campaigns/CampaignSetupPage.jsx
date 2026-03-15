import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../../api";

function toastError(e) {
  const msg = e?.response?.data?.error || e?.message || "Something went wrong";
  console.error("[CampaignSetup]", msg);
}

export default function CampaignSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState(null);
  const [progress, setProgress] = useState({ requiredKnown: 0, requiredTotal: 6 });
  const [campaign, setCampaign] = useState(null);

  const startedRef = useRef(false);
  const listRef = useRef(null);
  const historyRef = useRef([]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  // Initial fetch
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      setBusy(true);
      try {
        const { data } = await API.get(`/campaigns/${id}/chat`);
        const greet = data?.bot ?? "Let's set up your campaign.";
        const msgs = [{ role: "bot", text: greet }];
        if (data?.question) msgs.push({ role: "bot", text: data.question.prompt });
        setMessages(msgs);
        if (data?.question) setQuestion(data.question);
        if (data?.progress) setProgress(data.progress);
      } catch (e) {
        toastError(e);
        setMessages([{ role: "bot", text: "Couldn't load campaign. Please try again." }]);
      } finally {
        setBusy(false);
      }
    })();
  }, [id]);

  const placeholder = useMemo(() => {
    if (question?.prompt) return question.prompt;
    return "Type your answer…";
  }, [question]);

  async function send(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || busy) return;

    setMessages((m) => [...m, { role: "me", text: trimmed }]);
    setInput("");
    setBusy(true);

    // Track history for context
    historyRef.current = [
      ...historyRef.current.slice(-5),
      { role: "user", text: trimmed },
    ];

    try {
      const { data } = await API.post(`/campaigns/${id}/chat`, {
        message: trimmed,
        history: historyRef.current,
      });

      if (data?.bot) {
        setMessages((m) => [...m, { role: "bot", text: data.bot }]);
        historyRef.current = [
          ...historyRef.current.slice(-5),
          { role: "assistant", text: data.bot },
        ];
      }
      if (data?.question !== undefined) setQuestion(data.question);
      if (data?.progress) setProgress(data.progress);
      if (data?.campaign) setCampaign(data.campaign);
    } catch (e) {
      toastError(e);
      setMessages((m) => [...m, { role: "bot", text: "Hmm, couldn't process that. Try again?" }]);
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

  const isComplete = progress.requiredKnown === progress.requiredTotal;

  return (
    <div className="container py-4 d-flex flex-column gap-3" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/campaigns")}>
            &larr; Campaigns
          </button>
          <h5 className="m-0">Campaign Setup</h5>
        </div>
        <ProgressBar known={progress.requiredKnown} total={progress.requiredTotal} />
      </div>

      {/* Chat area */}
      <div
        ref={listRef}
        className="border rounded p-3 d-flex flex-column gap-2"
        style={{ height: "55vh", overflowY: "auto", background: "#0b0c0f0a" }}
      >
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {busy && <TypingBubble />}
      </div>

      {/* Quick actions */}
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => send("summarize")} disabled={busy}>
          Summarize
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => send("what's next")} disabled={busy}>
          What's next?
        </button>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => send("back")} disabled={busy}>
          Back
        </button>
        <button className="btn btn-sm btn-outline-danger" onClick={() => send("restart")} disabled={busy}>
          Restart
        </button>
        {isComplete && (
          <button
            className="btn btn-sm btn-success ms-auto"
            onClick={() => navigate("/campaigns")}
          >
            Done — Go to Campaigns
          </button>
        )}
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

      {/* Current question hint */}
      {question?.prompt && (
        <small className="text-muted">
          Current question: <em>{question.prompt}</em>
        </small>
      )}
    </div>
  );
}

// ── UI Components ──

function Bubble({ role, text }) {
  const cls = role === "me"
    ? "message-bubble me align-self-end"
    : "message-bubble bot align-self-start";
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
