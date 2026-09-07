# KP — AI Rules and Data Integrity Principles

Version: 0.1.0
Last Updated: 2026-09-07

---

## Core Integrity Rules

These rules govern all AI, prediction, and data components in KP.
Violation of any rule is a critical defect.

### Data Rules

1. Never fabricate market data.
2. Never fabricate historical prices.
3. Never fabricate trading volume.
4. Never fabricate fundamentals.
5. Never fabricate news or sentiment.
6. Never fabricate F&O data.
7. Never silently fall back to mock/synthetic data in production.
8. Never label delayed data as real-time.
9. Never claim 0 ms latency.
10. Always clearly show: LIVE / DELAYED / STALE / UNAVAILABLE.

### Prediction Rules

11. Never hard-code BUY/SELL signals.
12. Never claim guaranteed profit.
13. Never claim 100% prediction accuracy.
14. Never use future information during historical model training or evaluation.
15. Never hide failed predictions.
16. Never hide model weaknesses.
17. Never hide data quality problems.
18. Never present cherry-picked performance metrics.
19. Always show measured out-of-sample performance, not targets.
20. Always show prediction confidence and trust separately.

### Model Rules

21. Every prediction must reference: model_version, feature_version, data_version.
22. Every prediction must be reproducible from its stored input snapshot.
23. Models must be walk-forward validated, never randomly shuffled for temporal data.
24. Survivorship bias must be accounted for in historical universe analysis.
25. Model leaderboard rankings must be based on actual measured performance.
26. AI self-critique must be based on statistical failure analysis, not fabricated explanations.

### AI Assistant Rules

27. The LLM must never be the numeric source of truth for prices, predictions, or performance.
28. The LLM must never invent market data.
29. If reliable data is unavailable, the assistant must say: "KP does not currently have reliable data for this request."
30. All quantitative values shown in the assistant's response must come from KP's structured backend.

### Security Rules

31. Never commit secrets, API keys, passwords, or credentials to Git.
32. All secrets must be managed via environment variables.
33. All inputs must be validated before processing.
34. All audit logs must be immutable.

### Infrastructure Rules

35. No machine-specific absolute paths in source code.
36. All paths must use configurable environment variables.
37. Scheduled jobs must be documented and reproducible, not hidden in personal cron/Task Scheduler.
38. The project must work on another compatible computer after: clone → configure .env → setup → start.

---

## Terminology

| Term | Meaning |
|---|---|
| LIVE | Data received within the current valid market session with confirmed timestamp |
| DELAYED | Data confirmed to be delayed (e.g., 15-minute delayed feed) |
| STALE | Data not updated within expected refresh window |
| UNAVAILABLE | Data source unreachable or not configured |
| SUSPENDED | Instrument suspended by exchange |
| MARKET CLOSED | Outside trading session |

---

## Prediction Outputs

KP prediction signals: BUY / HOLD / SELL / WAIT

WAIT is a valid and important output.
KP must be allowed to say "no trade" when evidence is insufficient.

Every signal must include:
- confidence (0–1)
- trust score (0–1)
- horizon
- expected movement range
- risk assessment
- model consensus
- data quality score
- Prediction DNA ID

---

## Prohibited Patterns

| Pattern | Why Prohibited |
|---|---|
| `signal = "BUY"` (hard-coded) | Fabricated prediction |
| `accuracy = 0.95` (hard-coded) | Fabricated metric |
| `return fake_price()` in production | Fabricated data |
| `latency_ms = 0` (hard-coded) | False claim |
| Training on test period data | Data leakage |
| Random shuffle of time-series | Look-ahead bias |
| Ignoring delisted stocks | Survivorship bias |
| Overwriting failed predictions | History manipulation |

---

*These rules are non-negotiable and apply to every KP contributor, agent, and automated system.*
