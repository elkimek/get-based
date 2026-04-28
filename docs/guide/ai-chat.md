# AI Chat

The AI Chat panel lets you have a conversation about your lab results with an AI that already knows everything about your data — your biomarker history, lifestyle context, supplements, notes, and health goals.

## Opening the Chat

Click the **chat bubble** in the bottom-right corner of the screen to slide the chat panel open. You can also click the **Ask AI** button in the header. Press **Escape** to close it.

::: tip Chat FAB
The floating chat bubble (FAB) is always visible in the bottom-right corner, giving you one-tap access to the AI from any screen.
:::

## Layout: side-by-side or fullscreen

When the chat panel is open, the dashboard automatically shifts left to fit alongside it — every chart and section stays visible, scroll and clicks work as normal. You can keep the conversation open while you cross-reference markers, edit context cards, or browse the sidebar.

Click the **⛶ button** in the chat header to expand the panel to the full viewport when you want an immersive conversation. Click it again to return to the side-by-side layout. Your preference is remembered between sessions.

## Setup Guide

If no AI provider is configured, the chat panel shows a setup guide instead of the conversation view. The guide explains your provider options and includes a **Connect with OpenRouter** button for one-click OAuth setup — no API key needed. Once connected, the chat is ready immediately.

## What the AI Knows

Every message you send includes a full snapshot of your data:

- All lab values across every draw date, with reference ranges and trend direction
- Your nine [Context Cards](/guide/context-cards) (diet, sleep, exercise, environment, etc.)
- Your [Interpretive Lens](/guide/interpretive-lens) and [Health Goals](/guide/health-goals)
- Your supplements and their date ranges
- A timestamped change timeline for context cards (diet changes, stress level shifts, etc.) so the AI can correlate lifestyle changes with lab trends
- Your notes
- For female profiles: menstrual cycle data and phase context

You do not need to paste your results into the chat. Just ask your question.

## Active Model Display

The chat header shows the name of your currently active AI model, so you always know which model is responding. Each message also includes a cost footnote showing the estimated token cost for that exchange.

## Personalities

The AI adopts a personality that shapes its communication style. Choose from three:

### Default
A clear, evidence-informed tone. Explains markers plainly, notes trends, and flags concerns without drama.

### House
Takes on the style of a sharp, skeptical clinician who asks uncomfortable questions. Pushes back on assumptions and digs for root causes.

### Custom
Create your own persona. Type a name in the custom personality field and click **Generate** — the AI will create a full personality profile for that persona, including communication style, analytical approach, and philosophical lens. You can edit the generated text before saving.

The **Enforce evidence-based accuracy** option (off by default) adds a strict disclaimer to the AI's instructions, keeping responses grounded in published research rather than speculation.

::: tip
Custom personalities are saved per profile and persist across sessions. You can create a persona based on a specific medical philosophy, a fictional doctor character, or any style that makes conversations more useful for you.
:::

## Conversation Threads

The chat panel includes a **thread rail** on the left side — a list of your past conversations. Each thread is named automatically from your first message, and you can rename any thread by clicking its name.

- Start a new conversation at any time
- Switch between threads without losing history
- Up to 50 threads are stored per profile; the oldest are pruned automatically

On mobile, tap the hamburger icon in the chat header to open the thread list, and use the back button to return to the conversation.

## Image Attachments

You can attach images to chat messages — photos of lab reports, supplement labels, food logs, skin conditions, or anything else you want the AI to see.

**How to attach:**
- Click the **paperclip** button in the chat input area
- **Paste** an image from your clipboard (Ctrl+V / Cmd+V)
- **Drag and drop** an image file onto the chat input

Up to 5 images per message. Supported formats: JPEG, PNG, GIF, WebP.

### HD Mode

The **HD** button next to the paperclip toggles between standard (1024px) and high-resolution (2048px) image quality. HD mode preserves more detail but uses more tokens. Standard mode is usually sufficient for lab reports and supplement labels; use HD for fine print or detailed photos.

### Quality Warnings

Before sending, getbased analyzes each image and warns you if it detects issues:
- **Blurry** — try holding steady or tapping to focus
- **Too dark** — try better lighting
- **Overexposed** — try less direct light
- **Low resolution** — the AI may struggle with fine details

These checks save tokens by catching bad photos before they're sent.

### Privacy

All image metadata is automatically stripped before sending. EXIF data — GPS location, camera model, timestamps, device serial numbers — is removed during the resize step. Only raw pixel data reaches your AI provider.

::: tip
The attach and HD buttons only appear when your active model supports vision (image input). If you don't see them, switch to a vision-capable model in Settings.
:::

## Web Search

The **Web** toggle in the chat header lets the AI search the internet before responding. This is useful for questions about recent studies, drug interactions, supplement research, or anything where up-to-date information matters.

Toggle it on, ask your question, and the AI will pull in current web results alongside your lab context.

::: warning Higher cost
Web search injects search results into the AI's context, significantly increasing input tokens. Expect messages to cost 2–4x more than normal. The cost footnote shows a 🌐 web indicator when search was active.
:::

::: tip Availability
Web search is available with **OpenRouter**, **PPQ**, and **Venice**. The toggle is hidden when using other providers.
:::

## Per-Marker AI Explanations

From any marker's detail view (click a marker name in the sidebar or on the dashboard), you will find an **Ask AI** button. This opens a pre-populated chat asking the AI to explain that specific marker in the context of your results — without you having to type anything.

## Markdown Responses

The AI's responses are rendered with full markdown formatting:

- Headings, bold, and italic text
- Bullet and numbered lists
- Code blocks and inline code
- Clickable links

Responses stream in smoothly as the AI generates them, with a typewriter effect that trickles text at a steady rate for a pleasant reading experience.

## Token Costs and What to Expect

Every chat message sends your full lab context + conversation history to the AI. Here's what makes up the token count:

| Component | Typical size | Notes |
|---|---|---|
| System prompt | ~1,300 tokens | Fixed — personality instructions, rules |
| Lab context | 2,000–15,000 tokens | Scales with number of draw dates, markers, and filled context cards |
| Conversation history | 0–10,000+ tokens | Last 30 messages (both yours and AI responses) |
| Image (current message only) | 1,000–5,000 tokens per image | Only attached to the message being sent, not stored in history |
| **Total input per message** | **~3,000–25,000+ tokens** | |

### What drives the cost up

- **More draw dates** — each date adds values to every marker. 2 dates ≈ 3k lab context; 8+ dates ≈ 10k+
- **Filled context cards** — each of the 9 lifestyle cards adds 50–300 tokens when filled
- **Long conversations** — AI responses are often 300–800 tokens each. After 10 back-and-forth exchanges, history alone can be 5k–8k tokens
- **Images** — a single standard-quality image adds ~1,500–3,000 input tokens. HD images cost more. Images are only sent with the current message, never re-sent in history
- **Web search** — when the Web toggle is on, search results are injected into the context, adding thousands of tokens. Expect 2–4x the normal cost per message

### Realistic cost examples

Using Claude Sonnet 4 via OpenRouter (~$3/$15 per 1M input/output tokens):

| Scenario | Input tokens | Output tokens | Cost per message |
|---|---|---|---|
| First message, 2 draw dates, no images | ~4,000 | ~500 | ~$0.02 |
| Mid-conversation (10 messages), 4 draw dates, all cards filled | ~15,000 | ~600 | ~$0.05 |
| Long conversation (20+ messages), 8 draw dates, 1 image | ~25,000 | ~800 | ~$0.09 |
| Discuss mode (2 personas, 3 rounds each) | ~20,000 × 6 | ~600 × 6 | ~$0.40 total |

::: tip Cost-saving tips
- **Start new threads** — click "New Chat" to reset conversation history to zero. This is the single biggest cost saver
- **Use standard image mode** (not HD) unless you need fine detail
- **Local AI is free** — run Ollama or LM Studio locally for unlimited chat at zero cost
- **Venice** offers free-tier models with no per-token charges
:::

### Each message shows its cost

Every AI response includes a footnote showing the model name, estimated cost, and total token count — so you always know exactly what you're spending.

## Knowledge Base grounding

If you've set up a **Knowledge Base** (via the *Connect a knowledge base* CTA on the dashboard, or by clicking the 📚 row once configured) — either the in-browser backend or an external server running `lens serve` — the chat automatically grounds its answers in the most relevant passages from your documents. A small badge appears in the chat header when this is active, showing the library name that's feeding answers.

The chat fetches the top-K passages per question (default 5, configurable 1–10) and folds them into the AI's context before the response streams. The AI cites them inline when relevant. See [Interpretive Lens](/guide/interpretive-lens) for setup.

## Choosing a Provider

The AI chat works with any of the six supported providers: OpenRouter, Routstr, PPQ, Venice, Local AI, or Custom (any OpenAI-compatible endpoint). See [AI Providers](/guide/ai-providers) to configure your key or local server. The chat is not available until a provider is set up.

::: warning
Conversations are stored locally in your browser and encrypted if you have set a passphrase. The last 30 messages from each conversation are sent to the AI provider with every request to maintain context. Your provider's privacy policy applies to that data.
:::
